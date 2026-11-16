#!/usr/bin/env node
/**
 * Automated guard against legacy vertical-domain regressions and retired TTS modules.
 *
 * Usage:
 *   node scripts/check-legacy-domain.mjs            # Scan working tree (tracked + untracked non-ignored)
 *   node scripts/check-legacy-domain.mjs --staged   # Scan Git index (pre-commit hook compatible)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const maxBytes = 2 * 1024 * 1024;

const IGNORED_PATH_PREFIXES = [
  '.git/',
  'node_modules/',
  'dist/',
  '.cuex-runtime/',
  'ppt/out/',
  'assets/banners/',
];

const IGNORED_PATH_SEGMENTS = ['/node_modules/', '/dist/', '/.git/'];

/**
 * Historical engineering audit logs, decision records (ADR-004), and release changelog
 * document pre-refactor provenance and retirement targets by design.
 */
const ARCHIVAL_PROVENANCE_EXEMPT_FILES = new Set([
  'docs/engineering/CHANGELOG.md',
  'docs/engineering/TEST_REPORT.md',
  'docs/engineering/PHASE2_AUDIT.md',
  'docs/engineering/PHASE2_PLAN.md',
  'docs/engineering/PHASE2_RISK_REGISTER.md',
  'docs/engineering/BASELINE.md',
  'docs/engineering/CURRENT_ARCHITECTURE.md',
  'docs/engineering/AUDIT.md',
  'docs/engineering/LEGACY_CLEANUP.md',
  'docs/engineering/MIGRATION_PLAN.md',
  'docs/engineering/DECISIONS/ADR-004-legacy-neutralization-and-tts-retirement.md',
]);

// Patterns are encoded with Unicode escapes so this script never triggers itself.
const RULES = [
  {
    id: 'legacy-domain-en',
    description: 'Legacy vertical-domain English term or identifier',
    regex: new RegExp(
      [
        '(?<![a-zA-Z])(?<!non[-_\\s])(?:\\u0064\\u006f\\u0063\\u0074\\u006f\\u0072\\u0073?|\\u0063\\u006c\\u0069\\u006e\\u0069\\u0063\\u0061\\u006c|\\u0070\\u0068\\u0061\\u0072\\u006d\\u0061(?:\\u0063\\u0065\\u0075\\u0074\\u0069\\u0063\\u0061\\u006c)?|\\u0070\\u0061\\u0074\\u0069\\u0065\\u006e\\u0074\\u0073?|\\u006d\\u0065\\u0064\\u0069\\u0063\\u0061\\u006c|\\u0068\\u0079\\u0070\\u0065\\u0072\\u0074\\u0065\\u006e\\u0073\\u0069\\u006f\\u006e|\\u0061\\u006e\\u0074\\u0069\\u0068\\u0079\\u0070\\u0065\\u0072\\u0074\\u0065\\u006e\\u0073\\u0069\\u0076\\u0065|\\u0065\\u0067\\u0066\\u0072|\\u0070\\u0072\\u0065\\u0073\\u0063\\u0072\\u0069\\u0070\\u0074\\u0069\\u006f\\u006e)(?![a-zA-Z])',
        '(?:\\u0064\\u0072\\u002d\\u0063\\u0068\\u0065\\u006e|\\u0064\\u0072\\u002d\\u006c\\u0069|\\u0064\\u0072\\u002d\\u0073\\u0079\\u006e\\u0074\\u0068|\\u0066\\u0061\\u0063\\u0065\\u0063\\u0061\\u0070|\\u006a\\u0065\\u0076[-_]\\u0064\\u006f\\u0073\\u0065)',
        '\\b\\u0061\\u006e\\u0073\\u0068\\u0075(?:[-_\\d]|\\b)',
        '(?<![-_./])\\b\\u0072\\u0065\\u0070\\b(?![-_./])',
      ].join('|'),
      'iu',
    ),
  },
  {
    id: 'legacy-domain-zh',
    description: 'Legacy vertical-domain Chinese term',
    regex: new RegExp(
      [
        '\\u5b89\\u8212\\u5e73',
        '\\u5b89\\u8212',
        '\\u533b\\u836f\\u4ee3\\u8868',
        '\\u8d44\\u6df1\\u4ee3\\u8868',
        '\\u4ee3\\u8868\\u62dc\\u8bbf',
        '\\u9648\\u4e3b\\u4efb',
        '\\u674e\\u4e3b\\u4efb',
        '\\u865a\\u62df\\u533b\\u751f',
        '\\u533b\\u751f',
        '\\u60a3\\u8005',
        '\\u4e34\\u5e8a',
        '\\u533b\\u836f',
        '\\u533b\\u7597',
        '\\u533b\\u5b66',
        '\\u5904\\u65b9',
        '\\u79d1\\u5ba4',
        '\\u7528\\u836f',
        '\\u8bca\\u7597',
        '\\u964d\\u538b\\u836f',
        '\\u6536\\u7f29\\u538b',
        '\\u8212\\u5f20\\u538b',
        '\\u62dc\\u8bbf\\u8bdd\\u672f',
        '\\u836f\\u4ee3',
      ].join('|'),
      'u',
    ),
  },
  {
    id: 'legacy-tts',
    description: 'Retired speech-synthesis module, script, or configuration variable (ADR-004)',
    regex: new RegExp(
      [
        '\\u006d\\u0073\\u0065\\u0064\\u0067\\u0065[-_]\\u0074\\u0074\\u0073',
        '\\u0043\\u0055\\u0045\\u0058\\u005f\\u0054\\u0054\\u0053',
        '\\u0073\\u0065\\u0072\\u0076\\u0065\\u005f\\u006d\\u0069\\u006e\\u0067',
        '\\u0076\\u006f\\u0069\\u0063\\u0065\\u002d\\u0074\\u0074\\u0073\\u002d\\u0073\\u0065\\u0072\\u0076\\u0065\\u0072',
        '\\u0074\\u0074\\u0073\\u002d\\u0065\\u0064\\u0067\\u0065',
        '\\u0074\\u0074\\u0073\\u002d\\u0074\\u0075\\u006e\\u006e\\u0065\\u006c',
        '\\u0074\\u0074\\u0073\\u002d\\u0073\\u0073\\u0068\\u002d\\u0063\\u006f\\u006e\\u0066\\u0069\\u0067',
        '\\u0074\\u0074\\u0073\\u002d\\u0073\\u0073\\u0068\\u002d\\u0062\\u0072\\u0069\\u0064\\u0067\\u0065',
        '\\u0064\\u0065\\u006d\\u006f\\u002d\\u0072\\u0065\\u006d\\u006f\\u0074\\u0065\\u002d\\u0074\\u0074\\u0073',
      ].join('|'),
      'i',
    ),
  },
];

