import type {
  AccountUsageSummary,
  ApiErrorCode,
  ApiErrorDetail,
  ApiErrorResponse,
  AuthSessionCreateInput,
  AuthSessionResponse,
  BillingAuditListResponse,
  BillingAuditRecord,
  DataDeletionReceipt,
  Entitlement,
  HealthStatusResponse,
  MemoryCreateInput,
  MemoryItem,
  MemoryListResponse,
  MemoryPatchInput,
  PaymentCheckoutPreviewRequest,
  PaymentCheckoutPreviewResult,
  PlanDefinition,
  PlansListResponse,
  PresentationCompileInput,
  PresentationContextPack,
  PresentationExtractInput,
  PresentationExtractResult,
  PresentationPackDetailResponse,
  PresentationPackListResponse,
  PresentationPackPatchInput,
  PresentationPackSummary,
  PresentationReflection,
  ScenarioCapabilityDescriptor,
  ScenariosListResponse,
  Session,
  SessionReflectionResponse,
  UsageLedgerListResponse,
  UsageRecord,
  UserDataExportBundle,
  UtcIso8601,
} from '@cuex/protocol';

const AUTH_TOKEN_KEY = 'cuex_auth_token';
const AUTH_PROFILE_HINT_KEY = 'cuex_auth_profile_hint';

