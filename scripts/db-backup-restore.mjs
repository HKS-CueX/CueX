#!/usr/bin/env node
/**
 * SQLite Backup, Restore, Verification & Self-Test Utility for CueX Next.
 * Uses Node built-in `node:sqlite` (DatabaseSync + VACUUM INTO) with SHA-256 verification.
 *
 * Usage:
 *   node scripts/db-backup-restore.mjs backup  --db <path> --out <backup.db>
 *   node scripts/db-backup-restore.mjs restore --backup <backup.db> --db <path>
 *   node scripts/db-backup-restore.mjs verify  --db <path>
 *   node scripts/db-backup-restore.mjs --self-test
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function escapeSqlLiteral(val) {
  return `'${val.replace(/'/g, "''")}'`;
}

export function verifySqliteDatabase(dbPath) {
  if (!existsSync(dbPath)) {
    throw new Error(`Database file does not exist: ${dbPath}`);
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const check = db.prepare('PRAGMA integrity_check').get();
    if (!check || check.integrity_check !== 'ok') {
      throw new Error(`SQLite integrity_check failed: ${JSON.stringify(check)}`);
    }
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => r.name);
    const counts = {};
    for (const table of tables) {
      const row = db.prepare(`SELECT COUNT(*) AS cnt FROM "${table}"`).get();
      counts[table] = Number(row?.cnt ?? 0);
    }
    return { ok: true, dbPath, tables, counts };
  } finally {
    db.close();
  }
}

export function backupSqliteDatabase(dbPath, outPath) {
  if (!existsSync(dbPath)) {
    throw new Error(`Source database does not exist: ${dbPath}`);
  }
  mkdirSync(path.dirname(outPath), { recursive: true });
  const tmpOut = `${outPath}.${process.pid}.${Date.now()}.tmp`;
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    db.exec(`VACUUM INTO ${escapeSqlLiteral(tmpOut)}`);
  } finally {
    db.close();
  }
  renameSync(tmpOut, outPath);
  const checksum = sha256File(outPath);
  const summary = verifySqliteDatabase(outPath);
  const manifestPath = `${outPath}.sha256.json`;
  const manifest = {
    createdAt: new Date().toISOString(),
    backupFile: path.basename(outPath),
    sha256: checksum,
    counts: summary.counts,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return { backupPath: outPath, manifestPath, checksum, counts: summary.counts };
}

export function restoreSqliteDatabase(backupPath, targetDbPath) {
  const verified = verifySqliteDatabase(backupPath);
  const manifestPath = `${backupPath}.sha256.json`;
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const actualSha = sha256File(backupPath);
    if (manifest.sha256 && manifest.sha256 !== actualSha) {
      throw new Error(`Backup checksum mismatch: expected ${manifest.sha256}, got ${actualSha}`);
    }
  }
  mkdirSync(path.dirname(targetDbPath), { recursive: true });
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(`${targetDbPath}${suffix}`)) {
      unlinkSync(`${targetDbPath}${suffix}`);
    }
  }
  const tmpTarget = `${targetDbPath}.${process.pid}.${Date.now()}.restore.tmp`;
  copyFileSync(backupPath, tmpTarget);
  renameSync(tmpTarget, targetDbPath);
  return { restoredTo: targetDbPath, counts: verified.counts };
}

function runSelfTest() {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cuex-db-backup-test-'));
  try {
    const srcDb = path.join(tmpDir, 'source.db');
    const bakDb = path.join(tmpDir, 'backups', 'cuex-bak.db');
    const restoredDb = path.join(tmpDir, 'restored', 'cuex.db');

    const db = new DatabaseSync(srcDb);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('CREATE TABLE sample_items (id TEXT PRIMARY KEY, val TEXT NOT NULL);');
    db.prepare('INSERT INTO sample_items (id, val) VALUES (?, ?)').run('row_1', 'cuex-verified');
    db.close();

    const bak = backupSqliteDatabase(srcDb, bakDb);
    assert.ok(existsSync(bak.backupPath));
    assert.equal(bak.counts.sample_items, 1);

    const rest = restoreSqliteDatabase(bakDb, restoredDb);
    assert.equal(rest.counts.sample_items, 1);

    const check = verifySqliteDatabase(restoredDb);
    assert.equal(check.ok, true);
    assert.equal(check.counts.sample_items, 1);
    console.log(JSON.stringify({ selfTest: 'passed', checksum: bak.checksum, counts: check.counts }));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isCli) {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
  } else {
    const cmd = process.argv[2];
    const defaultDb = path.resolve(process.cwd(), '.cuex-runtime', 'cuex.db');
    if (cmd === 'backup') {
      const dbPath = path.resolve(argValue('--db', defaultDb));
      const outPath = path.resolve(
        argValue(
          '--out',
          path.join(path.dirname(dbPath), 'backups', `cuex-${new Date().toISOString().replace(/[:.]/g, '-')}.db`),
        ),
      );
      console.log(JSON.stringify(backupSqliteDatabase(dbPath, outPath), null, 2));
    } else if (cmd === 'restore') {
      const backupPath = argValue('--backup', '');
      if (!backupPath) throw new Error('--backup <path> is required');
      const dbPath = path.resolve(argValue('--db', defaultDb));
      console.log(JSON.stringify(restoreSqliteDatabase(path.resolve(backupPath), dbPath), null, 2));
    } else if (cmd === 'verify') {
      const dbPath = path.resolve(argValue('--db', defaultDb));
      console.log(JSON.stringify(verifySqliteDatabase(dbPath), null, 2));
    } else {
      console.error('Usage: node scripts/db-backup-restore.mjs <backup|restore|verify|--self-test>');
      process.exitCode = 1;
    }
  }
}
