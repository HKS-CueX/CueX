import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  ERROR_HTTP_STATUS,
  nowUtcIso8601,
  type ApiErrorCode,
  type AuthSessionCreateInput,
  type UserAccount,
} from '@cuex/protocol';
import type { StorageRepository } from '../storage';

export class HttpServiceError extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    opts?: { httpStatus?: number; retryable?: boolean },
  ) {
    super(message);
    this.name = 'HttpServiceError';
    this.code = code;
    this.httpStatus = opts?.httpStatus ?? ERROR_HTTP_STATUS[code];
    this.retryable =
      opts?.retryable ??
      (code === 'RATE_LIMITED' || code === 'PROVIDER_TIMEOUT' || code === 'PROVIDER_UNAVAILABLE');
  }
}

export interface AuthServiceOptions {
  authRequired: boolean;
  tokenTtlHours: number;
}

export interface IssuedAuthSession {
  token: string;
  user: UserAccount;
  sessionTokenExpiresAt: string;
}

export interface AuthenticatedContext {
  authenticated: boolean;
  user: UserAccount;
  tokenHash?: string;
}

export const LOCAL_DEV_USER_ID = 'usr_local_dev';
export const LOCAL_DEV_TENANT_ID = 'tenant_local_dev';

export function hashBearerToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function extractBearerToken(headerValue?: string | string[]): string | undefined {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!raw) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1]?.trim() || undefined;
}

/**
 * Multi-tenant authentication & opaque bearer-token management backed by SHA-256 hashes in StorageRepository.
 */
export class AuthService {
  constructor(
    private readonly repo: StorageRepository,
    private readonly opts: AuthServiceOptions,
  ) {}

  ensureLocalDevUser(nowIso = nowUtcIso8601()): UserAccount {
    const existing = this.repo.findUserById(LOCAL_DEV_USER_ID);
    if (existing) return existing;
    return this.repo.upsertUser({
      userId: LOCAL_DEV_USER_ID,
      tenantId: LOCAL_DEV_TENANT_ID,
      displayName: 'Local Presenter',
      role: 'owner',
      authMode: 'local_dev',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  createSession(input: AuthSessionCreateInput): IssuedAuthSession {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + Math.max(1, this.opts.tokenTtlHours) * 3_600_000).toISOString();

    const normalizedEmail = input.email?.trim().toLowerCase() || undefined;
    let user = normalizedEmail ? this.repo.findUserByEmail(normalizedEmail) : undefined;

    if (!user) {
      user = {
        userId: `usr_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        tenantId: input.tenantId?.trim() || `tenant_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        displayName: input.displayName?.trim() || (normalizedEmail ? normalizedEmail.split('@')[0] : 'CueX Presenter'),
        role: 'owner',
        authMode: 'session_token',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    } else {
      user = {
        ...user,
        displayName: input.displayName?.trim() || user.displayName,
        tenantId: input.tenantId?.trim() || user.tenantId,
        updatedAt: nowIso,
      };
    }

    user = this.repo.upsertUser(user);

    const token = `cx_tok_${randomBytes(24).toString('base64url')}`;
    const tokenHash = hashBearerToken(token);
    this.repo.createAuthToken({
      tokenHash,
      userId: user.userId,
      tenantId: user.tenantId,
      createdAt: nowIso,
      expiresAt,
    });

    return {
      token,
      user,
      sessionTokenExpiresAt: expiresAt,
    };
  }

  authenticateToken(rawToken: string | undefined): AuthenticatedContext {
    const nowIso = nowUtcIso8601();
    if (!rawToken) {
      if (!this.opts.authRequired) {
        return {
          authenticated: false,
          user: this.ensureLocalDevUser(nowIso),
        };
      }
      throw new HttpServiceError('UNAUTHORIZED', 'Authentication required. Please sign in via POST /api/auth/session.');
    }

    const tokenHash = hashBearerToken(rawToken);
    const tokenRecord = this.repo.findActiveAuthToken(tokenHash, nowIso);
    if (!tokenRecord) {
      throw new HttpServiceError('UNAUTHORIZED', 'Invalid or expired authentication token.');
    }

    const user = this.repo.findUserById(tokenRecord.userId);
    if (!user) {
      throw new HttpServiceError('UNAUTHORIZED', 'Authenticated user record no longer exists.');
    }

    return {
      authenticated: true,
      user,
      tokenHash,
    };
  }

  authenticateRequest(req: IncomingMessage): AuthenticatedContext {
    const bearer = extractBearerToken(req.headers.authorization);
    return this.authenticateToken(bearer);
  }

  logoutToken(rawToken: string | undefined): boolean {
    if (!rawToken) return false;
    const tokenHash = hashBearerToken(rawToken);
    return this.repo.revokeAuthToken(tokenHash, nowUtcIso8601());
  }

  assertOwnership(ownerUserId: string | undefined, actor: UserAccount, resourceLabel = 'resource'): void {
    if (!ownerUserId) return;
    if (ownerUserId !== actor.userId && actor.role !== 'admin') {
      throw new HttpServiceError(
        'FORBIDDEN',
        `Access denied: you do not have permission to access this ${resourceLabel}.`,
      );
    }
  }
}
