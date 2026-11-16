# CueX AI Employee Demo Pack & Real Audio Corpus

本目录存放 **CueX Phase 3 实机端到端演示物料** 与 **14 条 16kHz 单声道 PCM16 WAV 普通话/中英混读测试语料**，供 Colab GPU ASR 基准对比、流式 WebSocket 验收及 CueX 全链路端到端实测使用。

## 1. 目录结构

- `cuex-presentation-pitch.md`：用于 CueX Presentation Compiler 编译的真实路演讲稿大纲（含 4 章节与关键数值）。
- `cuex-fact-whitelist.json`：8 条已锁定（`locked: true`）的真实核验事实白名单（用于防幻觉 grounding）。
- `cuex-qa-bank.json`：3 条已准备高压问答 + 1 条刻意保留的未覆盖缺口（`prepared: false`）。
- `audio/*.wav`：14 条 16kHz / 16-bit / mono PCM16LE 真实 WAV 音频文件。
- `audio/manifest.json`：全部 14 条音频的精确文本标注（`groundTruth` / `normalizedTruth`）、声学变换参数、语速与预期 CueX 运行时行为。

## 2. 语料生成方式透明声明（Methodology Transparency）

- **生成方式**：全部 WAV 文件均由 macOS 神经网络中文语音合成引擎（`say -v Tingting`、`say -v Meijia`、`say -v "Rocko (中文（中国大陆）)"`）合成 AIFF 后经 `ffmpeg` 转码为 `16000 Hz, mono, pcm_s16le` 标准 WAV，并结合真实信号处理变换（语速调节 185–245 wpm、插入 1.2s 自然停顿与语气填充词、-16 dB 低麦克风增益、+9 dB 高增益软限幅、14 dB SNR 会议室粉噪混合、双说话人中途打断拼接）。
- **与真人现场录音的边界区分**：本语料为**“神经网络 TTS 渲染人声 + 声学信号退化变换”**生成的标准可控测试集，并非真实线下会议室多麦克风真人录制的原声录音；后续真实用户试用队列（第 1 轮 20–30 人）将补充真人现场录音评测。
