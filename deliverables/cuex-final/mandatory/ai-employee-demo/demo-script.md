# CueX 75–90 秒实机产品演示脚本（AI Employee Demo Script）

> **对齐原则**：100% 对齐 `apps/web` Phase 3 重构后设计系统（Warm Paper `#F8F7F3` / Achromatic Ledger / `--amber-ink #A84B07`）与真实状态机流（`HomeView` → `CompilerView` → `StageView [Focus / Split-Strip / Inspector]` → `ReflectionView` + `Account / Memory Drawer`）。  
> **推荐总时长**：**80 秒**（严格控制于 `75–90s`，匹配 5 分钟 Pitch 的 `01:10 – 02:15` 演示窗口与独立 AI 员工实机验真）。  
> **对应真机证据截图**：`evidence/ui-compiler-facts-1440.png`、`evidence/ui-stage-focus-l2-1440.png`、`evidence/ui-stage-inspector-1440.png`、`evidence/ui-qa-degraded-inspector-1440.png`、`evidence/ui-reflection-1440.png`。

---

## 0. 演前核验（Pre-Flight Check）

1. 按 [`operator-runbook.md`](operator-runbook.md) 确认后端（`127.0.0.1:8765`）与前端（`5173`）运行正常；实机演示前确认 `GET /health` 显示 `colab_gpu: ready` 与 `system1/system2: real (gemini-4-hydrogen)`，或明确切换为确定性离线/降级模式演示。
2. 浏览器以浅色模式打开前端首页（推荐 `1440×900` 或 `1920×1080`；若评审投屏在静音环境，确保无外放扬声器干扰，遵循 `--mute-audio` 验证准则）。
3. 准备好 [`demo-pack/cuex-presentation-pitch.md`](demo-pack/cuex-presentation-pitch.md) 或使用 `CompilerView` 内置「一键载入示例包」，确认**隐私授权勾选框**处于可见且默认未勾选状态。

---

## 1. 80 秒分镜操作与口播（4 幕真实交互）

