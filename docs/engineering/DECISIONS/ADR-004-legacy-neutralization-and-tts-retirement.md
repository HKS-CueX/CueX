# ADR-004: Legacy Domain Neutralization & Dead TTS Module Retirement

- **Status**: Accepted & Implemented (Stage A Docs + Stage B Code/Script Retirement)
- **Date**: `2026-11-16`
- **Audit Drivers**: [PHASE2_AUDIT.md §Q8](../PHASE2_AUDIT.md#q8-dead-tts-modules--legacy-domaincalibration-neutralization-部分残留--stage-ab-彻底清理-severity-p1)

## Context

Two forms of pre-refactor legacy debt remained after Phase 1 (`6804f5a`):
1. **Unused Speech Synthesis (TTS) Stack**: Live `CueX Presentation` interacts with presenters exclusively through quiet visual cues (`L0–L3` edge glow, peripheral pills, rescue cards) — speaking synthesized audio into a presenter's ear or room speaker while they deliver a live speech conflicts acoustically with their voice. Yet `apps/server/src/voice/tts-{edge,http,local}.ts`, `apps/server/src/voice/index.ts:11-13,162-196`, `apps/server/package.json:20` (`msedge-tts`), `apps/server/scripts/voice-tts-server.ts`, `.env.example:9` (`CUEX_TTS=fake`), `scripts/{demo-remote-tts,tts-ssh-bridge,tts-tunnel,tts-ssh-config,tts-startup.test}.mjs`, and `infra/windows/tts/**` (`serve_ming.py`, `start-ming.ps1`, `ssh_request.py`) remained wired into builds, scripts, and dependencies.
2. **Legacy Calibration Metadata & Historical Doc Proper Nouns**: `apps/server/src/system1/LlamaSystemOne.ts` / `autotrust-jev9b.json` / `infra/windows/*` retained legacy `autotrust/JEV-9B` naming, and Phase 1 `docs/engineering/{BASELINE,CURRENT_ARCHITECTURE,AUDIT,LEGACY_CLEANUP,MIGRATION_PLAN}.md` retained literal single-domain roleplay scenario, metric, and persona proper nouns from commit `96cd742`.

## Decision

1. **Decommission & Remove Dead TTS Modules in Stage B**:
   - Remove unused TTS implementations (`apps/server/src/voice/tts-{edge,http,local}.ts`), `apps/server/scripts/voice-tts-server.ts`, `msedge-tts` dependency (when lockfile/Stage B permits clean pruning, or isolate/remove server imports cleanly per workspace lockfile rules), `.env.example` `CUEX_TTS` variables, root `scripts/*tts*` scripts/tests, and `infra/windows/tts/**`.
   - Keep `apps/server/src/voice/` focused strictly on clean speech **intake** (`LocalSherpaAsr`, `RemoteSherpaAsr`, `TextOnlyAsr`, `AsrCapabilityStatus`) paired with browser PCM16LE `AudioCapture` and Web Speech fallback.
2. **Neutralize Historical Engineering Documentation**:
   - Keep all factual Phase 0/P0 baseline metrics, commit hashes (`96cd742`), file counts, and architectural deficiencies intact inside `docs/engineering/{BASELINE,CURRENT_ARCHITECTURE,AUDIT,LEGACY_CLEANUP,MIGRATION_PLAN}.md`.
   - Add an explicit `[Historical Engineering Archive — Isolated from Active Product Docs]` notice to each historical doc and replace literal single-domain product codes, scenario parameters, and persona proper nouns with neutral generic labels (`历史单领域角色扮演原型 / 旧领域遗留模块`).
3. **Neutralize Remaining Legacy System 1 Labels & Guard via CI (`scripts/check-legacy-domain.mjs`)**:
   - Neutralize legacy S1 calibration labels/scripts (`LlamaSystemOne.ts` / config metadata / `infra/windows/` references) in Stage B where safe without breaking verified llama.cpp adapter functionality.
   - Enforce `node scripts/check-legacy-domain.mjs` in CI (`.github/workflows/ci.yml`) so zero legacy domain terms or retired `CUEX_TTS` / `msedge-tts` usages slip back into active code, scripts, or docs (explicitly exempting archive notes in `CHANGELOG.md` and `ADR-004` where retirement rationale is documented).

## Rejected Alternatives

- **Keeping Dead TTS Dependencies "Just in Case"**: Rejected because `msedge-tts` relies on an unofficial Microsoft Edge web endpoint, increases `npm audit` / SBOM attack surface, confuses operators reading `.env.example` / `package.json`, and violates Presentation's core zero-audio-collision design principle. If a future scenario (`Teaching` or `Social`) ever needs optional spoken rehearsal playback, it must be designed cleanly from scratch under that Scenario Adapter's capability descriptor rather than carrying dead pre-race SSH/Ming scripts.

## Consequences

- **Positive**: Cleaner SBOM and smaller `apps/server` dependency footprint, zero domain-leak false positives in `docs/`, unified ASR-only `voice/` boundary, automated CI regression guard.
- **Trade-off**: Anyone inspecting git commit `96cd742` directly (`git show 96cd742`) will still see the original pre-refactor prototype code in git history (by design — we never rewrite `main` history).