function createUniqueId(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `${prefix}_${randomUuid}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function generateIdempotencyKey(prefix = 'idk'): string {
  return createUniqueId(prefix);
}

export function generateCorrelationId(): string {
  return createUniqueId('corr');
}

function getSafeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getStoredAuthToken(): string | null {
  return getSafeStorage()?.getItem(AUTH_TOKEN_KEY) ?? null;
}

export function setStoredAuthToken(token: string): void {
  getSafeStorage()?.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredAuthToken(): void {
  getSafeStorage()?.removeItem(AUTH_TOKEN_KEY);
}

export function getStoredProfileHint(): AuthSessionCreateInput | null {
  const raw = getSafeStorage()?.getItem(AUTH_PROFILE_HINT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSessionCreateInput;
  } catch {
    return null;
  }
}

export function setStoredProfileHint(input: AuthSessionCreateInput): void {
  getSafeStorage()?.setItem(AUTH_PROFILE_HINT_KEY, JSON.stringify(input));
}

export class CuexApiError extends Error {
  readonly code?: ApiErrorCode | string;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly details?: ApiErrorDetail[];

  constructor(opts: {
    message: string;
    httpStatus: number;
    code?: ApiErrorCode | string;
    retryable?: boolean;
    requestId?: string;
    correlationId?: string;
    details?: ApiErrorDetail[];
  }) {
    super(opts.message);
    this.name = 'CuexApiError';
    this.httpStatus = opts.httpStatus;
    this.code = opts.code;
    this.retryable = opts.retryable ?? false;
    this.requestId = opts.requestId;
    this.correlationId = opts.correlationId;
    this.details = opts.details;
  }
}

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  rawText?: boolean;
}

async function requestRaw(url: string, init?: RequestOptions): Promise<Response> {
  const token = !init?.skipAuth ? getStoredAuthToken() : null;
  const correlationId = generateCorrelationId();
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Correlation-Id': correlationId,
      ...(init?.headers ?? {}),
    },
  });
}

async function parseErrorResponse(response: Response): Promise<CuexApiError> {
  const text = await response.text().catch(() => '');
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      return new CuexApiError({
        message: text.slice(0, 200) || `请求失败 (${response.status})`,
        httpStatus: response.status,
        retryable: response.status >= 500 || response.status === 429,
      });
    }
  }

  const envelope = parsed as Partial<ApiErrorResponse> | null;
  if (envelope?.error && typeof envelope.error === 'object' && 'message' in envelope.error) {
    return new CuexApiError({
      code: envelope.error.code,
      message: envelope.error.message,
      httpStatus: envelope.error.httpStatus ?? response.status,
      retryable: envelope.error.retryable ?? false,
      requestId: envelope.error.requestId,
      correlationId: envelope.error.correlationId,
      details: envelope.error.details,
    });
  }

  const legacy = parsed as { error?: string; message?: string; code?: string } | null;
  return new CuexApiError({
    code: legacy?.code,
    message:
      (typeof legacy?.error === 'string' ? legacy.error : undefined) ||
      legacy?.message ||
      `请求失败 (${response.status})`,
    httpStatus: response.status,
    retryable: response.status === 429 || response.status >= 500,
  });
}

async function request<T>(url: string, init?: RequestOptions): Promise<T> {
  const response = await requestRaw(url, init);
  if (!response.ok) {
    throw await parseErrorResponse(response);
  }
  const text = await response.text();
  if (!text) return undefined as T;
  if (init?.rawText) return text as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CuexApiError({
      message: `服务返回了非 JSON 响应 (${response.status})`,
      httpStatus: response.status,
      retryable: false,
    });
  }
}

export const fetchHealth = () => request<HealthStatusResponse>('/health', { skipAuth: true });

export const fetchScenarios = async (): Promise<ScenarioCapabilityDescriptor[]> => {
  const res = await request<ScenariosListResponse>('/api/scenarios');
  return res.scenarios;
};

// ==================== Auth & Account Sovereignty ====================

export async function createAuthSession(
  input: AuthSessionCreateInput = {}
): Promise<AuthSessionResponse> {
  const res = await request<AuthSessionResponse>('/api/auth/session', {
    method: 'POST',
    body: JSON.stringify(input),
    skipAuth: true,
  });
  if (res.token) {
    setStoredAuthToken(res.token);
  }
  if (input.displayName || input.email || input.tenantId) {
    setStoredProfileHint(input);
  }
  return res;
}

export const fetchAuthMe = () => request<AuthSessionResponse>('/api/auth/me');

export async function ensureAuthSession(): Promise<AuthSessionResponse> {
  const existingToken = getStoredAuthToken();
  if (existingToken) {
    try {
      return await fetchAuthMe();
    } catch (err) {
      if (err instanceof CuexApiError && (err.httpStatus === 401 || err.code === 'UNAUTHORIZED')) {
        clearStoredAuthToken();
      } else {
        throw err;
      }
    }
  }
  const hint = getStoredProfileHint() ?? { displayName: 'CueX 演示演讲者' };
  return createAuthSession(hint);
}

export async function logoutAuthSession(): Promise<void> {
  try {
    if (getStoredAuthToken()) {
      await request<{ ok?: boolean }>('/api/auth/logout', { method: 'POST' });
    }
  } finally {
    clearStoredAuthToken();
  }
}

export const fetchPlans = async (): Promise<PlanDefinition[]> => {
  const res = await request<PlansListResponse>('/api/plans');
  return res.plans;
};

export interface AccountUsageDetailsResponse {
  records: UsageRecord[];
  summary: AccountUsageSummary;
  entitlements?: Entitlement[];
}

export const fetchAccountUsage = async (): Promise<AccountUsageDetailsResponse> => {
  const res = await request<
    UsageLedgerListResponse & { usageSummary?: AccountUsageSummary; entitlements?: Entitlement[] }
  >('/api/account/usage');
  return {
    records: res.records ?? [],
    summary: res.summary ?? res.usageSummary,
    entitlements: res.entitlements,
  };
};

export type { BillingAuditRecord };

export const previewCheckout = async (
  input: PaymentCheckoutPreviewRequest
): Promise<PaymentCheckoutPreviewResult> => {
  const res = await request<
    PaymentCheckoutPreviewResult | { preview: PaymentCheckoutPreviewResult }
  >('/api/billing/checkout-preview', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return 'preview' in res ? res.preview : res;
};

export interface AccountExportResult {
  format: 'json' | 'markdown';
  content: string;
  filename: string;
  bundle?: UserDataExportBundle;
}

export async function exportAccountData(
  format: 'json' | 'markdown' = 'json'
): Promise<AccountExportResult> {
  const response = await requestRaw(`/api/account/export?format=${format}`);
  if (!response.ok) {
    throw await parseErrorResponse(response);
  }
  const text = await response.text();
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'markdown') {
    return {
      format: 'markdown',
      content: text,
      filename: `cuex-data-export-${stamp}.md`,
    };
  }
  const bundle = JSON.parse(text) as UserDataExportBundle;
  return {
    format: 'json',
    content: JSON.stringify(bundle, null, 2),
    filename: `cuex-data-export-${stamp}.json`,
    bundle,
  };
}

export async function deleteAccountData(): Promise<DataDeletionReceipt> {
  const res = await request<DataDeletionReceipt | { receipt: DataDeletionReceipt }>(
    '/api/account/data',
    { method: 'DELETE' }
  );
  clearStoredAuthToken();
  return 'receipt' in res ? res.receipt : res;
}

export const fetchObservabilitySummary = () =>
  request<Record<string, unknown>>('/api/observability/summary');

// ==================== Presentation Compiler & Packs ====================

export const extractPresentationDoc = (
  input: PresentationExtractInput,
  opts?: { signal?: AbortSignal }
) =>
  request<PresentationExtractResult>('/api/presentation/extract', {
    method: 'POST',
    body: JSON.stringify(input),
    signal: opts?.signal,
  });

export const compilePresentationPack = async (
  input: PresentationCompileInput,
  opts?: { signal?: AbortSignal }
): Promise<PresentationContextPack> => {
  const res = await request<PresentationPackDetailResponse>('/api/presentation/compile', {
    method: 'POST',
    body: JSON.stringify(input),
    signal: opts?.signal,
  });
  return res.pack;
};

export const listPresentationPacks = async (): Promise<PresentationPackSummary[]> => {
  const res = await request<PresentationPackListResponse>('/api/presentation/packs');
  return res.packs;
};

export const getPresentationPack = async (packId: string): Promise<PresentationContextPack> => {
  const res = await request<PresentationPackDetailResponse>(
    `/api/presentation/packs/${encodeURIComponent(packId)}`
  );
  return res.pack;
};

export const patchPresentationPack = async (
  packId: string,
  patch: PresentationPackPatchInput
): Promise<PresentationContextPack> => {
  const res = await request<PresentationPackDetailResponse>(
    `/api/presentation/packs/${encodeURIComponent(packId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }
  );
  return res.pack;
};

