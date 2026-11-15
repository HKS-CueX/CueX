#!/usr/bin/env node
/**
 * Generate a reproducible JSON SBOM (parsed from pnpm-lock.yaml + workspace manifests)
 * and SHA-256 artifact checksum manifest using zero external dependencies.
 *
 * Usage:
 *   node scripts/generate-sbom.mjs
 *   node scripts/generate-sbom.mjs --output .cuex-runtime/sbom-verify.json
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const DEFAULT_OUTPUT = 'deliverables/cuex-final/sbom-and-checksums.json';

function toPosixRelative(targetPath) {
  const rel = path.isAbsolute(targetPath) ? path.relative(root, targetPath) : targetPath;
  return rel.replace(/\\/g, '/').replace(/^\.\//, '');
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function buildNpmPurl(name, version) {
  if (name.startsWith('@')) {
    const slashIdx = name.indexOf('/');
    if (slashIdx > 1) {
      const scope = encodeURIComponent(name.slice(0, slashIdx));
      const pkg = encodeURIComponent(name.slice(slashIdx + 1));
      return `pkg:npm/${scope}/${pkg}@${encodeURIComponent(version)}`;
    }
  }
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function splitNameVersion(rawKey) {
  const clean = stripQuotes(rawKey);
  const atIdx = clean.lastIndexOf('@');
  if (atIdx <= 0) {
    return { name: clean, version: '0.0.0' };
  }
  return {
    name: clean.slice(0, atIdx),
    version: clean.slice(atIdx + 1),
  };
}

function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function parsePnpmLock(lockText) {
  const lines = lockText.split(/\r?\n/);
  let lockfileVersion = 'unknown';
  let section = null;

  const importers = {};
  let currentImporter = null;
  let currentDepGroup = null;
  let currentDepPkg = null;

  const components = [];
  let currentPkg = null;
  let snapshotCount = 0;

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    if (!line.startsWith(' ')) {
      const topMatch = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (topMatch) {
        const [, key, rest] = topMatch;
        if (key === 'lockfileVersion') {
          lockfileVersion = stripQuotes(rest);
          section = null;
        } else if (key === 'importers' || key === 'packages' || key === 'snapshots') {
          section = key;
        } else {
          section = null;
        }
        currentImporter = null;
        currentDepGroup = null;
        currentDepPkg = null;
        currentPkg = null;
      }
      continue;
    }

    if (section === 'importers') {
      if (line.startsWith('  ') && !line.startsWith('   ')) {
        const key = stripQuotes(line.trim().replace(/:$/, ''));
        currentImporter = key;
        importers[currentImporter] = {
          dependencies: [],
          devDependencies: [],
          optionalDependencies: [],
        };
        currentDepGroup = null;
        currentDepPkg = null;
      } else if (line.startsWith('    ') && !line.startsWith('     ') && currentImporter) {
        const group = line.trim().replace(/:$/, '');
        if (group in importers[currentImporter]) {
          currentDepGroup = group;
        } else {
          currentDepGroup = null;
        }
        currentDepPkg = null;
      } else if (line.startsWith('      ') && !line.startsWith('       ') && currentImporter && currentDepGroup) {
        const name = stripQuotes(line.trim().replace(/:$/, ''));
        currentDepPkg = { name, specifier: '', version: '' };
        importers[currentImporter][currentDepGroup].push(currentDepPkg);
      } else if (line.startsWith('        ') && currentDepPkg) {
        const kv = /^\s*([A-Za-z0-9_-]+):\s*(.+)$/.exec(line);
        if (kv) {
          if (kv[1] === 'specifier') currentDepPkg.specifier = stripQuotes(kv[2]);
          if (kv[1] === 'version') currentDepPkg.version = stripQuotes(kv[2]);
        }
      }
      continue;
    }

    if (section === 'packages') {
      if (line.startsWith('  ') && !line.startsWith('   ')) {
        const rawKey = line.trim().replace(/:$/, '');
        const { name, version } = splitNameVersion(rawKey);
        currentPkg = {
          name,
          version,
          purl: buildNpmPurl(name, version),
          integrity: null,
          scope: 'pnpm-workspace',
        };
        components.push(currentPkg);
      } else if (currentPkg) {
        const integrityMatch = /integrity:\s*([^\s,}]+)/.exec(line);
        if (integrityMatch && !currentPkg.integrity) {
          currentPkg.integrity = stripQuotes(integrityMatch[1]);
        }
      }
      continue;
    }

    if (section === 'snapshots') {
      if (line.startsWith('  ') && !line.startsWith('   ')) {
        snapshotCount += 1;
      }
    }
  }

  return { lockfileVersion, importers, components, snapshotCount };
}

function readJsonIfExists(relPath) {
  const full = path.join(root, relPath);
  if (!existsSync(full)) return null;
  return JSON.parse(readFileSync(full, 'utf8'));
}

function collectFilesRecursive(relDir, predicate = () => true) {
  const fullDir = path.join(root, relDir);
  if (!existsSync(fullDir)) return [];
  const results = [];
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(full);
      } else if (entry.isFile()) {
        const rel = toPosixRelative(full);
        if (predicate(rel)) results.push(rel);
      }
    }
  }
  walk(fullDir);
  return results.sort();
}

function sha256File(relPath) {
  const full = path.join(root, relPath);
  if (!existsSync(full)) return null;
  const st = statSync(full);
  if (!st.isFile()) return null;
  const buf = readFileSync(full);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  return {
    path: toPosixRelative(relPath),
    sha256,
    bytes: st.size,
  };
}

export function buildSbomDocument(outputRelPath = DEFAULT_OUTPUT) {
  const rootPkg = readJsonIfExists('package.json');
  const workspaceManifestPaths = [
    'package.json',
    'packages/protocol/package.json',
    'apps/server/package.json',
    'apps/web/package.json',
    'ppt/package.json',
  ];

  const workspaces = workspaceManifestPaths
    .map((manifestPath) => {
      const pkg = readJsonIfExists(manifestPath);
      if (!pkg) return null;
      return {
        path: manifestPath,
        name: pkg.name ?? path.dirname(manifestPath),
        version: pkg.version ?? '0.0.0',
        private: Boolean(pkg.private),
        type: pkg.type ?? 'commonjs',
        dependencies: pkg.dependencies ?? {},
        devDependencies: pkg.devDependencies ?? {},
      };
    })
    .filter(Boolean);

  const lockPath = path.join(root, 'pnpm-lock.yaml');
  const lockParsed = existsSync(lockPath)
    ? parsePnpmLock(readFileSync(lockPath, 'utf8'))
    : { lockfileVersion: 'missing', importers: {}, components: [], snapshotCount: 0 };

  const pptComponents = [];
  const pptLock = readJsonIfExists('ppt/package-lock.json');
  if (pptLock && typeof pptLock.packages === 'object' && pptLock.packages !== null) {
    for (const [pkgPath, meta] of Object.entries(pptLock.packages)) {
      if (!pkgPath || !meta || typeof meta !== 'object') continue;
      const parts = pkgPath.split('node_modules/');
      const name = parts[parts.length - 1];
      if (!name || typeof meta.version !== 'string') continue;
      pptComponents.push({
        name,
        version: meta.version,
        purl: buildNpmPurl(name, meta.version),
        integrity: typeof meta.integrity === 'string' ? meta.integrity : null,
        scope: 'ppt-tooling',
      });
    }
  }

  const allComponents = [...lockParsed.components, ...pptComponents].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    const byVer = a.version.localeCompare(b.version);
    if (byVer !== 0) return byVer;
    return a.scope.localeCompare(b.scope);
  });

  const normalizedOut = toPosixRelative(outputRelPath);
  const candidateArtifactPaths = new Set([
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.github/workflows/ci.yml',
    'scripts/check-public-data.mjs',
    'scripts/check-legacy-domain.mjs',
    'scripts/generate-sbom.mjs',
    'packages/protocol/package.json',
    'packages/protocol/tsconfig.json',
    ...collectFilesRecursive('packages/protocol/src', (p) => p.endsWith('.ts')),
    ...collectFilesRecursive('packages/protocol/compatibility', (p) => p.endsWith('.ts')),
    ...collectFilesRecursive('packages/protocol/schemas', (p) => p.endsWith('.schema.json')),
    ...collectFilesRecursive('packages/protocol/dist'),
    ...collectFilesRecursive('apps/server/dist'),
    ...collectFilesRecursive('apps/web/dist'),
    ...collectFilesRecursive('deliverables/cuex-final', (p) => p !== normalizedOut),
    'CueX-Universal-Presentation-Final.zip',
  ]);

  const artifacts = [...candidateArtifactPaths]
    .filter((p) => p !== normalizedOut)
    .sort()
    .map(sha256File)
    .filter(Boolean);

  const commitSha = runGit(['rev-parse', 'HEAD']) || 'unknown';
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown';
  const dirtyOutput = runGit(['status', '--porcelain']);
  const workingTreeDirty = dirtyOutput.length > 0;

  let importerDependencyCount = 0;
  for (const groups of Object.values(lockParsed.importers)) {
    importerDependencyCount +=
      groups.dependencies.length + groups.devDependencies.length + groups.optionalDependencies.length;
  }

  return {
    schemaVersion: 'cuex-sbom-v1',
    bomFormat: 'CycloneDX-compatible-JSON',
    generatedAt: new Date().toISOString(),
    provenance: {
      commitSha,
      branch,
      workingTreeDirty,
      nodeVersion: process.version,
      packageManager: rootPkg?.packageManager ?? 'pnpm@9.15.9',
      lockfileVersion: lockParsed.lockfileVersion,
      snapshotCount: lockParsed.snapshotCount,
    },
    workspaces,
    importers: lockParsed.importers,
    components: allComponents,
    artifacts,
    summary: {
      workspaceCount: workspaces.length,
      componentCount: allComponents.length,
      pnpmComponentCount: lockParsed.components.length,
      pptComponentCount: pptComponents.length,
      importerDependencyCount,
      hashedArtifactCount: artifacts.length,
    },
  };
}

function parseOutputArg(argv) {
  const outIdx = argv.indexOf('--output');
  if (outIdx !== -1 && argv[outIdx + 1]) {
    return argv[outIdx + 1];
  }
  const eqArg = argv.find((arg) => arg.startsWith('--output='));
  if (eqArg) {
    return eqArg.slice('--output='.length);
  }
  return DEFAULT_OUTPUT;
}

function main() {
  const outArg = parseOutputArg(process.argv.slice(2));
  const relOut = toPosixRelative(outArg);
  const absOut = path.isAbsolute(outArg) ? outArg : path.join(root, outArg);
  const doc = buildSbomDocument(relOut);

  mkdirSync(path.dirname(absOut), { recursive: true });
  writeFileSync(absOut, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

  console.log(
    `[generate-sbom] Wrote ${relOut} (workspaces=${doc.summary.workspaceCount}, components=${doc.summary.componentCount}, artifacts=${doc.summary.hashedArtifactCount}, commit=${doc.provenance.commitSha.slice(0, 7)})`,
  );
}

const isEntrypoint = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntrypoint) {
  main();
}
