import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_UTILITY_LAMBDA } from '@cuex/protocol';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SERVER_DIR, '..', '..');

export type EngineMode = 'fake' | 'real';

export interface ServerConfig {
  host: string;
  port: number;
  serviceVersion: string;
  runtimeDir: string;
  memoryDir: string;
  packsDir: string;
  system1Mode: EngineMode;
  system2Mode: EngineMode;
  asrMode: EngineMode;
  cooldownMs: number;
  candidateTtlMs: number;
  dismissSuppressionMs: number;
  hesitationSilenceMs: number;
  defaultUtilityLambda: number;
  maxAudioFrameChars: number;
  maxWsPayloadBytes: number;
}

function readMode(raw: string | undefined, key: string): EngineMode {
  const value = (raw ?? 'fake').trim().toLowerCase();
  if (value === 'fake' || value === 'real') return value;
  throw new Error(`${key} must be "fake" or "real", got "${raw}"`);
}

function readPositiveInt(raw: string | undefined, fallback: number, key: string): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

function readPort(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${raw}"`);
  }
  return parsed;
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const runtimeDir = path.resolve(
    SERVER_DIR,
    env.CUEX_RUNTIME_DIR?.trim() || path.join(REPO_ROOT, '.cuex-runtime'),
  );
  const memoryDir = path.resolve(
    SERVER_DIR,
    env.CUEX_MEMORY_DIR?.trim() || path.join(runtimeDir, 'memory'),
  );
  const packsDir = path.resolve(
    SERVER_DIR,
    env.CUEX_PACKS_DIR?.trim() || env.CUEX_LIBRARY_DIR?.trim() || path.join(runtimeDir, 'packs'),
  );

  const port = readPort(env.PORT, 8765);

  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port,
    serviceVersion: '0.2.0',
    runtimeDir,
    memoryDir,
    packsDir,
    system1Mode: readMode(env.CUEX_SYSTEM1, 'CUEX_SYSTEM1'),
    system2Mode: readMode(env.CUEX_SYSTEM2, 'CUEX_SYSTEM2'),
    asrMode: readMode(env.CUEX_ASR, 'CUEX_ASR'),
    cooldownMs: readPositiveInt(env.CUEX_COOLDOWN_MS, 15_000, 'CUEX_COOLDOWN_MS'),
    candidateTtlMs: readPositiveInt(env.CUEX_CANDIDATE_TTL_MS, 12_000, 'CUEX_CANDIDATE_TTL_MS'),
    dismissSuppressionMs: readPositiveInt(
      env.CUEX_DISMISS_SUPPRESSION_MS,
      45_000,
      'CUEX_DISMISS_SUPPRESSION_MS',
    ),
    hesitationSilenceMs: readPositiveInt(
      env.CUEX_HESITATION_SILENCE_MS,
      1_600,
      'CUEX_HESITATION_SILENCE_MS',
    ),
    defaultUtilityLambda: Number(env.CUEX_UTILITY_LAMBDA ?? DEFAULT_UTILITY_LAMBDA) || DEFAULT_UTILITY_LAMBDA,
    maxAudioFrameChars: 512_000,
    maxWsPayloadBytes: 2 * 1024 * 1024,
  };
}
