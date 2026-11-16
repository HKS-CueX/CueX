# CueX Presenter Companion 演讲随行窗模式架构（定稿 · Wave 1–4 实证校准版）

> **文档状态**：已依据 `@cuex/protocol` v2.2.0（`#106`/`#110`）、`GatewayServer.ts`（`#112`/`#119`）、`apps/web/src/**`（`#111`/`#115`）源码与 `companion-window-e2e.test.mjs` / `dual-system-real-validation.json` 实测结果最终定稿。  
> **核心诚实边界声明**：Web 浏览器受操作系统窗口层级与沙箱策略约束，**本文档、UI 文案与对外材料绝对禁止宣称“CueX Web 可强制系统级置顶覆盖全屏独占的 PowerPoint / Keynote”**。

---

## 1. 架构目标与多端隔离实现机制

演讲者在使用主屏全屏放映幻灯片时，可通过笔记本副屏或桌面侧边栏打开独立、精简、极低打扰的 `CompanionView` 随行观察窗（`?view=companion&sessionId=...`），同步承接实时节拍、`System2Guidance`、`L1` 边缘呼吸光与 `L2/L3` 提示卡，同时严格杜绝“副窗口重复抢麦”与“副窗口误操作终结主会话”。

1. **后端会话级资源托管（`apps/server/src/gateway/GatewayServer.ts:96-124, 1460-1560`）**：
   - `asrStream`、`tickTimer`、`serializeChain` 统一归属 `SessionEntry`，由唯一 `primarySubscriber` 与 `0..N` 伴随窗订阅者共享状态广播流。
   - **伴随窗断连保护（第 `1460-1462` 行）**：伴随窗断开连接仅清理自身订阅记录并广播最新 `session.attach_state`，绝不影响主控端音频流与心跳节拍。
   - **历史重放去重修复（`GatewayServer.ts:1553-1556` & `apps/web/src/core/session/presentationSession.ts:242-296`）**：接入既有会话时服务端先直发带最新 `attachState`（`role: 'companion'`）的实时 `session.ready` 并跳过历史 `t=0` `session.ready` 重放，同时前端对带 `serverSeq` 的同会话补播 `session.ready` 守卫保留 `companion` 角色，消除首屏角色与状态被历史快照覆盖的竞态问题；`App.tsx` / `api.ts` 同步合并并发 `ensureAuthSession()` 消除深度链接 401 竞态。
2. **前端独立伴随路由与零采音隔离（`CompanionView.tsx:43-548` & `useCompanionSession.ts:17-171`）**：
   - `?view=companion&sessionId=...` 在 `App.tsx` 顶层分支直出 `<CompanionShell />`，只挂载 `useCompanionSession(sessionId)`，源码级完全不引入或不初始化 `AudioCapture` / 浏览器麦克风（实测探针 **`getUserMediaCalls === 0`**），不新建第二套主控 Runtime，也不监听主控快捷键 `M`/`Space`。

---

## 2. 双角色 `/ws` 协议与严格权限矩阵（已源码及实测双验）

核心契约定义于 `packages/protocol/src/events.ts:35-89` 与 `GatewayServer.ts:1425-1505, 1859-1888`：

| 维度 | `primary`（主控端） | `companion`（随行观察端） |
| --- | --- | --- |
| **握手附着与重连** | `/ws?token=...&role=primary`（支持 `&sessionId=...&lastSeenSeq=...`） | `/ws?token=...&role=companion&sessionId=<sid>&lastSeenSeq=...`（`CueXWSClient.ts` 首次建连即直带参数；未及时收到 `session.ready` 时 60ms 自动补发 `session.attach`） |
| **`WsRolePolicy` 策略对象** (`events.ts:70-89`) | `canCaptureMic: true`, `canControlSession: true`, `canModifyContext: true`, `canViewInspector: true`, `canInteractWithCues: true` | `canCaptureMic: false`, `canControlSession: false`, `canModifyContext: false`, `canViewInspector: true`, `canInteractWithCues: true` |
| **允许执行的 WS 指令** (`GatewayServer.ts:1425-1431`) | 全部合法客户端指令 | 仅限 **`session.attach`、`ping`、`intervention.request_help`、`intervention.dismiss`、`intervention.feedback`**（快捷键仅限 `H` / `Esc`） |
| **越权拦截与防冲突** (`GatewayServer.ts:1492-1505, 1859-1867`) | 同一活跃会话已有在线 `primary` 时再接入第二个 `primary` -> 拒绝返回 **`PRIMARY_MIC_CONFLICT` (`409`)** | 发送 `audio.chunk`、`speech.delta`、`session.start/pause/resume/silent/end/wipe`、`chapter.set`、`intervention.set_ceiling`、`rehearsal.start` -> 统一拒绝返回 **`COMPANION_READ_ONLY` (`403`)** |
| **重连安全退避** | 网络抖动支持有限次数退避重连 | 收到 `4001/4003/4009/1008` 等策略拒绝关闭码时不盲目死循环重连 |

