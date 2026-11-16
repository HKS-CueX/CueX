# CueX Presentation Live Demo Showcase (`demo/`)

本目录梳理 **CueX Presentation（演讲与答辩临场引导师）** 75–90 秒路演实机演示路径、真实语音测试语料与无声验证纪律，方便评审与复现测试按图索骥。

## 1. 演示核心文件索引

| 资产 | 路径 | 说明 |
| --- | --- | --- |
| **路演逐字演示脚本** | [`CueX-Demo-Script.md`](CueX-Demo-Script.md) | 75–90 秒 4 幕实时实操脚本（已锁定 Phase 3 Colab GPU ASR + CPA `gemini-4-hydrogen` + Warm Paper UI） |
| **Token 真实遥测图** | [`token-usage-proof.png`](token-usage-proof.png) | 脱敏实机遥测（`cpa-llm-report.v2` `15,399` Tokens / `costFen: 0` + Colab GPU `52.57 ms` + `ui-stage-inspector-1440`）与 `#12` 成本校准图谱 |
| **14 段测试语料与事实包** | [`../mandatory/ai-employee-demo/demo-pack/README.md`](../mandatory/ai-employee-demo/demo-pack/README.md) | 16 kHz 单声道 PCM16 WAV（总计 225.344 秒）合成普通话/双语演讲片段 + `cuex-fact-whitelist.json` + `cuex-qa-bank.json` |
| **实测证据与 UI 截图** | [`../mandatory/ai-employee-demo/evidence/`](../mandatory/ai-employee-demo/evidence/) | `colab-asr-report.json`、`cpa-llm-report.json`、`real-e2e-validation.json` 与核心 UI 实拍截图 |
| **全套页面截图导览** | [`../assets/previews/`](../assets/previews/) | 从首页、Compiler、Stage（Focus/Inspector）到 Reflection 与数据清除的 15 张实测视图 |

## 2. 四幕标准演示流（Silent & Grounded）

1. **首页「One Live Thing」认知克制演示**（`ui-home-1440.png`）：现场交互切换 `L0 → L1 → L2 → L3 → 主动退出`，直观展示 `V = H − λI` 门控与不抢注意力的克制定位。
2. **场前 Compiler 锁事实**（`ui-compiler-facts-1440.png`）：一键载入路演演示包（8 条确认事实 + 5 条预测追问），确认红线规则与隐私麦克风知情勾选。
3. **场中 Focus + Inspector 双视角对比**（`ui-stage-focus-l0-1440.png` → `ui-stage-focus-l2-1440.png` → `ui-stage-inspector-1440.png`）：流畅段静默 `L0`，偏题/漏讲瞬间 `L2` 弹出 2–6 字锚点并标出 `FactWhitelist` 依据，纠正后自动撤回；切换 `Inspector` 查看实时 `ASR`、`System 1/2`、`Controller` 与真实计量口径。
4. **场后复盘与主权清除**（`ui-reflection-1440.png` → `ui-memory-drawer-1440.png`）：展示 `V = H − λI`、单点重练卡片、需显式 `userConfirmed = true` 的记忆落盘控制以及 `/wipe` 一键清除。

## 3. 测试与语料诚实声明

- `demo-pack/audio/*.wav` 仅用于离线端到端语音识别与控制器回归验证，并在其 `README.md` 明确披露合成来源；不等同于高噪真实物理会场远场拾音成绩。
- 全部自动化浏览器与端到端回归均强制使用 Chromium `--mute-audio` 无声运行，不在本地扬声器外放任何音频。
