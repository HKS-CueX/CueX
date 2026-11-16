export function buildFontCss(fonts) {
  return `
    @font-face {
      font-family: 'CueXDisplay';
      src: url('${fonts.instrumentSerif}') format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'CueXCJKSerif';
      src: url('${fonts.notoSerifSc}') format('truetype');
      font-weight: 200 900;
    }
    @font-face {
      font-family: 'CueXCJK';
      src: url('${fonts.notoSansSc}') format('truetype');
      font-weight: 100 900;
    }
    @font-face {
      font-family: 'CueXSans';
      src: url('${fonts.inter}') format('truetype');
      font-weight: 100 900;
    }
    @font-face {
      font-family: 'CueXMono';
      src: url('${fonts.jetbrainsMono}') format('truetype');
      font-weight: 100 800;
    }
    * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
    .tabular { font-variant-numeric: tabular-nums; }
  `;
}

const BASE_COLORS = {
  bg: '#F8F7F3',
  card: '#FFFFFF',
  tint: '#F2EFE8',
  tintWarm: '#FDF5EE',
  tintViolet: '#F4F1FC',
  ink: '#111318',
  muted: '#555863',
  subtle: '#7B7E88',
  hairline: '#D9D6CE',
  amber: '#E87A24',
  amberBright: '#FF7A2F',
  violet: '#7C3AED',
  sage: '#246A4D',
  rust: '#C94A2A',
};