---

## 3. 浏览器三级启动形态与真实 UI 边界（`StageView.tsx:240-294`）

主舞台点击打开伴随窗（必须由真实用户点击手势触发 `handleOpenCompanionWindow`）按以下三级渐进增强与降级：

1. **Tier A（浏览器能力支持时）：`Document Picture-in-Picture` (`440×680`)**：探测 `window.documentPictureInPicture?.requestWindow`，打开内嵌同源 `<iframe src="?view=companion&sessionId=...">` 的轻量悬浮小窗（已于 `companion-window-e2e.test.mjs` 验证在真实 Chromium 环境下正常拉起并实时通信）。
2. **Tier B（标准弹出降级）：`window.open(..., 'noopener,width=460,height=720')`**：在扩展副屏或窗口化分屏右侧打开独立伴随窗（同时附带手点“伴随窗直达链接”兜底）。
3. **Tier C（弹窗受阻回退）：`StageView` 内置 `Split Strip` 精简侧边栏**：同页窄条兼容持续展示实时章节与 `L1–L3` 锚点。

`CompanionView` 严格遵守 Warm Paper Daylight (`#F8F7F3`) 与 WCAG AA 对比度规范，顶栏清晰分拆展示 **ASR（`SenseVoiceSmall`） / System 1（Colab JEV 或本地规则） / System 2（CPA 或本地合成）** 与主控连接在线度，并向用户诚实声明：

> *“已以 Document PiP / 新独立窗口打开伴随窗（注：浏览器无法保证系统级置顶覆盖全屏 PPT/Keynote）。”*（`StageView.tsx:274, 289`）

---

## 4. 双窗口联动与真机全链路 E2E 实测验收（100% `--mute-audio`）

### 4.1 跨端 Chromium 双窗口静音 E2E（`apps/web/test/companion-window-e2e.test.mjs` `#115`）
- **运行命令**：`CUEX_TEST_OFFLINE=1 node --test apps/web/test/companion-window-e2e.test.mjs`（Chromium `--mute-audio` 零扬声器外放）
- **结果**：**Exit `0`，`1/1` 通过（耗时 `4,802.32 ms`，`0` 失败、`0` 跳过），完整通过全部 **10 项核心断言**：
  1. 主控开启会话并经 `open-companion-window-btn` 渐进打开 `Document PiP`（内嵌 `/ ?view=companion&sessionId=...`）与回退直达链接；
  2. 伴随窗明确显示 `companion 只读附着` 与 `不采集麦克风`，注入探针实测 **`getUserMediaCalls === 0`**、禁止指令发送量 `0`，并诚实披露非 OS 级全屏置顶边界；
  3. 主控偏离触发的提示双向实时同步展示于伴随窗；
  4. 伴随窗触发点赞反馈、`intervention.dismiss`（忽略）与 `intervention.request_help`（手动求助）均精确回流至主控与黑板；
  5. 主控覆盖关键点自然恢复后，双端同步呈现 `focus-withdrawn-banner` / `companion-withdrawn-banner` 自动撤回；
  6. 主控 `Inspector` 严格拆分显示 `ASR` / `System 1` / `System 2` 归因及 `S1 单轮观测`、`S2 System2Guidance` 与 `DualSystemCollaborationMetrics`；
  7. 原生 WS 探测 `companion` 越权发送 `audio.chunk` / `session.pause` / `session.end` 均触发 `COMPANION_READ_ONLY`；
  8. 第二个 `primary` 试图接入同一会话返回 `PRIMARY_MIC_CONFLICT` 拒绝双麦冲突；
  9. 关闭伴随窗后主控端仍稳态维持 `实时协同中`；
  10. `420×720` 独立伴随窗实现 **`0px` 横向溢出**，主控结束会话后伴随窗同步进入 `companion-session-ended` 终态，双端控制台 `0` 错误。

### 4.2 三路真机后端联动 Companion 验证（`dual-system-real-validation.json` `#119`）
- **`Scenario A`**：真实 WAV 注入 Colab `:10086` -> `:10010` JEV-27B 时，并发以 `role=companion` 附着发送越权 `speech.delta`，真实 Gateway 正确返回 `COMPANION_READ_ONLY` 拦截且主会话不受影响；
- **`Scenario B/C`**：伴随窗与主控端实时同步接收 CPA `gemini-4-hydrogen` 发出的 `System2Guidance`、`intervention.shown` 及自然恢复 `user_recovered` 撤回，并在伴随窗触发高优 `manual_help` 直达 CPA S2。
