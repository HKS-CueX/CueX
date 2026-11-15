import type {
  HealthStatusResponse,
  MemoryCreateInput,
  MemoryItem,
  MemoryListResponse,
  MemoryPatchInput,
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
  SessionReflectionResponse,
} from '@cuex/protocol';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`服务返回了非 JSON 响应 (${response.status})`);
    }
  }
  if (!response.ok) {
    const errObj = data as { error?: string; message?: string } | null;
    throw new Error(errObj?.error || errObj?.message || `请求失败 (${response.status})`);
  }
  return data as T;
}

export const fetchHealth = () => request<HealthStatusResponse>('/health');

export const fetchScenarios = async (): Promise<ScenarioCapabilityDescriptor[]> => {
  const res = await request<ScenariosListResponse>('/api/scenarios');
  return res.scenarios;
};

export const extractPresentationDoc = (input: PresentationExtractInput) =>
  request<PresentationExtractResult>('/api/presentation/extract', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const compilePresentationPack = async (
  input: PresentationCompileInput
): Promise<PresentationContextPack> => {
  const res = await request<PresentationPackDetailResponse>('/api/presentation/compile', {
    method: 'POST',
    body: JSON.stringify(input),
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

export const wipeSession = (sessionId: string) =>
  request<{ wiped: boolean; sessionId: string; wipedAt: number; deletedMemoryCount: number }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/wipe`,
    { method: 'POST' }
  );

export const getSessionReflection = async (
  sessionId: string,
  lambda = 2
): Promise<PresentationReflection> => {
  const res = await request<SessionReflectionResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/reflection?lambda=${lambda}`
  );
  return res.reflection;
};
