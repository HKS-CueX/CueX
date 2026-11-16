# CueX 75–90 秒实机产品演示脚本（Demo Script）

> **发布状态**：**终版已锁定（Phase 4 Verified）**（界面流程完全同步 `@presentation-web` Warm Paper / Achromatic Ledger 重构界面，实测指标同步 `@runtime-server` Colab GPU `SenseVoiceSmall` ASR `52.57 ms / 0.00327 RTF` + 统一 CPA `gemini-4-hydrogen` `6/6 S1` + `14/14 Section 5.2` 全链路验收，及离线 `eval` `0.88 ms`）。  
> **静音验证纪律（Silent Validation Rule）**：任何自动化脚本、headless Chromium 预演或语料注入必须强制开启 **`--mute-audio`**，且语料流统一走 **离线合成 WAV 文件直推 `/ws` 二进制帧或文件上传**，**绝不调用本机扬声器播放声音**（现场人工对麦讲解时正常口播即可）。

---

## 一、演前准备检查（Pre-Flight Check）

1. **后端双模状态核验**：确认 `apps/server` 运行且 `GET /health` 返回：
   - `asr`：处于 **`colab_gpu`（`ready`，`FunAudioLLM/SenseVoiceSmall`）** 或明确可见的降级状态（如现场强噪声环境切换文本/受控注入时，保持 UI 徽章如实标注，绝不隐瞒）；
   - `system1 / system2`：指向统一 CPA 网关（`gemini-4-hydrogen`），可追溯 `provider_reported` / `provider_unreported` / `local_rule_zero`。
2. **界面与材料准备**：
   - 浏览器打开重构后的 `Warm Paper #F8F7F3` 前端（`1440×900` 干净单窗），确认左上角为矢量 `/brand/cuex-wordmark.svg`；
   - 预置 `demo-pack` 示例讲稿与 `manifest` 校验语料（或已准备的一份 `.pptx / .md` 讲稿）。

---

## 二、75–90 秒五幕实机分镜剧本（目标总长：80 秒）

| 时段 | 页面视图 | 屏幕真实操作（Strictly Matches Phase 3 UI） | 现场解说口播（配合节奏） | 评委验收焦点 |
| :--- | :--- | :--- | :--- | :--- |
| **`00:00 – 00:12`**<br>*(12s)* | **`HomeView`**<br>*(`The printed annual`)* | 停留首页 **`One Live Thing`** 交互体验区，轻点切换 `L0 静默` → `L1 微光` → `L2 锚点` → `主动退出`；随后点击主行动按钮进入材料编译。 | “传统提词器一提问就卡，普通 AI 副驾又满屏文字抢眼神。CueX 先用交互板说清哲学：平时 `L0` 闭嘴，只在必要一秒给极简微光或短锚点，接回立刻撤回。” | 品牌极简美学 + `One Live Thing` 秒懂心智 + `Presentation` 已实现与 `Planned` 边界 |
| **`00:12 – 00:26`**<br>*(14s)* | **`CompilerView`** | 点击载入 `demo-pack` 演讲材料（或拖入 `.pptx/.md`）并执行**「编译演讲上下文」**；扫过一页式导播卡、本人**锁定事实标记 (`locked`)** 及预测问答；勾选隐私确认后进入舞台。 | “上台前导入自己的讲稿，编译器自动抽出带原文溯源 `Evidence[]` 的结构化提纲，关键商业数字由本人锁定，绝不允许台上的 AI 自行改数编造。” | 4 格式解析 + `Evidence[]` + `locked: true` 人工锁防线 |
| **`00:26 – 00:46`**<br>*(20s)* | **`StageView (Focus 视图)`** | ① 讲者顺畅开口说第一段（`clip_01` 问候与开篇）→ **屏幕保持 `L0` 零弹窗静默**；<br>② 故意跳过关键论据或短暂停顿（`omission/drift`）→ 边缘亮起 **`CueEdgeLight` 琥珀微光 (`L1`)**，随后门控放行 `L2` 极短锚点胶囊（含 `Evidence` 引用）；<br>③ 讲者立即口播补出该关键点 → **胶囊毫秒级触发 `user_recovered` 自动撤回！** | “进入极简 Focus 视图：当我照着逻辑顺畅开讲，AI 绝不打断我；一旦漏掉核心论据，边缘先微光提醒，接着只给一眼看清的 2–6 字锚点；**注意看——只要我把话接回来，提示立刻自动消失！**” | 问候语不误报 `answering_question` + `L0` 静默克制 + `L1/L2` → `user_recovered` 自动撤回 |
| **`00:46 – 01:02`**<br>*(16s)* | **`StageView (Inspector 视图 + Q&A)`** | 输入或触发一句**未在讲稿准备过的超纲追问**（`ungrounded Q&A`），点击切至 **`Inspector` 透视视图**：指出右侧实时监控账本——真实 `colab_gpu` (`ready` / RTF) 徽章、CPA `gemini-4-hydrogen` 调用耗时、`reasoningTokens` 透明账本、门控 `suppressReason` 与明确的 **`missingEvidenceNotice`（缺证据诚实拒答）**。 | “遇到材料没准备的超纲追问，CueX 绝不胡编数字，而是老实提醒‘缺少依据’；切到 Inspector 透视面板，GPU 识别状态、CPA 模型实耗与每次拦截原因全公开可审计。” | 7 态 `colab_gpu` 真实标识 + `gemini-4-hydrogen` 决策依据 + 缺据诚实拒答防幻觉 |
| **`01:02 – 01:20`**<br>*(18s)* | **`ReflectionView` & `Memory`** | 点击结束进入 **`ReflectionView`**：展示顶部 `Achromatic ledger` 量化账本与 **`V = H − 2I`** 净效用、自动撤回计数及弱项单点重练按钮；演示对一条候选记忆点击**「允许写入」**进入下方个人记忆列表，并指向**「一键彻底擦除本场数据（`/wipe`）」**。 | “散场后用 `V = H − 2I` 算清帮了忙还是添了乱，薄弱片段可一键直接单点重练；个人习惯记忆也必须经你亲手点同意才留存，并可随时一键彻底擦除。这就是 CueX。” | 量化复盘 + 单点重练闭环 + 人工审批记忆 + `/wipe` 数据主权 |

---

## 三、评审现场离线与静音容灾预案（Fallback Rules）

1. **会场高噪或弱网切换**：若现场多人嘈杂干扰收音，可当场坦诚切换使用 `StageView` 文本注入或预置离线 WAV 流推入 `/ws`（保持 `colab_gpu` / `local_sherpa` / `text_simulation` 状态标签 100% 如实显示），绝不伪装“正在使用麦克风”。
2. **75 秒紧凑版剪裁**：将 `00:00–00:12` 首页讲解压缩至 5 秒后直接进入 `CompilerView`，完整保留中段 **“Focus 自动撤回 + Inspector 超纲诚实拒答 + Reflection 审批记忆”** 核心高光。
