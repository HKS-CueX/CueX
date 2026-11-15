# CueX Observability & Telemetry Guide

> Scope: Structured Logs, Runtime Counters/Latencies, Pipeline Tracking, Alert Thresholds, and Redaction Controls across `apps/server` (`GatewayServer`, `CognitiveRuntimeSession`, `InterventionController`, `SqliteStorageRepository`) and `apps/web` (`Inspector`).  
> Architecture Alignment: Naming follows OpenTelemetry-style semantic conventions internally via zero-dep `StructuredLogger`, `MetricsCollector`, and `PipelineTracker`, exposed at authenticated `GET /api/observability/summary` (`{ metrics, pipeline }`) rather than requiring an external OTel Collector sidecar in Phase 2.

---

## 1. Three Pillars Mapped to CueX Telemetry

### 1.1 Structured Logs (`StructuredLogger` JSON Lines)
- File: `apps/server/src/observability/Logger.ts`
- Every HTTP request, WS lifecycle action, provider fallback, rate-limit event, and storage error emits structured JSON logs (`timestamp`, `level`, `event`, redacted fields).
- **Mandatory Redaction (`PRIVACY_DATA_MAP.md`)**:
  - `redactLogText()` / `redactLogValue()` (`Logger.ts`) and `redact()` (`apps/server/src/system2/config.ts`) scrub API keys and bearer tokens before log/error serialization.
  - Raw speaker utterances (`speech.delta` text) and uploaded document bodies MUST NOT appear in server info/error logs (`privacyClass: 'session'` / `'user_private'`).

### 1.2 Built-In Operational Metrics (`MetricsCollector` + `/api/observability/summary`)
- File: `apps/server/src/observability/MetricsCollector.ts` (`GET /api/observability/summary` returns `{ metrics, pipeline }`):
  - **HTTP**: `httpRequestsTotal`, `httpErrorsTotal`, `httpRateLimitedTotal`, status breakdown (`httpByStatus`), and request latencies (`avgMs`, `p50Ms`, `p95Ms`, `p99Ms`, `maxMs`).
  - **WebSocket**: `wsActiveConnections`, `wsTotalConnections`, `wsDisconnects`, `wsReconnects`, `wsDedupedEvents`, `wsReplayedEvents`.
  - **Providers**: per-provider `calls`, `errors`, `retries`, `degraded`, latency percentiles (`s1`, `s2`, `asr`).
  - **Controller & Grounding**: `controllerDecisionsTotal`, `controllerShownTotal`, `controllerWithdrawnTotal`, `controllerSuppressedTotal`, breakdown by `WithdrawalReason` & suppress reason, `groundingCheckedTotal` / `groundingGroundedTotal`.
  - **Lifecycle Funnel**: `sessionsStarted`, `sessionsCompleted`, `sessionsWiped`, `docsExtracted`, `packsCompiled`, `memoriesSaved`.
  - **Session Costs (`TelemetryUsage`)**: `usageSource` (`provider_reported | local_rule_zero | estimated`), `inputTokens`, `outputTokens`, `cachedInputTokens`, `costFen`.

### 1.3 Correlation Tracing & Pipeline Tracking (`PipelineTracker`)
- File: `apps/server/src/pipeline/PipelineTracker.ts`
- Propagates `EventEnvelopeMeta` (`correlationId`, `causationId`, optional `traceId`, `privacyClass`, monotonic `serverSeq`) across all 9 pipeline stages (`ingestion`, `asr`, `context_store`, `event_bus`, `fast_decision`, `retrieval`, `slow_reasoning`, `controller`, `delivery`), backing WS reconnect replay cleanly from SQLite `session_events`.

---

## 2. Operational Health Endpoint & Alert Thresholds

- **Health Endpoint (`GET /health`)**: Exposes server status (`ok`), `service: 'cuex-server'`, `API_VERSION` / `WS_PROTOCOL_VERSION`, `AsrCapabilityStatus`, System 1/2 backend mode (`real` vs `local_fallback`) + health (`healthy`, `detail`), and SQLite readiness (`repo.ping()`, `503` if unhealthy). Standalone startup check script also exists at `apps/server/src/gateway/healthProbe.ts`.
- **Recommended Production Alert Rules**:

| Alert Condition | Window | Severity | Target Action |
| --- | --- | --- | --- |
| HTTP `5xx` rate `> 1%` or `/health` failing `2` consecutive probes | `2 min` | **`P0`** | Page on-call; inspect `GatewayServer` logs & SQLite health (`INCIDENT_RESPONSE.md`). |
| Upstream `s2` latency p95 `> 4,000 ms` or `providers.system2.degraded === true` sustained | `5 min` | **`P1`** | Upstream LLM degraded; check provider status or temporarily switch `CUEX_SYSTEM2=fake` safeguard. |
| Sustained `400 VALIDATION_ERROR` / upload rejections or `429 RATE_LIMITED` surge | `5 min` | **`P1`** | Potential upload DoS/ZIP-bomb probing; verify IP/user rate limits (`CUEX_RATE_LIMIT_RPM`). |
| SQLite `SQLITE_BUSY` / `/health` `503` errors | `3 min` | **`P1`** | Check long transactions or lock contention; verify WAL mode & disk headroom (`BACKUP_AND_RECOVERY.md`). |
| `402 QUOTA_EXCEEDED` spike on healthy paid accounts or webhook `401` HMAC failures `> 5` | `5 min` | **`P1`** | Verify `entitlements` sync / potential payment webhook tampering (`SECURITY_MODEL.md`). |
| WS disconnect/reconnect ratio `> 30%` of active sessions | `10 min` | **`P2`** | Check reverse-proxy timeouts (`proxy_read_timeout` in `nginx.conf.example`). |
