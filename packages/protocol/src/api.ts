/**
 * HTTP REST API Contracts shared between server gateway and web client.
 */

import type { AsrCapabilityStatus } from './audio';
import type { DataScope, PrivacyLevel } from './common';
import type { MemoryCategory, MemoryItem } from './entities';
import type {
  PresentationContextPack,
  PresentationPackSummary,
  PresentationReflection,
} from './presentation';
import type { ScenarioCapabilityDescriptor, ScenarioId } from './scenario';

export interface HealthStatusResponse {
  ok: boolean;
  service: string;
  version: string;
  timestamp: number;
  asr: AsrCapabilityStatus;
  system1: {
    backend: string;
    mode: 'real' | 'local_fallback';
    healthy: boolean;
    detail?: string;
  };
  system2: {
    backend: string;
    mode: 'real' | 'local_fallback';
    healthy: boolean;
    detail?: string;
  };
}

export interface ScenariosListResponse {
  scenarios: ScenarioCapabilityDescriptor[];
}

export interface PresentationPackListResponse {
  packs: PresentationPackSummary[];
}

export interface PresentationPackDetailResponse {
  pack: PresentationContextPack;
}

export interface MemoryListResponse {
  items: MemoryItem[];
}

export interface MemoryCreateInput {
  scenarioId: ScenarioId | 'universal';
  category: MemoryCategory;
  title: string;
  content: string;
  tags?: string[];
  sourceSessionId?: string;
  userConfirmed: boolean;
  privacyLevel: PrivacyLevel;
  scope: DataScope;
}

export interface MemoryPatchInput {
  title?: string;
  content?: string;
  category?: MemoryCategory;
  tags?: string[];
  privacyLevel?: PrivacyLevel;
  scope?: DataScope;
  userConfirmed?: boolean;
}

export interface SessionReflectionResponse {
  reflection: PresentationReflection;
}
