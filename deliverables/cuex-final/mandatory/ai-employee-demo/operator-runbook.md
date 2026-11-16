# CueX AI Employee Operator Runbook（脱敏运维与可复现手册）

> **安全与卫生红线**：本手册**不含**任何 API Key、Bearer Token、私钥、真实外网网关主机名/IP 或本机私有绝对路径；所有真实凭证须保存在 gitignored 的 `.cuex-runtime/.env.phase3.local` 与 `.cuex-runtime/colab-asr-cert.pem` 中。  
> **静音验证铁律（`silentValidationOnly: true`）**：自动化与回归校验全程仅通过本地 WAV 缓冲输入与 Playwright Chromium `--mute-audio` 完成，**严禁在宿主机器外放任何验证音频**。

---

## 1. 运行前环境检查（Pre-Flight）

1. **基础依赖与编译状态确认**（仓库根目录执行）：
   ```bash
   pnpm --filter @cuex/protocol test
   pnpm --filter @cuex/server typecheck
   pnpm --filter @cuex/web typecheck
   ```
2. **模式选择说明**（配置文件来源：`apps/server/src/config.ts`）：
   - **离线确定性模式（无需外网/秘钥，零费用）**：`CUEX_TEST_OFFLINE=1` 或保持 `CUEX_SYSTEM1=fake`、`CUEX_SYSTEM2=fake`、`CUEX_ASR=fake`。
   - **实机双引擎模式（Colab GPU ASR + CPA LLM）**：需准备 `.cuex-runtime/.env.phase3.local`（见下节变量清单），并设置 `CUEX_ASR=real`、`CUEX_SYSTEM1=real`、`CUEX_SYSTEM2=real`。

---

## 2. 脱敏环境变量模板（`.cuex-runtime/.env.phase3.local`）

> 请勿提交至 Git；以下占位符仅标明所需字段名称与格式：

```bash
# CueX Gateway 服务基础配置
HOST=127.0.0.1
PORT=8765
CUEX_ENV=development
CUEX_AUTH_REQUIRED=true

# 模式开关：offline 演示全部设为 fake；实机验证设为 real
CUEX_ASR=real
CUEX_SYSTEM1=real
CUEX_SYSTEM2=real

# Google Colab GPU ASR 隧道（已启用自签名 SAN 证书固定与 Bearer 鉴权）
CUEX_COLAB_ASR_URL=https://<redacted-colab-tunnel>:10086
CUEX_COLAB_ASR_API_KEY=<redacted-colab-bearer-token>
CUEX_COLAB_ASR_CA_CERT=.cuex-runtime/colab-asr-cert.pem

# 统一 CPA LLM 网关（由 CpaProviderAdapter 调用）
CUEX_CPA_BASE_URL=https://<redacted-cpa-gateway>/v1
CUEX_CPA_API_KEY=<redacted-cpa-api-key>
CUEX_CPA_SYSTEM1_MODEL=gemini-4-hydrogen
CUEX_CPA_SYSTEM2_MODEL=gemini-4-hydrogen
```

---

## 3. 核心可复现命令清单

### A. 一键离线基线与浏览器静默 E2E（Category 1 & 5）

```bash
# 1. 服务端确定性单元与控制器契约测试（34/34）
CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test

# 2. 6 用例呈现控场离线评估（生成 .cuex-runtime/eval-latest.json，local_rule_zero）
CUEX_SYSTEM1=fake CUEX_SYSTEM2=fake CUEX_ASR=fake pnpm --filter @cuex/server eval

# 3. 前端单测（10/10）+ 静默 Playwright 全流 E2E（自动开启 --mute-audio）
pnpm --filter @cuex/web test
CUEX_TEST_OFFLINE=1 node --test apps/web/test/presentation-e2e.test.mjs
```

### B. 启动本地 Web + Gateway 进行实操或录制（Default Ports `8765` / `5173`）

```bash
# 终端 1：启动 CueXGatewayServer（默认 127.0.0.1:8765）
pnpm --filter @cuex/server dev

# 终端 2：启动 Vite 前端（默认 5173，自动将 /api、/ws、/health 代理至 127.0.0.1:8765）
pnpm --filter @cuex/web dev
```

- 浏览器访问 `http://127.0.0.1:5173`，进入 `CompilerView` 即可一键载入 `demo-pack` 或上传自定义 `.pptx` / `.pdf` / `.md` / `.txt`（默认单文件上限 `15 MB`）。

### C. 实机 Colab GPU ASR + CPA LLM + Gateway E2E 验收（Category 3 & 4）

> 仅在远端 Colab GPU 实例（`infra/colab/start_asr.py`）在线且已正确配置 `.cuex-runtime/.env.phase3.local` 时运行；全程读取本地 `demo-pack/audio/*.wav`，无任何音频外放：

```bash
# 1. 探活 Colab GPU ASR 并验证无鉴权请求返回 401
python3 infra/colab/healthcheck.py --env-file .cuex-runtime/.env.phase3.local --verify-auth

# 2. 单独运行统一 CPA 模型网关基准与 Fault Matrix
CPA_DEV_MODELS_LOADER=1 pnpm --filter @cuex/server exec tsx scripts/validate-cpa-live.ts

# 3. 运行全链路 14 项 Section 5.2 实机集成验收（SQLite + Colab WSS + CPA LLM）
CPA_DEV_MODELS_LOADER=1 pnpm --filter @cuex/server exec tsx scripts/validate-real-e2e.ts
```

---

## 4. 故障降级排查与演示后数据主权清理（`/wipe`）

1. **状态透视排查 (`GET /health` & `Inspector`)**：
   - 若 `GET /health` 返回 Colab ASR `lifecycleState: "unavailable"` 且 `fallbackActive: true`，系统会自动退回浏览器端 / 文本模拟路径并在 `Inspector` 明确标出降级状态，**不会静默伪装实时云端推理**。
   - 若 CPA 上游触发超时或连续 `503` 熔断，控制器在 `80–254 ms` 内退回 `local_rule_zero` 仅产出基于已确认 `Evidence[]` 的安全提示或 `missing_evidence_notice`。
2. **演后会话数据主权清理**：
   - 在 `ReflectionView` 或 `Account Drawer` 中点击**「彻底删除本场会话数据」**（对应 `POST /api/sessions/:id/wipe`），或在导出备份后（`GET /api/account/export`）确认返回 `200` 与 `wipeReceiptId`，确保演示用临时上下文与个人记忆不留存于本地 `.cuex-runtime/cuex.db`。
3. **发布前安全自检**：
   - 任何新文档或截图改动后，务必在仓库根目录运行 `node scripts/check-public-data.mjs` 与 `node scripts/check-legacy-domain.mjs`，确认返回 `exit 0`。
