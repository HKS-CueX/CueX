import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_UTILITY_LAMBDA } from '@cuex/protocol';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SERVER_DIR, '..', '..');

export type EngineMode = 'fake' | 'real';
export type CuexEnvironment = 'development' | 'test' | 'staging' | 'production';

export interface ServerConfig {
  environment: CuexEnvironment;
  host: string;
  port: number;
  serviceVersion: string;
  runtimeDir: string;
  sqlitePath: string;
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
  authRequired: boolean;
  authTokenTtlHours: number;
  allowedOrigins: string[];
  rateLimitRpm: number;
  maxUploadBytes: number;
  retentionDays: number;
  webhookSecret?: string;
  maxAudioFrameChars: number;
  maxWsPayloadBytes: number;
}

const VALID_ENVIRONMENTS: readonly CuexEnvironment[] = [
  'development',
  'test',
  'staging',
  'production',
];

function readEnvironment(env: NodeJS.ProcessEnv): CuexEnvironment {
  const raw = (env.CUEX_ENV ?? (env.NODE_ENV === 'test' || env.NODE_ENV === 'production' ? env.NODE_ENV : 'development'))
    .trim()
    .toLowerCase();
  if ((VALID_ENVIRONMENTS as readonly string[]).includes(raw)) {
    return raw as CuexEnvironment;
  }
  throw new Error(`CUEX_ENV must be one of ${VALID_ENVIRONMENTS.join(', ')}, got "${raw}"`);
}

function readMode(raw: string | undefined, key: string): EngineMode {
  const value = (raw ?? 'fake').trim().toLowerCase();
  if (value === 'fake' || value === 'real') return value;
  throw new Error(`${key} must be "fake" or "real", got "${raw}"`);
}

function readBoolean(raw: string | undefined, fallback: boolean, key: string): boolean {
  if (!raw?.trim()) return fallback;
  const val = raw.trim().toLowerCase();
  if (val === 'true' || val === '1' || val === 'yes') return true;
  if (val === 'false' || val === '0' || val === 'no') return false;
  throw new Error(`${key} must be a boolean ("true" | "false"), got "${raw}"`);
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

function readAllowedOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const environment = readEnvironment(env);
  const runtimeDir = path.resolve(
    SERVER_DIR,
    env.CUEX_RUNTIME_DIR?.trim() || path.join(REPO_ROOT, '.cuex-runtime'),
  );
  const sqlitePath = path.resolve(
    SERVER_DIR,
    env.CUEX_SQLITE_PATH?.trim() || path.join(runtimeDir, 'cuex.db'),
  );
  const memoryDir = path.resolve(
    SERVER_DIR,
    env.CUEX_MEMORY_DIR?.trim() || path.join(runtimeDir, 'memory'),
  );
  const packsDir = path.resolve(
    SERVER_DIR,
    env.CUEX_PACKS_DIR?.trim() || env.CUEX_LIBRARY_DIR?.trim() || path.join(runtimeDir, 'packs'),
  );

  const authRequired = readBoolean(env.CUEX_AUTH_REQUIRED, true, 'CUEX_AUTH_REQUIRED');
  if (environment === 'production' && !authRequired) {
    throw new Error('CUEX_AUTH_REQUIRED cannot be disabled when CUEX_ENV=production.');
  }

  const maxUploadMb = readPositiveInt(env.CUEX_MAX_UPLOAD_MB, 15, 'CUEX_MAX_UPLOAD_MB');
  const maxUploadBytes = maxUploadMb * 1024 * 1024;
  const utilityLambdaRaw = env.CUEX_UTILITY_LAMBDA?.trim();
  const defaultUtilityLambda = utilityLambdaRaw ? Number(utilityLambdaRaw) : DEFAULT_UTILITY_LAMBDA;
  if (!Number.isFinite(defaultUtilityLambda) || defaultUtilityLambda <= 0) {
    throw new Error(`CUEX_UTILITY_LAMBDA must be a positive number, got "${utilityLambdaRaw}"`);
  }

  const webhookSecret = env.CUEX_WEBHOOK_SECRET?.trim() || undefined;

  return {
    environment,
    host: env.HOST?.trim() || '127.0.0.1',
    port: readPort(env.PORT, 8765),
    serviceVersion: '0.2.0',
    runtimeDir,
    sqlitePath,
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
    defaultUtilityLambda,
    authRequired,
    authTokenTtlHours: readPositiveInt(env.CUEX_AUTH_TOKEN_TTL_HOURS, 24, 'CUEX_AUTH_TOKEN_TTL_HOURS'),
    allowedOrigins: readAllowedOrigins(env.CUEX_ALLOWED_ORIGINS),
    rateLimitRpm: readPositiveInt(env.CUEX_RATE_LIMIT_RPM, 120, 'CUEX_RATE_LIMIT_RPM'),
    maxUploadBytes,
    retentionDays: readPositiveInt(env.CUEX_RETENTION_DAYS, 90, 'CUEX_RETENTION_DAYS'),
    ...(webhookSecret ? { webhookSecret } : {}),
    maxAudioFrameChars: 512_000,
    maxWsPayloadBytes: 2 * 1024 * 1024,
  };
}