export function renderCoverHtml(metrics, assets) {
  const C = BASE_COLORS;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  ${buildFontCss(assets.fonts)}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 1920px; height: 1080px; overflow: hidden;
    background: ${C.bg}; color: ${C.ink};
    font-family: 'CueXSans', 'CueXCJK', 'PingFang SC', sans-serif;
    display: flex; flex-direction: column; position: relative;
  }
  .top-bar { width: 100%; height: 8px; background: linear-gradient(90deg, ${C.amberBright} 0%, #D96B27 42%, ${C.violet} 100%); flex-shrink: 0; }
  .wrap { flex: 1; padding: 44px 76px 36px 76px; display: flex; flex-direction: column; justify-content: space-between; }
  .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 20px; border-bottom: 1px solid #E5E2D9; }
  .brand-top { display: flex; align-items: center; gap: 14px; }
  .brand-top img { width: 34px; height: 34px; display: block; }
  .eyebrow { font-family: 'CueXMono', monospace; font-size: 14px; font-weight: 700; letter-spacing: 0.14em; color: #5B21B6; }
  .top-badges { display: flex; align-items: center; gap: 12px; }
  .badge { font-size: 13px; font-weight: 600; padding: 7px 16px; border-radius: 999px; border: 1px solid #DDD8CE; background: #FFFFFF; color: #474B57; }
  .badge-amber { border-color: #F2C6A0; background: #FBF0E6; color: #A84B07; }
  .main { display: grid; grid-template-columns: 1.02fr 1.08fr; gap: 64px; align-items: center; flex: 1; padding: 18px 0; }
  .left { display: flex; flex-direction: column; gap: 20px; }
  .wordmark { font-family: 'CueXDisplay', Georgia, 'CueXCJKSerif', serif; font-size: 136px; line-height: 0.94; font-weight: 700; letter-spacing: -0.025em; color: ${C.ink}; }
  .wordmark span.x { background: linear-gradient(135deg, #E87A24 0%, #D96B27 52%, #7C3AED 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .tagline-cn { font-family: 'CueXCJKSerif', 'Songti SC', serif; font-size: 56px; font-weight: 700; line-height: 1.15; color: ${C.ink}; margin-top: 2px; }
  .sub-cn { font-size: 28px; font-weight: 400; color: #474B57; line-height: 1.4; }
  .summary { font-size: 18px; line-height: 1.65; color: #474B57; max-width: 720px; }
  .pill-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 8px; }
  .stat-card { background: #FFFFFF; border: 1px solid #E2DFD6; border-radius: 12px; padding: 16px 18px; position: relative; overflow: hidden; }
  .stat-card::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 4px; border-radius: 0 4px 4px 0; }
  .stat-card.amber::before { background: #A84B07; }
  .stat-card.violet::before { background: #7C3AED; }
  .stat-card.green::before { background: #1F6B52; }
  .stat-label { font-family: 'CueXMono', monospace; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 6px; }
  .stat-card.amber .stat-label { color: #A84B07; }
  .stat-card.violet .stat-label { color: #5B21B6; }
  .stat-card.green .stat-label { color: #1F6B52; }
  .stat-title { font-size: 17px; font-weight: 700; color: #111318; line-height: 1.35; }
  .stat-desc { font-size: 13px; color: #626774; margin-top: 4px; }
  .right-panel { background: #FFFFFF; border: 1px solid #DEDAD0; border-radius: 20px; padding: 26px 28px; display: flex; flex-direction: column; gap: 18px; box-shadow: 0 12px 36px rgba(17, 19, 24, 0.045); }
  .x-stage { background: #F8F7F3; border: 1px solid #E5E2D9; border-radius: 14px; padding: 20px 22px; }
  .x-corners { display: flex; justify-content: space-between; align-items: center; }
  .node { font-size: 13px; font-weight: 600; padding: 7px 14px; border-radius: 8px; border: 1px solid #DFDCD2; background: #FFFFFF; color: #474B57; }
  .node-active { background: #FBF0E6; border-color: #E8A66D; color: #A84B07; }
  .node-center { font-family: 'CueXMono', monospace; font-size: 12px; color: #474B57; text-align: center; }
  .x-center { display: flex; align-items: center; justify-content: center; gap: 26px; margin: 16px 0; }
  .x-center img { width: 164px; height: 164px; }
  .x-axis-notes { display: flex; flex-direction: column; gap: 10px; max-width: 380px; }
  .axis-tag { border-left: 3px solid #A84B07; padding: 6px 12px; background: #FFFFFF; border-radius: 0 8px 8px 0; border-top: 1px solid #E8E5DC; border-right: 1px solid #E8E5DC; border-bottom: 1px solid #E8E5DC; }
  .axis-tag.v { border-left-color: #7C3AED; }
  .axis-tag.k { border-left-color: #1F6B52; }
  .axis-k { font-size: 12px; font-weight: 700; color: #111318; }
  .axis-v { font-size: 12px; color: #474B57; margin-top: 2px; }
  .triptych { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .shot-card { border: 1px solid #E2DFD6; border-radius: 10px; overflow: hidden; background: #F8F7F3; }
  .shot-card img { width: 100%; height: 144px; object-fit: cover; object-position: top center; display: block; border-bottom: 1px solid #E2DFD6; }
  .shot-cap { padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; background: #FFFFFF; }
  .shot-title { font-size: 12px; font-weight: 700; color: #111318; }
  .shot-step { font-family: 'CueXMono', monospace; font-size: 12px; color: #5B21B6; font-weight: 700; }
  .footer { border-top: 1px solid #E5E2D9; padding-top: 16px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #626774; }
  .footer-mono { font-family: 'CueXMono', monospace; font-size: 12px; color: #474B57; }
</style>
</head>
<body>
  <div class="top-bar"></div>
  <div class="wrap">
    <div class="header">
      <div class="brand-top">
        <img src="${assets.symbolDim}" />
        <span class="eyebrow">CUEX · UNIVERSAL COGNITIVE RUNTIME</span>
      </div>
      <div class="top-badges">
        <span class="badge">HKS 2026 · OPC 模式创新赛道</span>
        <span class="badge badge-amber">FIRST WEDGE · CueX Presentation</span>
        <span class="badge">TEAM · ${metrics.team.name}</span>
      </div>
    </div>

    <div class="main">
      <div class="left">
        <div class="wordmark">Cue<span class="x">X</span></div>
        <div class="tagline-cn">你的快思考外挂</div>
        <div class="sub-cn">在深度思考之外，接住当下。</div>
        <p class="summary">
          面向真实高压即时交流的通用实时认知运行时：<strong>System 1 琥珀快流</strong>识别意图、遗漏与偏题，<strong>System 2 紫晶慢流</strong>严守已确认事实白名单按需推理，<strong>独立控制器（L0–L3）</strong>在余光瞬间介入并在说话人接回主线后自动撤回。
        </p>
        <div class="pill-row">
          <div class="stat-card amber">
            <div class="stat-label">FIRST WEDGE MVP</div>
            <div class="stat-title">演讲与答辩临场引导师</div>
            <div class="stat-desc">场前锁事实 · 场中最小介入 · 场后复盘</div>
          </div>
          <div class="stat-card violet">
            <div class="stat-label">CONTROL KERNEL</div>
            <div class="stat-title">V = H − λI 量化抑制门控</div>
            <div class="stat-desc">λ = ${metrics.eval.lambda} 惩罚冗余打扰，撤回免罚分</div>
          </div>
          <div class="stat-card green">
            <div class="stat-label">REAL TELEMETRY LOCKED</div>
            <div class="stat-title">52.57ms ASR · 14/14 E2E</div>
            <div class="stat-desc">离线 ${metrics.eval.avgLatencyMs}ms 零 Token · 12 项敏测 ≥80.2%</div>
          </div>
        </div>
      </div>

      <div class="right-panel">
        <div class="x-stage">
          <div class="x-corners">
            <div class="node node-active">演讲与答辩 · Presentation [已实现]</div>
            <div class="node">社交 · Social [路线图]</div>
          </div>
          <div class="x-center">
            <img src="${assets.symbolDim}" />
            <div class="x-axis-notes">
              <div class="axis-tag">
                <div class="axis-k">System 1 · 实时感知判定流</div>
                <div class="axis-v">区分自然停顿与真实卡壳，拒绝纯停顿秒数误报</div>
              </div>
              <div class="axis-tag v">
                <div class="axis-k">System 2 · 实证约束候选流</div>
                <div class="axis-v">严格绑定 FactWhitelist 依据，未覆盖即诚实标缺口</div>
              </div>
              <div class="axis-tag k">
                <div class="axis-k">Independent Controller · L0–L3</div>
                <div class="axis-v">Cooling / Ceiling / Self-Retract 独立把关</div>
              </div>
            </div>
          </div>
          <div class="x-corners">
            <div class="node">讲课 · Teaching [路线图]</div>
            <div class="node-center">持续理解 · 适时提示 · 最小干预 · 主动退出</div>
            <div class="node">销售 · Sales [路线图]</div>
          </div>
        </div>

        <div class="triptych">
          <div class="shot-card">
            <img src="${assets.uiCompilerFacts}" alt="Pre-Stage Compiler FactWhitelist" />
            <div class="shot-cap">
              <span class="shot-title">场前 · FactWhitelist 锁死</span>
              <span class="shot-step">PRE</span>
            </div>
          </div>
          <div class="shot-card">
            <img src="${assets.uiStageFocusL2}" alt="Live Stage Focus L2 Cue" />
            <div class="shot-cap">
              <span class="shot-title">场中 · L2 关键词余光提示</span>
              <span class="shot-step">LIVE</span>
            </div>
          </div>
          <div class="shot-card">
            <img src="${assets.uiReflection}" alt="Post-Stage Reflection" />
            <div class="shot-cap">
              <span class="shot-title">场后 · 净效用复盘与单点重练</span>
              <span class="shot-step">POST</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <div>X，代表任意高压即时场景 · 实时理解，只做最小必要干预</div>
      <div class="footer-mono">Warm Paper Daylight #F8F7F3 · Amber × Violet Identity · Real Phase 3 Product Captures</div>
    </div>
  </div>
</body>
</html>`;
}

export function renderJobSpecHtml(metrics, assets) {
  const C = BASE_COLORS;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  ${buildFontCss(assets.fonts)}
  @page { size: 210mm 296.4mm; margin: 0; }
  html, body {
    margin: 0; padding: 0;
    width: 210mm; height: 296.4mm;
    background: ${C.bg};
    color: ${C.ink};
    font-family: 'CueXSans', 'CueXCJK', 'PingFang SC', sans-serif;
    overflow: hidden;
  }
  .sheet {
    width: 210mm; height: 296.4mm;
    padding: 13mm 15mm 12mm 15mm;
    display: flex; flex-direction: column; justify-content: space-between;
    position: relative;
  }
  .topbar {
    position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, ${C.amberBright}, ${C.violet});
  }
  .sec {
    background: ${C.card};
    border: 1px solid ${C.hairline};
    border-radius: 9px;
    padding: 10px 14px;
  }
  .sec-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 6px;
    border-bottom: 1px solid ${C.hairline};
    padding-bottom: 4px;
  }
  .sec-title {
    font-size: 13.5px; font-weight: 800; color: ${C.ink};
    display: flex; align-items: center; gap: 8px;
  }
  .sec-no {
    font-family: 'CueXMono', monospace; font-size: 11px;
    padding: 1px 7px; border-radius: 4px; background: ${C.tintWarm}; color: ${C.amber};
    border: 1px solid rgba(232,122,36,0.3);
  }
  .sec-body {
    font-size: 11.7px; line-height: 1.52; color: ${C.ink};
  }
  ul { margin: 0; padding-left: 16px; }
  li { margin-bottom: 3.5px; }
</style>
</head>
<body>
<div class="sheet">
  <div class="topbar"></div>

  <!-- Header -->
  <header style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1.5px solid ${C.ink}; padding-bottom:9px; gap:14px;">
    <div style="flex:1; min-width:0;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
        <img src="${assets.symbolDim}" style="width:22px; height:22px;" />
        <span style="font-family:'CueXMono',monospace; font-size:10.5px; font-weight:700; color:${C.violet}; letter-spacing:0.06em;">
          AI EMPLOYEE JOB SPECIFICATION · 怀客松 2026 OPC 赛道交付件
        </span>
      </div>
      <h1 style="margin:0; font-family:'CueXCJKSerif',serif; font-size:25px; font-weight:800; letter-spacing:-0.01em;">
        演讲与答辩临场引导师
      </h1>
      <div style="font-size:11.6px; color:${C.muted}; margin-top:3px; white-space:nowrap;">
        体系：<strong>CueX 你的快思考外挂（首切 CueX Presentation）</strong> · 在深度思考之外，接住当下
      </div>
    </div>
    <div style="text-align:right; font-family:'CueXMono',monospace; font-size:10.5px; color:${C.muted}; white-space:nowrap; flex-shrink:0; line-height:1.5;">
      <div>版本：CueX-Final v1.0</div>
      <div>团队：${metrics.team.name}</div>
      <div>模式：Rehearsal / Live</div>
    </div>
  </header>

  <!-- Summary Strip -->
  <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:7px 0;">
    <div style="background:${C.tint}; border:1px solid ${C.hairline}; border-radius:7px; padding:6px 9px;">
      <div style="font-size:10px; color:${C.subtle}; font-family:'CueXMono',monospace;">服务对象</div>
      <div style="font-size:11.5px; font-weight:700; margin-top:2px;">OPC 主理人 / 硕博答辩 / 讲者</div>
    </div>
    <div style="background:${C.tint}; border:1px solid ${C.hairline}; border-radius:7px; padding:6px 9px;">
      <div style="font-size:10px; color:${C.subtle}; font-family:'CueXMono',monospace;">控制原则</div>
      <div style="font-size:11.5px; font-weight:700; margin-top:2px;">L0–L3 最小必要干预</div>
    </div>
    <div style="background:${C.tint}; border:1px solid ${C.hairline}; border-radius:7px; padding:6px 9px;">
      <div style="font-size:10px; color:${C.subtle}; font-family:'CueXMono',monospace;">效用算子</div>
      <div style="font-size:11.5px; font-weight:700; margin-top:2px;">V = H − λI (λ = 2)</div>
    </div>
    <div style="background:${C.tint}; border:1px solid ${C.hairline}; border-radius:7px; padding:6px 9px;">
      <div style="font-size:10px; color:${C.subtle}; font-family:'CueXMono',monospace;">隐私边界</div>
      <div style="font-size:11.5px; font-weight:700; margin-top:2px;">记忆人工审批 + 一键擦除</div>
    </div>
  </div>

  <!-- 5 Mandatory Sections -->
  <main style="display:flex; flex-direction:column; gap:7px; flex:1; justify-content:space-between;">
    <section class="sec" style="border-left:3.5px solid ${C.amberBright};">
      <div class="sec-head">
        <div class="sec-title"><span class="sec-no">01</span> 岗位职责（Role &amp; Responsibilities）</div>
        <span style="font-family:'CueXMono',monospace; font-size:10px; color:${C.muted};">全周期三阶段伴随</span>
      </div>
      <div class="sec-body">
        <ul>
          <li><strong>上台前讲稿结构化编译</strong>：解析演讲者的原始讲稿与幻灯片，沉淀带唯一编号的事实依据（<code>Evidence[]</code>）、章节序列（<code>PresentationCueSheetChapter</code> / <code>PresentationProgressNode</code>）、必讲锚点与禁用口径，禁止脱稿虚构数据。</li>
          <li><strong>彩排与正式临场低分心护航</strong>：实时追踪语流、当前章节位置与潜在时间/跑偏风险；顺畅表达时保持 <code>L0</code> 静默；仅在遗漏关键论据、停顿卡壳或答辩偏移时按门控触发 <code>L1</code> 边缘提示、<code>L2</code> 锚点词卡或 <code>L3</code> 风险纠偏，并在讲者自行拉回后自动撤回（Auto-Withdraw）。</li>
          <li><strong>散场后量化复盘与合规沉淀</strong>：基于真实干预轨迹输出 <code>V = H − λI</code>（<code>λ = 2</code>）效用报告与遗漏清单，提炼候选习惯供人类审阅。</li>
        </ul>
      </div>
    </section>

    <section class="sec" style="border-left:3.5px solid ${C.violet};">
      <div class="sec-head">
        <div class="sec-title"><span class="sec-no">02</span> 输入要求（Inputs &amp; Preconditions）</div>
        <span style="font-family:'CueXMono',monospace; font-size:10px; color:${C.muted};">无依据不瞎编原则</span>
      </div>
      <div class="sec-body">
        <ul>
          <li><strong>参考材料包（必需推荐）</strong>：支持 <code>.pptx</code> / <code>.pdf</code> / <code>.md</code> / <code>.txt</code> 格式原始讲稿，并配置场景类型（路演 <code>pitch</code> / 答辩 <code>defense</code> / 学术 <code>academic</code> / 发布 <code>keynote</code> / 通用 <code>general</code>）与目标时长。若零材料空手入场，系统仅激活时间与结构提示并显式提示“缺少事实验证依据”。</li>
          <li><strong>实时音频与文本流</strong>：16 kHz PCM16LE 浏览器音频输入或评估注入文本流；UI 明确标注当前 ASR 真实通道状态（<code>local / remote / text</code>）。</li>
          <li><strong>人工确认的高权重偏好</strong>：讲者通过 <code>MemoryStore</code> 显式审核勾选的历史禁用词、语速提醒偏好及高频 Q&amp;A 防线。</li>
        </ul>
      </div>
    </section>

    <section class="sec" style="border-left:3.5px solid ${C.amberBright};">
      <div class="sec-head">
        <div class="sec-title"><span class="sec-no">03</span> 交付成果（Deliverables）</div>
        <span style="font-family:'CueXMono',monospace; font-size:10px; color:${C.muted};">可验证输出件</span>
      </div>
      <div class="sec-body">
        <ul>
          <li><strong>Pre-Stage <code>PresentationContextPack</code> 提示包</strong>：一页式导播单（<code>PresentationCueSheet</code>）、章节图谱、每章 <code>MustSay</code> 锚点、<code>Evidence[]</code> 原文溯源卡片及潜在评委追问防线。</li>
          <li><strong>Stage 实时双视图交付</strong>：面向讲者余光使用的极简 <strong>Focus 临场视图</strong>（L0 留白 + L1 边缘光 + 轻量提示卡自动撤回）与面向复核的 <strong>Inspector 透视视图</strong>（显示每条决策依据、TTL 与撤回事件日志）。</li>
          <li><strong>Post-Stage <code>PresentationReflection</code> 复盘与消费明细</strong>：含 <code>V = H − λI</code> 净收益、精确率/误打扰率、遗漏项、<code>TelemetryUsage</code> 实测/估算消耗账本。</li>
        </ul>
      </div>
    </section>

    <section class="sec" style="border-left:3.5px solid ${C.rust};">
      <div class="sec-head">
        <div class="sec-title"><span class="sec-no">04</span> 人工介入（Human-in-the-Loop &amp; Boundaries）</div>
        <span style="font-family:'CueXMono',monospace; font-size:10px; color:${C.muted};">人类主权绝对优先</span>
      </div>
      <div class="sec-body">
        <ul>
          <li><strong>上台前人工校准（Mandatory Review）</strong>：讲者须核验编译器抽出的核心数据、必讲锚点顺序与禁区词条，确认 <code>Evidence[]</code> 口径无误后再开演。</li>
          <li><strong>临场可打断与可降噪</strong>：人类始终是最终表达者，可随时点击 <code>Dismiss</code> 驳回任意提示（触发 <code>user_dismissed</code> 撤回），也可在 Focus/Inspector 间单点切换；禁止 AI 在讲者流畅讲话时强占焦点。</li>
          <li><strong>记忆写入审批与一键擦除权</strong>：任何个人表达习惯与过往失误摘要在未获人类显式确认前不得入库；支持调用 <code>/api/sessions/:id/wipe</code> 一键彻底擦除单场记录与敏感上下文。</li>
        </ul>
      </div>
    </section>

    <section class="sec" style="border-left:3.5px solid ${C.sage};">
      <div class="sec-head">
        <div class="sec-title"><span class="sec-no">05</span> 验收标准（Acceptance Criteria）</div>
        <span style="font-family:'CueXMono',monospace; font-size:10px; color:${C.muted};">${metrics.eval.sourceLabel}</span>
      </div>
      <div class="sec-body">
        <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:5px;">
          <div style="background:${C.tint}; padding:5px 8px; border-radius:6px;">
            <div style="font-size:10px; color:${C.subtle};">干预精确率</div>
            <div class="tabular" style="font-family:'CueXMono',monospace; font-size:13px; font-weight:800; color:${C.sage};">${metrics.eval.precision}</div>
          </div>
          <div style="background:${C.tint}; padding:5px 8px; border-radius:6px;">
            <div style="font-size:10px; color:${C.subtle};">误打扰率 (越低越好)</div>
            <div class="tabular" style="font-family:'CueXMono',monospace; font-size:13px; font-weight:800; color:${C.ink};">${metrics.eval.falseInterventionRate}</div>
          </div>
          <div style="background:${C.tint}; padding:5px 8px; border-radius:6px;">
            <div style="font-size:10px; color:${C.subtle};">自动撤回准确率</div>
            <div class="tabular" style="font-family:'CueXMono',monospace; font-size:13px; font-weight:800; color:${C.amber};">${metrics.eval.withdrawalAccuracy}</div>
          </div>
          <div style="background:${C.tint}; padding:5px 8px; border-radius:6px;">
            <div style="font-size:10px; color:${C.subtle};">净效用 V = H − 2I</div>
            <div class="tabular" style="font-family:'CueXMono',monospace; font-size:11px; font-weight:800; color:${C.violet}; line-height:1.35; white-space:nowrap;">${metrics.eval.utilityV}</div>
          </div>
        </div>
        <ul>
          <li><strong>端到端可用性</strong>：4 格式材料抽取成功并可关联原文 <code>Evidence[]</code>；单点彩排与实时流均无阻塞卡死，<code>System 1</code> 平均评估延迟 ${metrics.eval.avgLatencyMs} ms，<code>numbersIn</code> 无捏造数字。</li>
          <li><strong>数据与口径诚实性</strong>：严禁静默覆盖记忆、严禁隐藏非 Token 成本、严禁将本地模拟测算标注为云端已实现真实账单。</li>
        </ul>
      </div>
    </section>
  </main>

  <footer style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid ${C.hairline}; padding-top:6px; font-size:10.5px; color:${C.subtle};">
    <span>CueX Presentation · 在深度思考之外，接住当下</span>
    <span style="font-family:'CueXMono',monospace;">Page 1 / 1 · Strictly A4</span>
  </footer>
</div>
</body>
</html>`;
}

export function renderBmcHtml(metrics, assets) {
  const C = BASE_COLORS;
  const { free, event, pro, team } = metrics.pricing;

  const boxes = [
    {
      no: '01',
      title: '目标客户（Segments）',
      accent: C.amberBright,
      items: [
        'P1 首攻：OPC 一人公司主理人、早期创业者、独立咨询顾问（决策链短、单次路演容错极低）。',
        'P2 扩张：高校硕博研究生与学术汇报人（毕业/开题答辩高频刚需、术语密度极高）。',
        'P3 生态：企业讲师与解决方案团队（后续可扩展至 Teaching / Sales 场景适配器）。',
      ],
    },
    {
      no: '02',
      title: '客户痛点（Pain Points）',
      accent: C.rust,
      items: [
        '逐字死记硬背僵硬，现场失神忘词一旦卡壳全盘皆崩。',
        '传统滚动提词器（PromptSmart 等）无法应对评委随机插话与跳页追问。',
        '聊天式 AI Copilot 狂吐整段文字，逼迫说话人低头阅读，反而引爆注意力过载与眼神断联。',
      ],
    },
    {
      no: '03',
      title: '价值主张（Value Proposition）',
      accent: C.amberBright,
      items: [
        '「在深度思考之外，接住当下」：只做最小必要干预（L0 静默 / L1 边缘 / L2 锚点 / L3 校验）。',
        '讲者只要自行接回正轨或翻页，提示即按 TTL/contextVersion 自动撤回不霸屏。',
        '强绑定用户本人讲稿 Evidence[] 原文溯源，并量化验证净效用 V = H − λI (λ=2)。',
      ],
    },
    {
      no: '04',
      title: '交付成果（Deliverables）',
      accent: C.violet,
      items: [
        '讲前：支持 .pptx/.pdf/.md/.txt 编译提取章节图谱与防幻觉 Evidence[]。',
        '台上：极简零打扰 Focus 临场视图 + 完整决策透视 Inspector 调试视图 + 单点彩排模式。',
        '赛后：结构化量化复盘报告（精度、误扰率、遗漏项）与必须人工审批方可入库的 MemoryStore。',
      ],
    },
    {
      no: '05',
      title: '定价假设（Pricing）[未上线假设]',
      accent: C.violet,
      items: [
        `${free.name} ${free.price}：体验限额（每月 2 场×10m 云 ASR），守住免费算力损耗护栏。`,
        `${event.name} ${event.price}（锚点 ¥29）：单次路演/毕业答辩 14 天买断包，彻底消除低频用户订阅抗拒。`,
        `${pro.name} ${pro.price}（或 ${pro.annual}）：高频月度讲者主力（含 240m/月云 ASR 与审批记忆沉淀）。`,
        `${team.name} ${team.price} [${team.tag}]：团队共享口径与多场景适配扩展包。`,
      ],
    },
    {
      no: '06',
      title: '成本结构（10 项全成本）',
      accent: C.ink,
      items: [
        '拒绝“只算 LLM Token 吹嘘 96% 毛利”，完整核定 10 项全链路成本：',
        '直接算力与声学：① 文档解析、② 流式 ASR（变动成本大头）、③ S1 快判定、④ S2 推理、⑤ 会话内缓存净节省、⑥ 证据检索、⑦ 赛后复盘；',
        '运营与商业：⑧ Web/WS 云服务基建、⑨ 微信/支付宝分渠道费率（0.6%基准，含退款损耗）、⑩ 12:1 算力活跃免费补贴与客服支持。',
      ],
    },
    {
      no: '07',
      title: '获客渠道（Acquisition）',
      accent: C.sage,
      items: [
        '高光路演自传播：黑客松、创投 Demo Day 现场 75 秒实机对比切片（AI 适时救场与自动撤回）天然自带社交传播。',
        '节点社群裂变：OPC 社群与高校“毕业答辩救命包 / 国奖汇报模板库”免费编译工具引流。',
        '生态合作（中期）：联合创业孵化器、高校创新学院与职业培训机构试用导入。',
      ],
    },
    {
      no: '08',
      title: '竞争壁垒（Defensible Moat）',
      accent: C.sage,
      items: [
        '不虚构单一缓存/Prompt 壁垒，构建三层叠加复利：',
        '① 控制论级抑制门控工程化（L0–L3 + TTL 撤回 + V = H − 2I 目标函数），极难仅靠改 Prompt 复制体验；',
        '② 讲前原文 Evidence 绑定 → 临场撤回行为闭环微调数据飞轮；',
        '③ 人类主权级跨场偏好记忆护城河（合规审批与一键擦除信任绑定）。',
      ],
    },
  ];

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  ${buildFontCss(assets.fonts)}
  @page { size: 297mm 209.4mm; margin: 0; }
  html, body {
    margin: 0; padding: 0;
    width: 297mm; height: 209.4mm;
    background: ${C.bg};
    color: ${C.ink};
    font-family: 'CueXSans', 'CueXCJK', 'PingFang SC', sans-serif;
    overflow: hidden;
  }
  .page {
    width: 297mm; height: 209.4mm;
    padding: 11mm 14mm 10mm 14mm;
    display: flex; flex-direction: column; justify-content: space-between;
    position: relative;
  }
  .topbar {
    position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, ${C.amberBright}, ${C.violet});
  }
  .grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; flex: 1; margin: 9px 0;
  }
  .cell {
    background: ${C.card};
    border: 1px solid ${C.hairline};
    border-radius: 10px;
    padding: 10px 12px;
    display: flex; flex-direction: column;
  }
  .cell-head {
    display: flex; align-items: center; gap: 7px;
    border-bottom: 1px solid ${C.hairline}; padding-bottom: 5px; margin-bottom: 7px;
  }
  .badge {
    font-family: 'CueXMono', monospace; font-size: 10px; font-weight: 700;
    padding: 1px 6px; border-radius: 4px; background: ${C.tint}; color: ${C.ink};
  }
  .cell-title { font-size: 12.5px; font-weight: 800; color: ${C.ink}; }
  ul { margin: 0; padding-left: 14px; font-size: 10.6px; line-height: 1.48; color: ${C.ink}; }
  li { margin-bottom: 4px; }
</style>
</head>
<body>
<div class="page">
  <div class="topbar"></div>
  <header style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1.5px solid ${C.ink}; padding-bottom:7px;">
    <div style="display:flex; align-items:center; gap:10px;">
      <img src="${assets.symbolDim}" style="width:26px; height:26px;" />
      <div>
        <div style="font-family:'CueXMono',monospace; font-size:10px; font-weight:700; color:${C.amber}; letter-spacing:0.08em;">
          PART 01 · 8-ELEMENT BUSINESS MODEL CANVAS
        </div>
        <h1 style="margin:1px 0 0 0; font-family:'CueXCJKSerif',serif; font-size:21px; font-weight:800;">
          CueX 八要素商业画布 · 聚焦首切场景「CueX Presentation」与通用快思考延展
        </h1>
      </div>
    </div>
    <div style="text-align:right; font-family:'CueXMono',monospace; font-size:10px; color:${C.muted};">
      <div>团队：${metrics.team.name} · OPC 创新赛道</div>
      <div style="color:${C.violet}; font-weight:700;">诚实口径：所有商业定价均为假设，尚未产生真实收费</div>
    </div>
  </header>

  <main class="grid">
    ${boxes
      .map(
        (b) => `
      <div class="cell" style="border-top: 3.5px solid ${b.accent};">
        <div class="cell-head">
          <span class="badge">${b.no}</span>
          <span class="cell-title">${b.title}</span>
        </div>
        <ul>
          ${b.items.map((it) => `<li>${it}</li>`).join('')}
        </ul>
      </div>
    `
      )
      .join('')}
  </main>

  <footer style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid ${C.hairline}; padding-top:6px; font-size:10.2px; color:${C.subtle};">
    <span>核心战略：以高频痛点明确的 CueX Event (¥19-39/场) 与 CueX Pro (¥59/月) 验证现金流，再通过 ScenarioAdapter 延展至 X 全场景</span>
    <span style="font-family:'CueXMono',monospace;">CueX-Final · 商业画布</span>
  </footer>
</div>
</body>
</html>`;
}

export function renderUnitEconomicsHtml(metrics, assets) {
  const C = BASE_COLORS;
  const { conservative, base, optimistic } = metrics.scenarios;
  const ev = metrics.eval;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  ${buildFontCss(assets.fonts)}
  @page { size: 297mm 209.4mm; margin: 0; }
  html, body {
    margin: 0; padding: 0;
    width: 297mm; height: 209.4mm;
    background: ${C.bg};
    color: ${C.ink};
    font-family: 'CueXSans', 'CueXCJK', 'PingFang SC', sans-serif;
    overflow: hidden;
  }
  .page {
    width: 297mm; height: 209.4mm;
    padding: 11mm 14mm 10mm 14mm;
    display: flex; flex-direction: column; justify-content: space-between;
    position: relative;
  }
  .topbar {
    position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, ${C.violet}, ${C.amberBright});
  }
  .card {
    background: ${C.card};
    border: 1px solid ${C.hairline};
    border-radius: 10px;
    padding: 12px 14px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { padding: 6.5px 6px; border-bottom: 1px solid ${C.hairline}; text-align: left; }
  th { font-weight: 700; color: ${C.muted}; border-bottom: 1.5px solid ${C.ink}; }
</style>
</head>
<body>
<div class="page">
  <div class="topbar"></div>
  <header style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1.5px solid ${C.ink}; padding-bottom:7px;">
    <div style="display:flex; align-items:center; gap:10px;">
      <img src="${assets.symbolDim}" style="width:26px; height:26px;" />
      <div>
        <div style="font-family:'CueXMono',monospace; font-size:10px; font-weight:700; color:${C.violet}; letter-spacing:0.08em;">
          PART 02 · 10-COMPONENT UNIT ECONOMICS &amp; SENSITIVITY
        </div>
        <h1 style="margin:1px 0 0 0; font-family:'CueXCJKSerif',serif; font-size:21px; font-weight:800;">
          CueX 诚实单位经济账本 · 推翻旧版纯 Token 95.9% 毛利虚幻口径
        </h1>
      </div>
    </div>
    <div style="text-align:right; font-family:'CueXMono',monospace; font-size:10px; color:${C.muted}; white-space:nowrap;">
      <div>${ev.sourceLabel}</div>
      <div>本地离线实测：${ev.tokensPerSession} tokens (${ev.s1EvaluationsPerSession}次规则) · 云端25m建模 ${(ev.modeledCloudTokensPerSession / 1000).toFixed(1)}K tokens</div>
    </div>
  </header>

  <main style="display:grid; grid-template-columns:1fr 1.12fr; gap:12px; flex:1; margin:9px 0;">
    <!-- Left: 10 Components -->
    <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; border-left:3.5px solid ${C.amberBright};">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-family:'CueXMono',monospace; font-size:11px; font-weight:700; color:${C.amber};">
            基准情景 10 项全成本拆解（Pro ¥59/月 · 6场×25m）
          </span>
          <span style="font-size:10px; font-weight:700; color:${C.sage};">全链路真实计提</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>成本分项</th>
              <th>口径说明</th>
              <th style="text-align:right;">基准成本</th>
            </tr>
          </thead>
          <tbody class="tabular" style="font-family:'CueXMono',monospace;">
            ${metrics.costComponents10
              .map((c) => {
                const isSession = typeof c.baseSession === 'number';
                const val = isSession
                  ? `¥${c.baseSession.toFixed(3)}/场`
                  : `¥${c.baseMonthly.toFixed(2)}/月`;
                return `<tr>
                  <td style="font-family:'CueXSans','CueXCJK',sans-serif; font-weight:700;">${c.name}</td>
                  <td style="font-family:'CueXSans','CueXCJK',sans-serif; color:${C.muted}; font-size:10px;">${c.shareNote}</td>
                  <td style="text-align:right; font-weight:700; white-space:nowrap; color:${c.id === 5 ? C.sage : c.id === 2 || c.id === 10 ? C.rust : C.ink};">${val}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
      <div style="background:${C.tintWarm}; border:1px solid rgba(232,122,36,0.3); border-radius:7px; padding:7px 10px; font-size:10.5px; line-height:1.45;">
        <strong>口径纠偏声明：</strong>不将系统声称的“会话内前缀缓存优化”夸大为跨槽共享 99% 节流；显式区分 <code>LLM Cost (¥${base.llmCostPerSession.toFixed(3)}/场)</code> 与包含流式 ASR、云基建在内的 <code>Full Variable Cost (¥${base.fullVarCostPerSession.toFixed(3)}/场)</code>。
      </div>
    </div>

    <!-- Right: 3 Scenarios + Guardrails -->
    <div style="display:flex; flex-direction:column; gap:10px; justify-content:space-between;">
      <div class="card" style="flex:1; border-left:3.5px solid ${C.violet};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-family:'CueXMono',monospace; font-size:11px; font-weight:700; color:${C.violet};">
            三情景盈利检验（Conservative / Base / Optimistic）
          </span>
          <span style="font-size:10px; color:${C.muted};">定价均为商业假设</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>关键财务指标</th>
              <th style="white-space:nowrap;">保守</th>
              <th style="color:${C.amber}; white-space:nowrap;">基准 Base</th>
              <th style="white-space:nowrap;">乐观</th>
            </tr>
          </thead>
          <tbody class="tabular" style="font-family:'CueXMono',monospace; white-space:nowrap;">
            <tr>
              <td style="font-family:'CueXSans','CueXCJK',sans-serif; font-weight:600;">月频次 × 时长</td>
              <td>${conservative.sessionsPerMo}场×${conservative.durationMin}m</td>
              <td style="font-weight:700; color:${C.amber};">${base.sessionsPerMo}场×${base.durationMin}m</td>
              <td>${optimistic.sessionsPerMo}场×${optimistic.durationMin}m</td>
            </tr>
            <tr>
              <td style="font-family:'CueXSans','CueXCJK',sans-serif; font-weight:600;">云端流式 ASR 单价</td>
              <td>¥${conservative.asrRatePerHr.toFixed(2)}/h</td>
              <td style="font-weight:700; color:${C.amber};">¥${base.asrRatePerHr.toFixed(2)}/h</td>
              <td>¥${optimistic.asrRatePerHr.toFixed(2)}/h</td>
            </tr>
            <tr>
              <td style="font-family:'CueXSans','CueXCJK',sans-serif; font-weight:600;">单场纯 LLM 成本</td>
              <td>¥${conservative.llmCostPerSession.toFixed(3)}</td>
              <td style="font-weight:700; color:${C.amber};">¥${base.llmCostPerSession.toFixed(3)}</td>
              <td>¥${optimistic.llmCostPerSession.toFixed(3)}</td>
            </tr>
            <tr>
              <td style="font-family:'CueXSans','CueXCJK',sans-serif; font-weight:600;">单场全变动成本</td>
              <td>¥${conservative.fullVarCostPerSession.toFixed(3)}</td>
              <td style="font-weight:700; color:${C.amber};">¥${base.fullVarCostPerSession.toFixed(3)}</td>
              <td>¥${optimistic.fullVarCostPerSession.toFixed(3)}</td>
            </tr>
            <tr>
              <td style="font-family:'CueXSans','CueXCJK',sans-serif; font-weight:600;">Pro 月变动总成本</td>
              <td>¥${conservative.proMonthlyVarCost.toFixed(2)}</td>
              <td style="font-weight:700; color:${C.amber};">¥${base.proMonthlyVarCost.toFixed(2)}</td>
              <td>¥${optimistic.proMonthlyVarCost.toFixed(2)}</td>
            </tr>
            <tr style="background:${C.tintWarm};">
              <td style="font-family:'CueXSans','CueXCJK',sans-serif; font-weight:700;">Pro 直接贡献 &amp; 率</td>
              <td>¥${conservative.proDirectContrib.toFixed(1)} (${conservative.proDirectMarginPct.toFixed(1)}%)</td>
              <td style="font-weight:800; color:${C.amber};">¥${base.proDirectContrib.toFixed(1)} (${base.proDirectMarginPct.toFixed(1)}%)</td>
              <td style="color:${C.sage};">¥${optimistic.proDirectContrib.toFixed(1)} (${optimistic.proDirectMarginPct.toFixed(1)}%)</td>
            </tr>
            <tr>
              <td style="font-family:'CueXSans','CueXCJK',sans-serif; font-weight:600;">Pro SaaS 毛利率</td>
              <td>${conservative.proSaasMarginPct.toFixed(1)}%</td>
              <td style="font-weight:700; color:${C.amber};">${base.proSaasMarginPct.toFixed(1)}%</td>
              <td>${optimistic.proSaasMarginPct.toFixed(1)}%</td>
            </tr>
            <tr>
              <td style="font-family:'CueXSans','CueXCJK',sans-serif; font-weight:600;">Event ¥29 毛利率</td>
              <td>${conservative.eventMarginPct.toFixed(1)}%</td>
              <td style="font-weight:700; color:${C.amber};">${base.eventMarginPct.toFixed(1)}%</td>
              <td>${optimistic.eventMarginPct.toFixed(1)}%</td>
            </tr>
            <tr>
              <td style="font-family:'CueXSans','CueXCJK',sans-serif; font-weight:600;">CAC / LTV / 月承受上限</td>
              <td>¥${conservative.cac}/¥${conservative.ltv.toFixed(0)} (${conservative.maxAffordableSessionsPerProMonth}场)</td>
              <td style="font-weight:700; color:${C.amber};">¥${base.cac}/¥${base.ltv.toFixed(0)} (${base.maxAffordableSessionsPerProMonth}场)</td>
              <td>¥${optimistic.cac}/¥${optimistic.ltv.toFixed(0)} (${optimistic.maxAffordableSessionsPerProMonth}场)</td>
            </tr>
          </tbody>
        </table>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:10px;">
          ${[
            { l: '保守 直接贡献率', p: conservative.proDirectMarginPct, col: C.muted },
            { l: '基准 直接贡献率', p: base.proDirectMarginPct, col: C.amberBright },
            { l: '乐观 直接贡献率', p: optimistic.proDirectMarginPct, col: C.sage },
          ]
            .map(
              (m) => `
            <div style="background:${C.tint}; border:1px solid ${C.hairline}; border-radius:6px; padding:6px 9px;">
              <div style="display:flex; justify-content:space-between; font-size:10px;">
                <span style="color:${C.muted};">${m.l}</span>
                <strong class="tabular" style="font-family:'CueXMono',monospace; color:${m.col};">${m.p.toFixed(1)}%</strong>
              </div>
              <div style="height:5px; background:${C.card}; border-radius:3px; margin-top:4px; overflow:hidden;">
                <div style="width:${Math.min(100, m.p)}%; height:100%; background:${m.col};"></div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="card" style="background:${C.tint}; border-left:3.5px solid ${C.sage};">
        <div style="font-size:11.5px; font-weight:800; color:${C.ink}; margin-bottom:4px;">
          敏感性与 Phase 3 实测校准（全 ${metrics.sensitivities.length} 项压测 + 5+1 ASR 详见 UNIT_ECONOMICS.md）
        </div>
        <div style="font-size:10px; color:${C.muted}; line-height:1.42;">
          1. <strong>敏感因子 &amp; 实测 #12 校准</strong>：ASR 单价与免费/付费比最敏感；按实机 CPA <code>gemini-4-hydrogen</code> 分布校准（<code>${metrics.sensitivities[11].calibratedTokensPerSession.toLocaleString()}</code> Tok 全按 S2 计费）：单场 LLM <code>¥${metrics.sensitivities[11].calibratedLlmCostPerSession.toFixed(3)}</code> / 全变动 <code>¥${metrics.sensitivities[11].calibratedFullVarCostPerSession.toFixed(3)}</code>，Pro 贡献率仍稳居 <strong><code>${metrics.sensitivities[11].proDirectMarginPct.toFixed(1)}%</code></strong>（${metrics.sensitivities[11].maxAffordableSessionsPerProMonth}场/月）。<br/>
          2. <strong>公司级边界与硬帽</strong>：<code>Pro</code> 含 240m/月云 ASR（远低于安全上限 ${base.maxAffordableSessionsPerProMonth} 场）+ 超额切本地 Sherpa 兜底；${metrics.companyBreakeven.statement}。
        </div>
      </div>
    </div>
  </main>

  <footer style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid ${C.hairline}; padding-top:6px; font-size:10.2px; color:${C.subtle};">
    <span>数据口径一致性保证：本页数字与 CueX-BP.pdf P6 及 UNIT_ECONOMICS.md 完全同源同步</span>
    <span style="font-family:'CueXMono',monospace;">CueX-Final · 单位经济模型</span>
  </footer>
</div>
</body>
</html>`;
}

export function renderTokenProofHtml(metrics, assets) {
  const C = BASE_COLORS;
  const ev = metrics.eval;
  const base = metrics.scenarios.base;
  const s12 = metrics.sensitivities[11];
  const p3 = metrics.phase3RealValidation;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  ${buildFontCss(assets.fonts)}
  html, body {
    margin: 0; padding: 0;
    width: 1600px; height: 960px;
    background: ${C.bg}; color: ${C.ink};
    font-family: 'CueXSans', 'CueXCJK', 'PingFang SC', sans-serif;
    overflow: hidden;
  }
  .wrap {
    width: 1600px; height: 960px;
    padding: 36px 48px;
    display: flex; flex-direction: column; justify-content: space-between;
    position: relative;
  }
  .topbar {
    position: absolute; top: 0; left: 0; right: 0; height: 5px;
    background: linear-gradient(90deg, ${C.amberBright}, ${C.violet});
  }
  .card {
    background: ${C.card};
    border: 1px solid ${C.hairline};
    border-radius: 14px;
    padding: 18px 20px;
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar"></div>
  <header style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid ${C.ink}; padding-bottom:12px;">
    <div>
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:5px;">
        <img src="${assets.symbolDim}" style="width:26px; height:26px;" />
        <span style="font-family:'CueXMono',monospace; font-size:12.5px; font-weight:700; color:${C.amber}; letter-spacing:0.06em;">
          SANITIZED VERIFIABLE TELEMETRY &amp; COST AUDIT · Cat 1 + Cat 3 + Cat 4
        </span>
      </div>
      <h1 style="margin:0; font-family:'CueXCJKSerif',serif; font-size:25px; font-weight:800; white-space:nowrap;">
        CueX 脱敏实机遥测与十项成本校准证明（CPA gemini-4-hydrogen + Colab GPU ASR）
      </h1>
    </div>
    <div style="text-align:right; font-family:'CueXMono',monospace; font-size:11.5px; color:${C.muted}; white-space:nowrap; flex-shrink:0;">
      <div>Gateway: cpa:&lt;redacted-host&gt; · Colab TLS+Bearer (redacted)</div>
      <div>Telemetry: provider_reported (costFen: 0) · Zero Fake Billing · λ = ${ev.lambda}</div>
    </div>
  </header>

  <main style="display:grid; grid-template-columns:1.08fr 0.92fr; gap:20px; margin:16px 0; flex:1;">
    <!-- Left: Sanitized Real Phase 3 Telemetry + Inspector Screenshot -->
    <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; border-left:4px solid ${C.violet};">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span style="font-family:'CueXMono',monospace; font-size:12.5px; font-weight:700; color:${C.violet};">
            01 · SANITIZED REAL TELEMETRY（真实 Colab ASR + CPA LLM + 离线 Eval JSON）
          </span>
          <span style="font-family:'CueXMono',monospace; font-size:11px; color:${C.sage}; font-weight:700;">silentValidationOnly: true</span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:12px;">
          ${[
            ['CPA 12步主链实耗 Token', `${p3.cpa.mainPipeline.totalTokens.toLocaleString()} tok`, `5,904in / 9,495out (${p3.cpa.mainPipeline.reasoningTokens.toLocaleString()} 推理)`, C.violet],
            ['S1 网关对比 (gemini-4-hydrogen)', `${p3.cpa.s1Benchmark.gemini4Hydrogen.passed}/${p3.cpa.s1Benchmark.gemini4Hydrogen.total} (100%)`, `vs 3.5-flash-lite 4/6 · costFen: 0`, C.sage],
            ['Colab RTX PRO 6000 ASR', `${p3.asr.avgInferLatencyMs} ms`, `RTF ${p3.asr.overallRtf} · clip_04 CER 0.0 · WSS ${p3.asr.wssFirstPartialMs}ms`, C.amber],
            ['Gateway 实机 E2E (Sec 5.2)', `${p3.e2e.scenariosPassed}/${p3.e2e.scenariosTotal} PASS`, `clip_14 长会话 ${p3.e2e.longSessionClip14.totalTokens.toLocaleString()} tok · 主权 400/201/200/200`, C.ink],
            ['离线确定性 Eval (Cat 1)', `${ev.passedCases}/${ev.datasetCases} · ${ev.avgLatencyMs}ms`, `${ev.s1EvaluationsPerSession}次本地规则 0 Token · V = ${ev.utilityV}`, C.sage],
            ['6类评测边界披露', 'TTS+DSP 语料', 'notLiveHumanRoomRecording: true · 0外放', C.muted],
          ]
            .map(
              ([k, v, sub, col]) => `
            <div style="background:${C.tint}; border:1px solid ${C.hairline}; border-radius:9px; padding:9px 11px;">
              <div style="font-size:11px; color:${C.muted}; font-weight:600;">${k}</div>
              <div class="tabular" style="font-family:'CueXMono',monospace; font-size:17px; font-weight:800; color:${col}; margin-top:2px;">${v}</div>
              <div style="font-size:10.5px; color:${C.muted}; margin-top:2px; line-height:1.25;">${sub}</div>
            </div>
          `
            )
            .join('')}
        </div>

        <div style="display:grid; grid-template-columns:1.12fr 0.88fr; gap:12px; align-items:stretch;">
          <div style="border:1px solid ${C.hairline}; border-radius:10px; overflow:hidden; background:${C.tint};">
            <div style="padding:5px 10px; background:${C.bg}; border-bottom:1px solid ${C.hairline}; font-family:'CueXMono',monospace; font-size:10.5px; font-weight:700; color:${C.ink}; display:flex; justify-content:space-between;">
              <span>真实 UI · Stage Inspector 运行态透视</span>
              <span style="color:${C.violet};">ui-stage-inspector-1440.png</span>
            </div>
            <img src="${assets.uiStageInspector}" style="width:100%; height:228px; object-fit:cover; object-position:top center; display:block;" />
          </div>

          <div style="background:${C.tint}; border:1px solid ${C.hairline}; border-radius:10px; overflow:hidden; display:flex; flex-direction:column;">
            <div style="padding:5px 10px; background:${C.bg}; border-bottom:1px solid ${C.hairline}; font-family:'CueXMono',monospace; font-size:10.5px; font-weight:700; color:${C.ink}; display:flex; justify-content:space-between;">
              <span>Sanitized Evidence Excerpt</span>
              <span style="color:${C.amber};">Keys/Host Redacted</span>
            </div>
            <div style="padding:10px 12px; font-family:'CueXMono',monospace; font-size:10.8px; line-height:1.48; color:${C.ink}; flex:1; overflow:hidden;">
              <div>"schemaVersion": <span style="color:${C.violet}; font-weight:700;">"cpa-llm-report.v2"</span>,</div>
              <div>"gateway": <span style="color:${C.amber}; font-weight:700;">"cpa:&lt;redacted-host&gt;"</span>,</div>
              <div>"primaryModel": <span style="color:${C.violet}; font-weight:700;">"gemini-4-hydrogen"</span>,</div>
              <div>"requests": { "ok": <span style="color:${C.violet}; font-weight:700;">18</span>, "negGuard": <span style="color:${C.amber}; font-weight:700;">3</span> },</div>
              <div>"mainPipeline12Calls": {</div>
              <div>&nbsp;&nbsp;"input": <span style="color:${C.violet}; font-weight:700;">5904</span>, "output": <span style="color:${C.violet}; font-weight:700;">9495</span>,</div>
              <div>&nbsp;&nbsp;"reasoningTokens": <span style="color:${C.amber}; font-weight:700;">7126</span>,</div>
              <div>&nbsp;&nbsp;"usageSource": <span style="color:${C.violet}; font-weight:700;">"provider_reported"</span>,</div>
              <div>&nbsp;&nbsp;"costFen": <span style="color:${C.amber}; font-weight:700;">0</span> <span style="color:${C.muted};">// no fake billing</span></div>
              <div>},</div>
              <div>"colabSenseVoice": { "rtf": <span style="color:${C.violet}; font-weight:700;">0.00327</span>, "p95": <span style="color:${C.amber}; font-weight:700;">89.59</span> }</div>
            </div>
          </div>
        </div>
      </div>

      <div style="background:${C.tintViolet}; border:1px solid rgba(124,58,237,0.28); border-radius:9px; padding:9px 13px; font-size:11.8px; color:${C.ink}; line-height:1.42; margin-top:10px;">
        <strong>反造假原则：</strong>CPA 代理仅回传真实 Token 数而 <code>costFen: 0</code>（不附带货币费率），因此右侧商业成本严格以公开云单价独立精算，绝不拼接或伪造第三方计费账单截图。
      </div>
    </div>

    <!-- Right: Modeled Cloud Bridge & Sensitivity #12 Calibration -->
    <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; border-left:4px solid ${C.amberBright};">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span style="font-family:'CueXMono',monospace; font-size:12.5px; font-weight:700; color:${C.amber};">
            02 · 10-COMPONENT COST &amp; #12 CPA CALIBRATION
          </span>
          <span style="font-family:'CueXMono',monospace; font-size:11px; color:${C.muted};">Base vs Calibrated #12</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${metrics.costComponents10
            .slice(0, 8)
            .map((c) => {
              const v = Math.abs(c.baseSession);
              const barPct = Math.min(100, Math.round((v / 0.35) * 100));
              const col = c.id === 5 ? C.sage : c.id === 2 || c.id === 8 ? C.amberBright : C.violet;
              return `
              <div style="display:grid; grid-template-columns:185px 1fr 78px; align-items:center; gap:10px; font-size:12.5px;">
                <span style="font-weight:700; color:${C.ink};">${c.name}</span>
                <div style="height:12px; background:${C.tint}; border-radius:6px; overflow:hidden; border:1px solid ${C.hairline};">
                  <div style="width:${barPct}%; height:100%; background:${col};"></div>
                </div>
                <span class="tabular" style="font-family:'CueXMono',monospace; font-weight:700; text-align:right; color:${c.id === 5 ? C.sage : C.ink};">
                  ¥${c.baseSession.toFixed(3)}
                </span>
              </div>
            `;
            })
            .join('')}
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px;">
          ${metrics.costComponents10
            .slice(8, 10)
            .map(
              (c) => `
            <div style="background:${C.tint}; border:1px solid ${C.hairline}; border-radius:9px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-size:12.5px; font-weight:700; color:${C.ink};">${c.name}</div>
                <div style="font-size:11px; color:${C.muted}; margin-top:2px;">${c.shareNote}</div>
              </div>
              <div class="tabular" style="font-family:'CueXMono',monospace; font-size:14px; font-weight:800; color:${c.id === 10 ? C.rust : C.ink};">
                ¥${c.baseMonthly.toFixed(2)}/mo
              </div>
            </div>
          `
            )
            .join('')}
        </div>

        <div style="margin-top:12px; background:${C.tint}; border:1px solid rgba(124,58,237,0.3); border-radius:10px; padding:11px 14px;">
          <div style="font-family:'CueXMono',monospace; font-size:11.5px; font-weight:700; color:${C.violet}; margin-bottom:4px;">
            SENSITIVITY #12 · 实测 CPA 思维链分布全按 S2 高价校准
          </div>
          <div style="font-size:12px; color:${C.ink}; line-height:1.45;">
            按实测分布外推 25m 会话 <strong><code>${s12.calibratedTokensPerSession.toLocaleString()}</code> Tokens</strong> 并全部按 S2 推理单价（<code>¥2.90 / ¥8.70 per 1M</code>）计价：<br/>
            • 单场纯 LLM <code>¥${base.llmCostPerSession.toFixed(3)} → ¥${s12.calibratedLlmCostPerSession.toFixed(3)}</code> · 单场全变动 <code>¥${base.fullVarCostPerSession.toFixed(3)} → ¥${s12.calibratedFullVarCostPerSession.toFixed(3)}</code><br/>
            • Pro 净贡献率：<strong><code>${base.proDirectMarginPct.toFixed(1)}% → ${s12.proDirectMarginPct.toFixed(1)}%</code></strong>（Event <code>${s12.eventMarginPct.toFixed(1)}%</code> / 月上限 <code>${s12.maxAffordableSessionsPerProMonth} 场</code>）
          </div>
        </div>
      </div>

      <div style="background:${C.tintWarm}; border:1px solid rgba(232,122,36,0.35); border-radius:11px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:12px; color:${C.muted};">Base 单场全变动 ¥${base.fullVarCostPerSession.toFixed(3)}（ASR 54.4%）；实测校准 #12 下：</div>
          <div style="font-size:16.5px; font-weight:800; color:${C.ink}; margin-top:3px;">
            Pro 直接贡献率 ${base.proDirectMarginPct.toFixed(1)}%（校准后 ${s12.proDirectMarginPct.toFixed(1)}%）
          </div>
        </div>
        <div style="text-align:right; font-family:'CueXMono',monospace;">
          <div style="font-size:11px; color:${C.amber}; font-weight:700;">BASE / #12 CONTRIB</div>
          <div style="font-size:19px; font-weight:800; color:${C.ink};">¥${base.proDirectContrib.toFixed(2)} / ¥${s12.proDirectContrib.toFixed(2)}</div>
        </div>
      </div>
    </div>
  </main>

  <footer style="display:flex; justify-content:space-between; border-top:1px solid ${C.hairline}; padding-top:8px; font-size:11.8px; color:${C.subtle};">
    <span>诚实核算：cpa-llm-report.v2 (redacted host/keys, costFen: 0) + colab-asr-report.json + real-e2e-validation.v2 + 10 项全可变成本</span>
    <span style="font-family:'CueXMono',monospace;">demo/token-usage-proof.png · evidence/token-usage-proof.png</span>
  </footer>
</div>
</body>
</html>`;
}