function toPosixRelative(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isIgnoredPath(relativePath) {
  const normalized = toPosixRelative(relativePath);
  if (IGNORED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  if (IGNORED_PATH_SEGMENTS.some((segment) => normalized.includes(segment))) return true;
  return ARCHIVAL_PROVENANCE_EXEMPT_FILES.has(normalized);
}

function listFiles(staged) {
  try {
    const args = staged
      ? ['ls-files', '-z']
      : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
    const raw = execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return raw.split('\0').map(toPosixRelative).filter(Boolean);
  } catch {
    const collected = [];
    function walk(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = toPosixRelative(path.relative(root, full));
        if (IGNORED_PATH_PREFIXES.some((p) => `${rel}/`.startsWith(p) || rel.startsWith(p))) {
          continue;
        }
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          collected.push(rel);
        }
      }
    }
    walk(root);
    return collected;
  }
}

function readCandidateBuffer(file, staged) {
  if (staged) {
    try {
      return execFileSync('git', ['show', `:${file}`], {
        cwd: root,
        maxBuffer: maxBytes + 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return null;
    }
  }
  const full = path.join(root, file);
  if (!existsSync(full)) return null;
  const stat = statSync(full);
  if (!stat.isFile() || stat.size > maxBytes) return null;
  return readFileSync(full);
}

export function inspectLegacyText(file, text) {
  const normalized = toPosixRelative(file);
  if (isIgnoredPath(normalized)) return [];

  const findings = [];

  for (const rule of RULES) {
    const pathMatch = rule.regex.exec(normalized);
    if (pathMatch) {
      findings.push({
        file: normalized,
        line: 0,
        rule: rule.id,
        description: rule.description,
        snippet: `[path] ${pathMatch[0]}`,
      });
    }
  }

  const lines = text.split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineText = lines[idx];
    for (const rule of RULES) {
      const match = rule.regex.exec(lineText);
      if (match) {
        findings.push({
          file: normalized,
          line: idx + 1,
          rule: rule.id,
          description: rule.description,
          snippet: lineText.trim().slice(0, 140),
        });
      }
    }
  }
  return findings;
}

export function scanLegacyDomain({ staged = false } = {}) {
  const files = listFiles(staged);
  const findings = [];

  for (const file of files) {
    if (isIgnoredPath(file)) continue;
    const buf = readCandidateBuffer(file, staged);
    if (!buf || buf.length > maxBytes || buf.includes(0)) continue;
    findings.push(...inspectLegacyText(file, buf.toString('utf8')));
  }
  return findings;
}

function main() {
  const staged = process.argv.includes('--staged');
  const findings = scanLegacyDomain({ staged });

  if (findings.length > 0) {
    console.error(`[check-legacy-domain] Failed: found ${findings.length} legacy domain or retired TTS reference(s):`);
    for (const finding of findings) {
      const loc = finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
      console.error(`  - ${loc} [${finding.rule}] ${finding.snippet}`);
    }
    process.exit(1);
  }

  console.log(`[check-legacy-domain] Passed (${staged ? 'staged' : 'working tree'}): 0 legacy domain or retired TTS references.`);
}

const isEntrypoint = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntrypoint) {
  main();
}