// ==================== Memory Governance ====================

export const listMemoryItems = async (params?: {
  scenarioId?: string;
  sessionId?: string;
}): Promise<MemoryItem[]> => {
  const qs = new URLSearchParams();
  if (params?.scenarioId) qs.set('scenarioId', params.scenarioId);
  if (params?.sessionId) qs.set('sessionId', params.sessionId);
  const query = qs.toString();
  const res = await request<MemoryListResponse>(`/api/memory${query ? `?${query}` : ''}`);
  return res.items;
};

export const createMemoryItem = async (input: MemoryCreateInput): Promise<MemoryItem> => {
  const res = await request<{ item: MemoryItem }>('/api/memory', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.item;
};

export const patchMemoryItem = async (
  memoryId: string,
  patch: MemoryPatchInput
): Promise<MemoryItem> => {
  const res = await request<{ item: MemoryItem }>(
    `/api/memory/${encodeURIComponent(memoryId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }
  );
  return res.item;
};

export const deleteMemoryItem = (memoryId: string) =>
  request<{ deleted: boolean; memoryId: string }>(
    `/api/memory/${encodeURIComponent(memoryId)}`,
    { method: 'DELETE' }
  );

// ==================== Sessions & Reflection ====================

export interface SessionHistoryItem {
  sessionId: string;
  packId?: string;
  title?: string;
  scenarioId?: string;
  mode: string;
  status: Session['status'];
  startedAt: UtcIso8601;
  endedAt?: UtcIso8601;
  durationMs?: number;
  elapsedSec?: number;
  utilityScore?: number;
  coverageRatio?: number;
  hasReflection?: boolean;
}

export async function listSessionsHistory(): Promise<SessionHistoryItem[]> {
  const res = await request<
    | SessionHistoryItem[]
    | { sessions?: SessionHistoryItem[]; items?: SessionHistoryItem[] }
  >('/api/sessions');
  if (Array.isArray(res)) return res;
  return res.sessions ?? res.items ?? [];
}

export interface SessionWipeResult {
  wiped: boolean;
  sessionId: string;
  wipedAt?: UtcIso8601;
  deletedMemoryCount?: number;
  receipt?: DataDeletionReceipt;
}

function normalizeDeletionResponse(
  sessionId: string,
  raw: Record<string, unknown>
): SessionWipeResult {
  const maybeReceipt =
    raw.receipt && typeof raw.receipt === 'object'
      ? (raw.receipt as DataDeletionReceipt)
      : 'receiptId' in raw && 'deletedScopes' in raw
        ? (raw as unknown as DataDeletionReceipt)
        : undefined;
  return {
    wiped: typeof raw.wiped === 'boolean' ? raw.wiped : true,
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : sessionId,
    wipedAt:
      (typeof raw.wipedAt === 'string' ? raw.wipedAt : undefined) ?? maybeReceipt?.completedAt,
    deletedMemoryCount:
      typeof raw.deletedMemoryCount === 'number' ? raw.deletedMemoryCount : undefined,
    receipt: maybeReceipt,
  };
}

export const deleteSessionById = async (sessionId: string): Promise<SessionWipeResult> => {
  const res = await request<Record<string, unknown>>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' }
  );
  return normalizeDeletionResponse(sessionId, res ?? {});
};

export const wipeSession = async (sessionId: string): Promise<SessionWipeResult> => {
  const res = await request<Record<string, unknown>>(
    `/api/sessions/${encodeURIComponent(sessionId)}/wipe`,
    { method: 'POST' }
  );
  return normalizeDeletionResponse(sessionId, res ?? {});
};

export const getSessionReflection = async (
  sessionId: string,
  lambda = 2
): Promise<PresentationReflection> => {
  const res = await request<SessionReflectionResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/reflection?lambda=${lambda}`
  );
  return res.reflection;
};