| 时段 | 页面与组件 | 屏幕真实操作（Strictly Matches UI） | 口播核心台词（同步舞台节奏） | 验证机制与真实证据锚点 |
| :--- | :--- | :--- | :--- | :--- |
| **`00:00 – 00:12`**<br>*(12s)* | **`HomeView`** | 停留在首屏交互体验区，依次点击四态模拟按钮：`L0 静默观察` → `L1 边缘微光` → `L2 关键词锚点` → `主动撤回`；点击主行动按钮进入材料编译工作台。 | “传统 AI 助手爱刷出长篇大论抢占注意力，传统提词器遇追问即卡死。CueX 首先是‘闭嘴守门员’：平时保持 L0 静默，仅在真需要时给到 L1 边缘微光或 L2 短锚点，讲者自己接回就自动撤回。” | 品牌心智对齐 + 演讲场景与 Roadmap 分界声明 |
| **`00:12 – 00:28`**<br>*(16s)* | **`CompilerView`** | 点击「载入 CueX 路演演示包」并触发编译；切过右侧台账标签：**导播单（Cue Sheet）** → **事实白名单（Facts）**（展示 `locked: true` 不可篡改标签与 `Evidence` 编号）→ **预测 Q&A（`AI 预测` / `prepared: false` 缺口）**；勾选下方**隐私确认勾选框**后点击「开始彩排」。 | “上台前导入 `.pptx / .pdf / .md` 讲稿。系统编译出带原文编号的事实白名单与禁用边界——比如我锁定的核心报价与实测数值，`locked: true` 保证 AI 绝不敢脱稿瞎改；未录入的营收问题则预先标出缺口。” | `DocumentExtractor` 多格式解析 + `Evidence[]` 强绑定 + 上台前人工核对 |
| **`00:28 – 00:46`**<br>*(18s)* | **`StageView (Focus & Split-Strip)`** | ① 顺畅陈述已覆盖章节（或播放/注入 `01/02` 片段文本）→ 屏幕保持 **`L0` 静默无弹窗**；<br>② 故意遗漏或停顿后接偏题片段（对应 `clip_10/11`）→ 屏幕边缘 **`CueEdgeLight` 琥珀微光亮起 (`L1`)**，随即推出 **`L2` 轻量短锚点卡**（带原文 `ev_*` 溯源标注，参考 `ui-stage-focus-l2-1440.png`）；<br>③ 讲者立即顺势补出关键结论 → **卡片触发 `user_recovered` 自动撤回消失**！ | “进入极简 Focus 台：我表达顺畅时，AI 主动忍住不打扰；一旦出现关键要点遗漏，先给余光微光、再推送一条 2–6 字短锚点；**注意看——只要我把话自己接回来，提示立刻自动消失，绝不留字抢评委眼神！**” | `InterventionController` 独立门控、`CueEdgeLight`、短胶囊、`user_recovered` 自动撤回 |
| **`00:46 – 01:02`**<br>*(16s)* | **`StageView (Inspector + Q&A)`** | 切换角色为 `audience` 并提问一道未覆盖的商业营收追问（对应 `demo_qa_04: prepared: false`），同时切至顶部 **`Inspector` 透视视图**（见 `ui-stage-inspector-1440.png`）：指向**实时 ASR 状态徽章**（`colab_gpu: ready` / `SenseVoiceSmall` 均值 `52.57 ms`）、**控制器决策流水**（`controllerAction`、`suppressReason`、`gemini-4-hydrogen` / `local_rule_zero`），以及对缺失依据返回的**「资料未覆盖 / 请勿编造」诚实提示**。 | “切到 Inspector 透视台，评委能看到每一次不出手或出手的完整工程日志：当前走 Colab GPU 流式 ASR 还是断网回退通道、门控为何拦截或放行，以及遇到未准备的营收追问时系统宁可标明‘资料未覆盖’，绝不胡编。” | `Inspector` 全链路可观测、`missing_evidence_notice` 零幻觉防线、诚实降级透传 |
| **`01:02 – 01:20`**<br>*(18s)* | **`ReflectionView + Drawer`** | 点击**「结束并进入复盘」**：展示顶部 **`V = H − λI`（`λ = 2`，探索性效用口径）净效用**、自动撤回与打扰计数及 `weakSegments`；点击弱项卡片的**「单点重练此片段」**演示入口；打开 **`Memory` / `Account` 抽屉**，对一条候选习惯点击**「允许写入」**完成人工审批，并指向**导出数据包 / `/wipe` 一键彻底销毁**入口。 | “散场后不用虚幻评分，而是以探索性效用 `V = H − 2I` 量化本场是否真正帮到了讲者；弱项一键原地重练；跨场习惯记忆必须由讲者逐条审批写入，支持导出与一键彻底擦除。这就是 CueX。” | `V = H − λI` 复盘、单点重练、人工审批记忆与主权擦除（`400/201/200/200`） |

---

## 2. 现场控场与兜底预案（Fallback Protocol）

1. **会场强噪音或隧道瞬断应对**：如果路演现场 WIFI 波动导致外部 Colab GPU ASR 或 CPA 网关短暂超时（触发 **`80 ms` 级超时降级**或断线重连），`StageView Inspector` 与顶部状态栏会自动高亮显示 **`Degraded / local_rule_zero`** 诚实挂牌（如 `evidence/ui-qa-degraded-inspector-1440.png` 所示），切勿掩饰；可顺势向评委演示“不静默假装云端可用”的容错诚实设计，并通过底部 `presenter` / `audience` 注射区（`progressiveSim`）继续完成控制闭环演示。
2. **75 秒紧凑版剪裁**：将 `00:00–00:12` 的 `HomeView` 简短旁白压进 `CompilerView` 载入 5 秒间隙内，完整保留 `L0 静默 -> L2 短锚点 -> user_recovered 自动撤回` 与 `V = H − 2I` 复盘主干。
