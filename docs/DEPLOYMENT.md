# CueX Deployment Overview

> **Canonical Multi-Environment Runbook**: See **[docs/operations/DEPLOYMENT.md](./operations/DEPLOYMENT.md)** for full `development`, `test`, `staging`, and `production` architecture, SQLite storage paths, authentication, TLS/Nginx configuration, and security checklists.  
> *(Consolidated in Phase 2 to avoid diverging duplicate deployment runbooks.)*

## 30-Second Local Quickstart (`development` / `test`)

**Prerequisites**: Node.js `>= 22.19`, `pnpm@9.15.9`.

```bash
git clone https://github.com/HKS-CueX/CueX.git
cd CueX
cp .env.example .env
pnpm install --frozen-lockfile
pnpm build
pnpm demo
```

- **Web App**: `http://127.0.0.1:5173`
- **Server Gateway**: `http://127.0.0.1:8765` (`GET /health`, `/api/*`, WS `/ws`)
- **SQLite Persistence**: `${CUEX_SQLITE_PATH:-.cuex-runtime/cuex.db}` (verify online snapshot tooling via `pnpm db:backup --self-test`)

## Related Operational Guides
- **Observability & Alerts**: [docs/operations/OBSERVABILITY.md](./operations/OBSERVABILITY.md)
- **Incident Response**: [docs/operations/INCIDENT_RESPONSE.md](./operations/INCIDENT_RESPONSE.md)
- **SQLite Backup & Recovery**: [docs/operations/BACKUP_AND_RECOVERY.md](./operations/BACKUP_AND_RECOVERY.md)
- **Security Controls**: [docs/security/SECURITY_MODEL.md](./security/SECURITY_MODEL.md)
