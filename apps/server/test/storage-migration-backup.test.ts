import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { PACK_SCHEMA_VERSION } from '@cuex/protocol';
import { loadServerConfig } from '../src/config';
import { CueXGatewayServer } from '../src/gateway/GatewayServer';
import { SqliteRepository } from '../src/storage';

test('SqliteRepository enables WAL & foreign keys, runs versioned migrations, and migrates legacy v1 JSON with backups idempotently', () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cuex-mig-test-'));
  const packsDir = path.join(tmpDir, 'packs');
  const memoryDir = path.join(tmpDir, 'memory');
  mkdirSync(packsDir, { recursive: true });
  mkdirSync(memoryDir, { recursive: true });

  // Write legacy v1 JSON files without schemaVersion and with epoch timestamps.
  writeFileSync(
    path.join(packsDir, 'packs.json'),
    JSON.stringify({
      packs: [
        {
          packId: 'pack_legacy_1',
          scenarioId: 'presentation',
          title: 'Legacy Pitch',
          sceneType: 'pitch',
          goal: 'Preserve legacy pitch',
          audience: 'Judges',
          targetDurationSec: 180,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_005_000,
          cueSheet: {
            title: 'Legacy Pitch',
            openingLine: 'Hello',
            chapters: [],
            closingLine: 'Thanks',
            forbiddenClaims: [],
          },
          facts: [
            {
              id: 'fact_1',
              evidenceId: 'ev_1',
              text: 'Legacy verified SLA is 99.9%.',
              source: 'legacy',
              userConfirmed: true,
              verified: true,
              locked: true,
            },
          ],
          qaCards: [],
          progressNodes: [],
          forbiddenClaims: [],
          evidence: [],
        },
      ],
    }),
    'utf8',
  );

  writeFileSync(
    path.join(memoryDir, 'items.json'),
    JSON.stringify({
      items: [
        {
          memoryId: 'mem_legacy_confirmed',
          scenarioId: 'presentation',
          category: 'pacing_habit',
          title: 'Confirmed Habit',
          content: 'Keep intro under 60s.',
          userConfirmed: true,
          privacyLevel: 'local_private',
          scope: 'scenario',
          createdAt: 1_700_000_001_000,
          updatedAt: 1_700_000_001_000,
        },
        {
          memoryId: 'mem_legacy_unconfirmed',
          scenarioId: 'presentation',
          category: 'fact',
          title: 'Unconfirmed Drop',
          content: 'Must not migrate unconfirmed memory.',
          userConfirmed: false,
          privacyLevel: 'local_private',
          scope: 'scenario',
          createdAt: 1_700_000_001_000,
          updatedAt: 1_700_000_001_000,
        },
      ],
    }),
    'utf8',
  );

  const dbPath = path.join(tmpDir, 'cuex.db');
  const repo = new SqliteRepository(dbPath);
  try {
    repo.init();

    // Check WAL & foreign_keys pragmas directly.
    const rawDb = new DatabaseSync(dbPath);
    try {
      const journal = rawDb.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      const fk = rawDb.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
      const migrations = rawDb
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all() as Array<{ version: string }>;
      assert.equal(journal.journal_mode.toLowerCase(), 'wal');
      assert.equal(fk.foreign_keys, 1);
      assert.ok(migrations.some((m) => m.version === '001_core_domain'));
    } finally {
      rawDb.close();
    }

    const report1 = repo.migrateLegacyJsonFiles({
      runtimeDir: tmpDir,
      packsDir,
      memoryDir,
      defaultUserId: 'usr_legacy',
      defaultTenantId: 'tenant_legacy',
    });
    assert.equal(report1.skippedAlreadyMigrated, false);
    assert.equal(report1.packsMigrated, 1);
    assert.equal(report1.memoriesMigrated, 1);
    assert.equal(report1.backupFiles.length, 2);
    for (const bak of report1.backupFiles) {
      assert.equal(existsSync(bak), true);
    }

    const migratedPack = repo.getPack('pack_legacy_1', 'usr_legacy');
    assert.ok(migratedPack);
    assert.equal(migratedPack.schemaVersion, PACK_SCHEMA_VERSION);
    assert.match(migratedPack.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(migratedPack.facts[0].locked, true);

    assert.ok(repo.getMemory('mem_legacy_confirmed'));
    assert.equal(repo.getMemory('mem_legacy_unconfirmed'), undefined);

    // Re-running migration is idempotent.
    const report2 = repo.migrateLegacyJsonFiles({ runtimeDir: tmpDir, packsDir, memoryDir });
    assert.equal(report2.skippedAlreadyMigrated, true);
    assert.equal(report2.packsMigrated, 0);
    assert.equal(report2.memoriesMigrated, 0);
  } finally {
    repo.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SQLite backup/verify/restore script roundtrips real database and account export/delete preserves billing_audit_log', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cuex-bkp-test-'));
  const sqlitePath = path.join(tmpDir, 'cuex.db');
  const cfg = loadServerConfig({
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '0',
    CUEX_RUNTIME_DIR: tmpDir,
    CUEX_SQLITE_PATH: sqlitePath,
  });
  const server = new CueXGatewayServer({ config: cfg });
  const { port } = await server.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const authRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'export@example.com', displayName: 'Exporter' }),
    });
    const { token, user } = (await authRes.json()) as { token: string; user: { userId: string } };
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    // Create pack, memory, and billing checkout preview (writes billing_audit_log).
    const compileRes = await fetch(`${baseUrl}/api/presentation/compile`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Export Backup Deck',
        sceneType: 'keynote',
        goal: 'Test export and backup',
        audience: 'Ops team',
        targetDurationSec: 120,
        rawMaterials: 'Backup test verified latency 320 ms.',
        keyFactsInput: ['Verified uptime 99.95%'],
      }),
    });
    assert.equal(compileRes.status, 201);
    const compiledPack = ((await compileRes.json()) as { pack: { packId: string } }).pack;

    const previewRes = await fetch(`${baseUrl}/api/billing/checkout-preview`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ planId: 'pro', billingCycle: 'monthly', paymentChannel: 'alipay' }),
    });
    assert.equal(previewRes.status, 200);

    // Export JSON & Markdown bundles.
    const exportJsonRes = await fetch(`${baseUrl}/api/account/export?format=json`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(exportJsonRes.status, 200);
    const bundle = (await exportJsonRes.json()) as {
      packs: unknown[];
      billingAuditRecords: unknown[];
      user: { userId: string };
    };
    assert.equal(bundle.user.userId, user.userId);
    assert.ok(bundle.packs.length >= 1);
    assert.equal(bundle.billingAuditRecords.length, 1);

    const exportMdRes = await fetch(`${baseUrl}/api/account/export?format=markdown`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(exportMdRes.status, 200);
    const mdText = await exportMdRes.text();
    assert.match(mdText, /CueX 用户数据导出报告/);

    // Verify db-backup-restore.mjs backup + verify + restore roundtrip.
    const scriptPath = path.resolve(process.cwd(), '../../scripts/db-backup-restore.mjs');
    const resolvedScript = existsSync(scriptPath)
      ? scriptPath
      : path.resolve(process.cwd(), 'scripts/db-backup-restore.mjs');
    const backupOut = path.join(tmpDir, 'backups', 'cuex-snap.db');
    execFileSync(process.execPath, [resolvedScript, 'backup', '--db', sqlitePath, '--out', backupOut]);
    execFileSync(process.execPath, [resolvedScript, 'verify', '--db', backupOut]);

    // Delete account data via HTTP -> packs wiped, auth tokens revoked, billing_audit_log preserved (preview + wipe = 2)!
    const deleteRes = await fetch(`${baseUrl}/api/account/data`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(deleteRes.status, 200);
    const receipt = (await deleteRes.json()) as {
      deletedScopes: Array<{ scope: string; deletedCount: number }>;
      preservedRecords: Array<{ category: string; count: number }>;
    };
    assert.equal(receipt.deletedScopes.find((s) => s.scope === 'packs')?.deletedCount, 1);
    assert.equal(receipt.preservedRecords.find((r) => r.category === 'billing_audit_logs')?.count, 2);

    // Previous token must be invalidated by account wipe.
    const oldTokenRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(oldTokenRes.status, 401);

    // Re-authenticate with same email -> verify wiped packs & preserved billing_audit_logs via export.
    const reAuthRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'export@example.com', displayName: 'Exporter' }),
    });
    assert.equal(reAuthRes.status, 200);
    const { token: freshToken } = (await reAuthRes.json()) as { token: string };

    const afterExportRes = await fetch(`${baseUrl}/api/account/export?format=json`, {
      headers: { Authorization: `Bearer ${freshToken}` },
    });
    assert.equal(afterExportRes.status, 200);
    const afterBundle = (await afterExportRes.json()) as {
      packs: unknown[];
      billingAuditRecords: unknown[];
    };
    assert.equal(afterBundle.packs.length, 0);
    assert.equal(afterBundle.billingAuditRecords.length, 2);

    // Stop server before restoring snapshot over sqlitePath and confirm restored pack returns!
    await server.stop();
    execFileSync(process.execPath, [resolvedScript, 'restore', '--backup', backupOut, '--db', sqlitePath]);

    const verifyRepo = new SqliteRepository(sqlitePath);
    try {
      verifyRepo.init();
      assert.ok(verifyRepo.getPack(compiledPack.packId, user.userId));
      assert.ok(readdirSync(path.join(tmpDir, 'backups')).some((f) => f.endsWith('.sha256.json')));
    } finally {
      verifyRepo.close();
    }
  } finally {
    await server.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
