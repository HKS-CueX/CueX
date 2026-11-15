export function renderJobSpecHtml({ fonts, symbolDataUri }) {
  return `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<title>记性好了一点-CueX-AI员工岗位说明书</title>
<style>
  @font-face { font-family: 'CueXSerif'; src: url('${fonts.serif}') format('truetype'); font-weight: 200 900; font-display: block; }
  @font-face { font-family: 'CueXSans'; src: url('${fonts.sans}') format('truetype'); font-weight: 100 900; font-display: block; }
  @font-face { font-family: 'CueXDisplay'; src: url('${fonts.instrument}') format('truetype'); font-weight: 400; font-display: block; }
  @font-face { font-family: 'CueXMono'; src: url('${fonts.mono}') format('truetype'); font-weight: 100 800; font-display: block; }

  @page { size: A4 portrait; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body {
    margin: 0;
    padding: 0;
    width: 210mm;
    background: #ECEDE7;
    color: #1A211E;
    font-family: 'CueXSans', sans-serif;
  }
  .sheet {
    width: 210mm;
    height: 296.4mm;
    padding: 13mm 15mm 11mm 15mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }
  h1, h2, h3, p, ul { margin: 0; padding: 0; }
  ul { list-style: none; }
  .serif { font-family: 'CueXSerif', serif; }
  .mono { font-family: 'CueXMono', monospace; }

  .hdr {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1.5px solid #1A211E;
    padding-bottom: 4.5mm;
  }
  .eyebrow {
    font-size: 8.5pt;
    color: #B85627;
    font-weight: 600;
    letter-spacing: 0.04em;
    margin-bottom: 1.8mm;
  }
  .hdr h1 {
    font-family: 'CueXSerif', serif;
    font-size: 20pt;
    font-weight: 700;
    line-height: 1.2;
  }
  .hdr p {
    margin-top: 1.8mm;
    font-size: 9.6pt;
    color: #4A584E;
    line-height: 1.45;
  }
  .mark {
    display: flex;
    align-items: center;
    gap: 1.5mm;
  }
  .mark span { font-family: 'CueXDisplay', serif; font-size: 25pt; line-height: 1; }
  .mark img { width: 8mm; height: 8mm; display: block; }

  .summary-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4mm;
    padding: 3.5mm 0;
    border-bottom: 1px solid #CFD3C8;
    font-size: 9pt;
  }
  .summary-strip .k { font-size: 7.8pt; color: #68716B; margin-bottom: 0.8mm; }
  .summary-strip .v { font-weight: 600; color: #1A211E; }

  .sec {
    padding: 3.8mm 0;
    border-bottom: 1px solid #D5D9CF;
  }
  .sec:last-of-type { border-bottom: none; }
  .sec-title {
    display: flex;
    align-items: baseline;
    gap: 2.5mm;
    margin-bottom: 2.4mm;
  }
  .sec-title .n {
    font-family: 'CueXMono', monospace;
    font-size: 9.5pt;
    font-weight: 700;
    color: #B85627;
  }
  .sec-title h2 {
    font-family: 'CueXSerif', serif;
    font-size: 12.5pt;
    font-weight: 700;
  }
  .sec-title .sub {
    font-size: 8.2pt;
    color: #68716B;
  }

  .list {
    display: grid;
    gap: 2.2mm;
    font-size: 9.4pt;
    line-height: 1.52;
    color: #26302A;
  }
  .list li {
    padding-left: 3.2mm;
    border-left: 2.2px solid #B6BDB0;
  }
  .list li.amber { border-left-color: #B85627; }
  .list li.violet { border-left-color: #6B57A3; }
  .list li.green { border-left-color: #2F6B55; }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7mm;
    padding: 3.8mm 0;
    border-bottom: 1px solid #D5D9CF;
  }
  .two-col .sec { padding: 0; border-bottom: none; }

  .redlines {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3.5mm;
  }
  .rl-card {
    background: #F6F7F2;
    border-top: 2.5px solid #B85627;
    padding: 2.8mm 3.2mm;
    font-size: 8.8pt;
    line-height: 1.48;
    color: #2B352F;
  }
  .rl-card strong {
    display: block;
    color: #1A211E;
    font-size: 9.2pt;
    margin-bottom: 1mm;
  }

  .sla-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2.6mm 6mm;
    font-size: 9.1pt;
    line-height: 1.48;
  }
  .sla-item strong { color: #2F6B55; }

  .ftr {
    padding-top: 2.5mm;
    border-top: 1px solid #CFD3C8;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #68716B;
  }
</style>
</head>
<body>
  <main class="sheet">
    <div>
      <header class="hdr">
        <div>
          <div class="eyebrow">怀客松 2026 · OPC 模式创新赛道 · AI 员工岗位说明书</div>
          <h1>AI 演讲与答辩临场引导师</h1>
          <p>站在主讲人身后的“实时提词与问答参谋”：把复杂思考留在台下，台上用最轻短词稳住眼神、接住追问。</p>
        </div>
        <div class="mark"><span>Cue</span><img src="${symbolDataUri}" alt="X"></div>
      </header>

      <section class="summary-strip">
        <div>
          <div class="k">服务对象</div>
          <div class="v">OPC 主理人 · 路演创业者 · 答辩硕博</div>
        </div>
        <div>
          <div class="k">核心业务场景</div>
          <div class="v">融资路演 · 学术答辩 · 关键方案汇报</div>
        </div>
        <div>
          <div class="k">单场算力消耗</div>
          <div class="v mono">~11,000 Tokens（约 ¥0.12 / 场）</div>
        </div>
      </section>

      <section class="sec">
        <div class="sec-title"><span class="n">01</span><h2>岗位职责</h2><span class="sub">这位 AI 员工具体做什么</span></div>
        <ul class="list">
          <li class="violet"><strong>上台前 · 预编译导播单</strong>：提前读懂讲稿、PPT 与项目背景，提炼每一节的时间节奏、核心观点锚点，以及评委最可能追问的 6–10 个问题与应对短词。</li>
          <li class="amber"><strong>在台上 · 四级渐进引导</strong>：平时安静陪听绝不打扰（L0）；超时给边缘微光（L1）；忘词或遇追问优先递出 2–6 字关键词点醒思路（L2），持续卡壳再展开要点支架（L3）；一旦自己开口接上，未用提示立即自动撤回。</li>
          <li class="green"><strong>下台后 · 证据复盘重练</strong>：按真实录音时间线标出超时、漏讲与问答卡壳片段，支持点选薄弱处直接重练，并更新下一版导播单。</li>
        </ul>
      </section>

      <div class="two-col">
        <section class="sec">
          <div class="sec-title"><span class="n">02</span><h2>输入要求</h2><span class="sub">启动工作所需材料</span></div>
          <ul class="list">
            <li><strong>原始业务材料</strong>：演讲稿、大纲、PPT 文字或项目简介。</li>
            <li class="violet"><strong>场景约束</strong>：限时要求（如 5 分钟陈述 + 2 分钟问答）及使用模式（台下彩排练习 / 正式上台托底）。</li>
            <li class="amber"><strong>听众画像</strong>：评委或客户最关心的核心问题方向。</li>
          </ul>
        </section>

        <section class="sec">
          <div class="sec-title"><span class="n">03</span><h2>交付成果</h2><span class="sub">可核验的工作产出</span></div>
          <ul class="list">
            <li class="violet"><strong>《一页式演讲导播单》</strong>：含时间水位线、核心论点锚点与分级问答提示词卡。</li>
            <li class="amber"><strong>双视角实时护航</strong>：面向主讲人的极简留白视图（Focus）+ 面向复核与评委观察的内部决策视图（Underlying）。</li>
            <li class="green"><strong>《临场复盘诊断单》</strong>：绑定原话与时间戳的复盘记录及重练入口。</li>
          </ul>
        </section>
      </div>

      <section class="sec">
        <div class="sec-title"><span class="n">04</span><h2>人工介入条件</h2><span class="sub">人机权责边界（Human-in-the-Loop）</span></div>
        <div class="redlines">
          <div class="rl-card">
            <strong>① 战前：关键事实本人确认</strong>
            涉及金额、业务指标与承诺的数据，须经主讲人审阅锁定为“白名单”，严禁 AI 在台上自由编造数字。
          </div>
          <div class="rl-card">
            <strong>② 台上：表达主权与一键静音</strong>
            提示仅供启发，采纳权归主讲人；若现场议程临时调整或提示偏差，可一键切回纯静默模式随时接管。
          </div>
          <div class="rl-card">
            <strong>③ 战后：复盘结论人工把关</strong>
            区分“有意临场互动发挥”与“真正漏讲”，经人工确认后再沉淀进个人长期偏好记忆库。
          </div>
        </div>
      </section>

      <section class="sec">
        <div class="sec-title"><span class="n">05</span><h2>验收标准（SLA）</h2><span class="sub">交付质量衡量指标</span></div>
        <div class="sla-grid">
          <div class="sla-item"><strong>• 编译速度与精简度</strong>：千字讲稿 &lt;20 秒生成导播单；弱提示严格控制在 2–6 字，不甩长段文字。</div>
          <div class="sla-item"><strong>• 顺畅表达零打扰</strong>：主讲人顺畅脱稿或口语同义发挥时，无关弹窗干扰次数为 0。</div>
          <div class="sla-item"><strong>• 响应与自动撤回</strong>：停顿窗口响应 &lt;800ms；用户主动说出要点后，过时提示自动撤回率 ≥90%。</div>
          <div class="sla-item"><strong>• 可追溯与低成本</strong>：复盘反馈 100% 对应真实发言时间戳；15 分钟全流程消耗稳定在 ~1.1 万 Tokens 内。</div>
        </div>
      </section>
    </div>

    <footer class="ftr">
      <span>团队：记性好了一点（路皓然 · 任逸康）　|　2026 怀柔科学城 AI for Science - OPC 创新挑战赛</span>
      <span class="mono">Page 1 / 1</span>
    </footer>
  </main>
</body>
</html>`;
}

export function renderBmcAndBillHtml({ fonts, symbolDataUri, tokenProofDataUri }) {
  const proofBlock = tokenProofDataUri
    ? `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#FAFAF7;border:1.5px solid #A6C7BA;padding:3mm;overflow:hidden;">
         <img src="${tokenProofDataUri}" alt="赛事官方算力平台真实 Token 消耗截图" style="max-width:100%;max-height:105mm;object-fit:contain;display:block;" />
       </div>`
    : `<div data-token-proof-slot="true" style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:#FAFAF7;border:1.5px dashed #C7B2A5;padding:6mm;">
         <div class="serif" style="font-size:13pt;font-weight:700;margin-bottom:2.5mm;">官方算力平台真实 Token 消耗截图位</div>
         <p style="font-size:9pt;color:#5A645D;line-height:1.55;max-width:92mm;margin-bottom:4mm;">
           封版前将 OpenDev Credits 或中国移动 BJMoMA 后台消耗截图保存为 <span class="mono" style="color:#1A211E;">assets/hks/token-usage-proof.png</span>，运行构建脚本即可自动嵌入此处。
         </p>
         <div style="font-size:8.4pt;color:#425847;line-height:1.6;">
           涵盖赛中真实调用：讲稿导播单预编译 · 突发追问兜底 · 复盘诊断生成
         </div>
       </div>`;

  return `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<title>记性好了一点-CueX-商业模式画布与单位经济账单</title>
<style>
  @font-face { font-family: 'CueXSerif'; src: url('${fonts.serif}') format('truetype'); font-weight: 200 900; font-display: block; }
  @font-face { font-family: 'CueXSans'; src: url('${fonts.sans}') format('truetype'); font-weight: 100 900; font-display: block; }
  @font-face { font-family: 'CueXDisplay'; src: url('${fonts.instrument}') format('truetype'); font-weight: 400; font-display: block; }
  @font-face { font-family: 'CueXMono'; src: url('${fonts.mono}') format('truetype'); font-weight: 100 800; font-display: block; }

  @page { size: A4 landscape; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body {
    margin: 0;
    padding: 0;
    width: 297mm;
    background: #ECEDE7;
    color: #1A211E;
    font-family: 'CueXSans', sans-serif;
  }
  .serif { font-family: 'CueXSerif', serif; }
  .mono { font-family: 'CueXMono', monospace; }
  h1, h2, h3, p, ul { margin: 0; padding: 0; }

  .page {
    width: 297mm;
    height: 209.4mm;
    padding: 11mm 14mm 9.5mm 14mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    break-after: page;
  }
  .page:last-child { break-after: auto; }

  .hdr {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1.5px solid #1A211E;
    padding-bottom: 3.5mm;
  }
  .eyebrow { font-size: 8.4pt; font-weight: 600; color: #B85627; margin-bottom: 1.2mm; letter-spacing: 0.03em; }
  .hdr h1 { font-family: 'CueXSerif', serif; font-size: 18.5pt; font-weight: 700; }
  .hdr p { font-size: 9.2pt; color: #546058; margin-top: 1.2mm; }
  .mark { display: flex; align-items: center; gap: 1.5mm; }
  .mark span { font-family: 'CueXDisplay', serif; font-size: 23pt; line-height: 1; }
  .mark img { width: 7.5mm; height: 7.5mm; display: block; }

  .canvas-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 3.8mm;
    flex: 1;
    margin: 4mm 0;
  }
  .cell {
    background: #F6F7F2;
    border: 1px solid #D2D6CC;
    border-top: 2.5px solid #2F6B55;
    padding: 3.8mm 4.2mm;
    display: flex;
    flex-direction: column;
  }
  .cell.amber { border-top-color: #B85627; background: #FAF6F2; }
  .cell.violet { border-top-color: #6B57A3; }
  .cell-head {
    display: flex;
    align-items: baseline;
    gap: 2mm;
    margin-bottom: 2.2mm;
    padding-bottom: 1.5mm;
    border-bottom: 1px solid #E2E5DD;
  }
  .cell-head .n { font-family: 'CueXMono', monospace; font-size: 9pt; font-weight: 700; color: #B85627; }
  .cell-head h2 { font-family: 'CueXSerif', serif; font-size: 12pt; font-weight: 700; }
  .cell-body { font-size: 9pt; line-height: 1.55; color: #26302A; display: grid; gap: 2mm; }

  .note-strip {
    background: #F6F7F2;
    border-left: 3.5px solid #6B57A3;
    padding: 2.8mm 4.2mm;
    font-size: 8.9pt;
    color: #2B352F;
    line-height: 1.45;
  }

  .bill-layout {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 5mm;
    flex: 1;
    margin: 4mm 0;
  }
  .card {
    background: #F6F7F2;
    border: 1px solid #D2D6CC;
    padding: 4.2mm 4.8mm;
  }
  .tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.8pt;
    margin-top: 2.5mm;
  }
  .tbl th, .tbl td {
    padding: 2.1mm 2.4mm;
    border-bottom: 1px solid #DDE1D8;
    text-align: left;
  }
  .tbl th {
    background: #EFEFE9;
    border-top: 1.5px solid #1A211E;
    font-weight: 700;
  }
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3.2mm;
    margin-top: 3.2mm;
  }
  .kpi-card { padding: 2.6mm 3.4mm; border: 1px solid #CFD3C8; }

  .ftr {
    padding-top: 2mm;
    border-top: 1px solid #CFD3C8;
    display: flex;
    justify-content: space-between;
    font-size: 7.8pt;
    color: #68716B;
  }
</style>
</head>
<body>
  <!-- PAGE 1: 商业模式画布 -->
  <section class="page">
    <header class="hdr">
      <div>
        <div class="eyebrow">怀客松 2026 · OPC 模式创新赛道 · 必交商业文件（1/2）</div>
        <h1>CueX 商业模式画布（8 要素）</h1>
        <p>切入策略：以“关键演讲与答辩”高频痛点实现首月订阅破冰，靠“彩排教练 + 上台保险 + 个人知识库沉淀”驱动长期复购（注：定价为商业计划假设）</p>
      </div>
      <div class="mark"><span>Cue</span><img src="${symbolDataUri}" alt="X"></div>
    </header>

    <div class="canvas-grid">
      <div class="cell">
        <div class="cell-head"><span class="n">01</span><h2>目标客户</h2></div>
        <div class="cell-body">
          <div><strong>• 首发核心客群</strong>：经常面临重要上台表达的人——① <strong>OPC 主理人与创业者</strong>（融资路演、赛事答辩）；② <strong>高校硕博与科研人员</strong>（毕业答辩、项目评审）；③ <strong>职场汇报者与讲师</strong>。</div>
          <div><strong>• 远期延展（X 场景）</strong>：讲课教学、顾问式销售、求职面试与社交。</div>
        </div>
      </div>

      <div class="cell amber">
        <div class="cell-head"><span class="n">02</span><h2>客户痛点</h2></div>
        <div class="cell-body">
          <div><strong>• 背稿与提词器两难</strong>：背稿容易紧张断片；看滚屏提词器眼神僵硬，改一句话就错位。</div>
          <div><strong>• 突发追问易卡壳</strong>：问答环节没有现成稿子，现场临时组织逻辑容易前几秒大脑空白。</div>
          <div><strong>• 现有实时 AI 太重</strong>：一次弹出整段长文，台上读不完反而打乱表达节奏。</div>
        </div>
      </div>

      <div class="cell violet">
        <div class="cell-head"><span class="n">03</span><h2>价值主张</h2></div>
        <div class="cell-body">
          <div><strong>• 不抢注意力的快思考外挂</strong>：把复杂内容理解提前放在台下完成。</div>
          <div><strong>• 轻提示点醒自己</strong>：顺畅讲时不打扰；卡壳时只递出 2–6 个字的关键短词，余光一扫就能看着评委自然接上。</div>
        </div>
      </div>

      <div class="cell">
        <div class="cell-head"><span class="n">04</span><h2>交付成果</h2></div>
        <div class="cell-body">
          <div><strong>① 上台前</strong>：《一页式演讲导播单与问答词卡》（含时间节奏与事实白名单）。</div>
          <div><strong>② 在台上</strong>：主讲人极简 Focus 实时引导 + 观察者 Underlying 决策透明视图。</div>
          <div><strong>③ 下台后</strong>：《临场复盘诊断单》与卡壳片段单点重练。</div>
        </div>
      </div>

      <div class="cell amber">
        <div class="cell-head"><span class="n">05</span><h2>定价假设（SaaS 订阅）</h2></div>
        <div class="cell-body">
          <div><strong>• 免费体验版（¥0）</strong>：每月 2 场导播单编译 + 基础复盘，用于校园与赛事口碑传播。</div>
          <div><strong>• 个人 / OPC 专业版（¥59/月 或 ¥499/年）</strong>：无限编译、全套四级实时提示、个人项目记忆库沉淀。</div>
          <div><strong>• 团队 / 孵化器席位（¥199/席/月）</strong>：共享问答弹药库与机构路演演练看板。</div>
        </div>
      </div>

      <div class="cell">
        <div class="cell-head"><span class="n">06</span><h2>成本结构</h2></div>
        <div class="cell-body">
          <div><strong>• 单场可变算力成本极低</strong>：因重度推理在台下一次性完成，15 分钟全流程仅需约 1.1 万 Tokens（约 <strong>¥0.12 / 场</strong>）。</div>
          <div><strong>• 基础设施轻量</strong>：Web 服务与轻量语音转写通道。</div>
          <div><strong>• 边际交付成本趋近 0</strong>：双人 OPC 团队借助 AI 工具研发维护。</div>
        </div>
      </div>

      <div class="cell violet">
        <div class="cell-head"><span class="n">07</span><h2>获客渠道</h2></div>
        <div class="cell-body">
          <div><strong>① 场景自传播</strong>：深入黑客松、创业路演营、果壳 OPC 社区与 Agent 集市，用真实上台效果现场转化。</div>
          <div><strong>② 承接 PPT 工具下游</strong>：瞄准 Kimi / Gamma 生成完 PPT 后的下一步刚需——“AI 写完了稿，CueX 陪你讲赢”。</div>
          <div><strong>③ 双视角对比短视频</strong>：展示“台前极简安静 vs 后台实时撤回”的反差体验。</div>
        </div>
      </div>

      <div class="cell">
        <div class="cell-head"><span class="n">08</span><h2>竞争壁垒</h2></div>
        <div class="cell-body">
          <div><strong>① 快慢解耦与撤回控制架构</strong>：核心不在生成长文，而在独立控制器何时闭嘴、递哪几个字、何时撤回。</div>
          <div><strong>② 个人上下文切换成本</strong>：持续沉淀用户的项目资料与习惯用词，越用越默契。</div>
          <div><strong>③ 真实点醒偏好数据飞轮</strong>：积累“哪级短词真正帮人接上话”，用于训练端侧快思考小模型。</div>
        </div>
      </div>
    </div>

    <div class="note-strip">
      <strong>关于订阅留存的思考</strong>：哪怕演讲自信提升，每次见新投资人、答辩新课题、汇报新方案都是陌生新材料——<strong>平时彩排当脱稿教练，正式上台当安全保险</strong>，形成长期复购。
    </div>

    <footer class="ftr">
      <span>团队：记性好了一点（路皓然 · 任逸康）　|　怀客松 2026 · OPC 模式创新赛道</span>
      <span class="mono">Page 1 / 2</span>
    </footer>
  </section>

  <!-- PAGE 2: 单位经济账单 -->
  <section class="page">
    <header class="hdr">
      <div>
        <div class="eyebrow">怀客松 2026 · OPC 模式创新赛道 · 必交商业文件（2/2）</div>
        <h1>CueX 单位经济账单（Unit Economics &amp; Token ROI）</h1>
        <p>核心省流逻辑：把重计算留在上台前预编译，台上 90% 时间安静陪听不调大模型，单场成本降至一毛二，订阅毛利率超 95%</p>
      </div>
      <div class="mark"><span>Cue</span><img src="${symbolDataUri}" alt="X"></div>
    </header>

    <div class="bill-layout">
      <div style="display:flex;flex-direction:column;justify-content:space-between;gap:3.6mm;">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2.6mm;">
            <h2 class="serif" style="font-size:12pt;font-weight:700;">一、 单场（15 分钟演讲 + 问答）Token 消耗对比</h2>
            <span class="mono" style="font-size:8.2pt;font-weight:700;color:#2F6B55;background:#E5EFEA;padding:0.8mm 2.2mm;">省去 ~99% 冗余算力</span>
          </div>
          <div style="margin-bottom:2.8mm;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:3mm;font-size:8.6pt;margin-bottom:1.2mm;">
              <span style="white-space:nowrap;"><strong>普通实时语音助手</strong>（每秒携带长历史轮询大模型）</span>
              <span class="mono" style="color:#B85627;font-weight:700;white-space:nowrap;flex-shrink:0;">~1,500,000 Tokens ≈ ¥8–¥20 / 场</span>
            </div>
            <div style="height:4.2mm;background:#F6EAE3;"><div style="width:100%;height:100%;background:#C45525;"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:3mm;font-size:8.6pt;margin-bottom:1.2mm;">
              <span style="white-space:nowrap;"><strong>CueX 预编译 + 轻量跟进</strong>（战前 ~4.5k · 追问 ~3.5k · 复盘 ~3.0k）</span>
              <span class="mono" style="color:#2F6B55;font-weight:700;white-space:nowrap;flex-shrink:0;">~11,000 Tokens ≈ ¥0.12 / 场</span>
            </div>
            <div style="height:4.2mm;background:#EFEFE9;display:flex;align-items:center;">
              <div style="width:1.6%;min-width:3mm;height:100%;background:#2F6B55;"></div>
              <span style="font-size:8pt;color:#2F6B55;font-weight:600;margin-left:2.5mm;">高频用户每月练 20 场也只需 2 块多算力，不会出现“越用越亏”</span>
            </div>
          </div>
        </div>

        <div class="card" style="flex:1;display:flex;flex-direction:column;justify-content:space-between;">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <h2 class="serif" style="font-size:12pt;font-weight:700;">二、 单个订阅用户月度收益测算（Pro ¥59 / 月）</h2>
              <span style="font-size:7.8pt;color:#68716B;">初创期单位经济测算口径</span>
            </div>
            <table class="tbl">
              <thead>
                <tr>
                  <th>测算科目</th>
                  <th>月度数值</th>
                  <th>测算说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>月度订阅客单价（ARPU）</strong></td>
                  <td class="mono"><strong>¥59.00 / 月</strong></td>
                  <td>个人与 OPC 专业版主力月付定价（年付 ¥499）</td>
                </tr>
                <tr>
                  <td><strong>活跃用户月均使用场次</strong></td>
                  <td class="mono">20 场 / 月</td>
                  <td>含关键路演/答辩多轮彩排及每周日常汇报</td>
                </tr>
                <tr>
                  <td><strong>月均 Token 总消耗</strong></td>
                  <td class="mono">220,000 Tokens</td>
                  <td>11,000 Tokens / 场 × 20 场</td>
                </tr>
                <tr>
                  <td><strong>月度直接算力总成本</strong></td>
                  <td class="mono"><strong>≈ ¥2.40 / 月</strong></td>
                  <td>按主流大模型 API 混合推理均价折算（¥0.12 / 场）</td>
                </tr>
                <tr>
                  <td><strong>单订户月度算力毛利</strong></td>
                  <td class="mono" style="color:#2F6B55;font-weight:700;"><strong>¥56.60 / 月</strong></td>
                  <td>¥59.00 订阅收入 − ¥2.40 直接算力成本</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="kpi-row">
            <div class="kpi-card" style="background:#E5EFEA;border-color:#A6C7BA;">
              <div style="font-size:8pt;color:#2F6B55;font-weight:600;">订阅算力毛利率</div>
              <div class="mono" style="font-size:16.5pt;font-weight:800;color:#2F6B55;">95.9%</div>
            </div>
            <div class="kpi-card" style="background:#F6EAE3;border-color:#DFB39E;">
              <div style="font-size:8pt;color:#B85627;font-weight:600;">Token 营收放大倍数（ROI）</div>
              <div class="mono" style="font-size:16.5pt;font-weight:800;color:#B85627;">24.5×</div>
            </div>
            <div class="kpi-card" style="background:#ECEAF6;border-color:#BEB6DC;">
              <div style="font-size:8pt;color:#6B57A3;font-weight:600;">机构席位（¥199/月）ROI</div>
              <div class="mono" style="font-size:16.5pt;font-weight:800;color:#6B57A3;">&gt; 55×</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="display:flex;flex-direction:column;justify-content:space-between;">
        <div style="margin-bottom:2.8mm;">
          <h2 class="serif" style="font-size:12pt;font-weight:700;">三、 赛中真实 Token 消耗证明</h2>
          <p style="font-size:8.4pt;color:#68716B;margin-top:1mm;line-height:1.45;">
            怀客松 48 小时开发联调与实测期间，赛事官方算力平台真实调用凭证：
          </p>
        </div>
        ${proofBlock}
      </div>
    </div>

    <footer class="ftr">
      <span>团队：记性好了一点（路皓然 · 任逸康）　|　怀客松 2026 · OPC 模式创新赛道</span>
      <span class="mono">Page 2 / 2</span>
    </footer>
  </section>
</body>
</html>`;
}

export function renderCoverPosterHtml({ fonts, symbolDataUri, dimensionalXDataUri }) {
  return `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<title>CueX Cover 1920x1080</title>
<style>
  @font-face { font-family: 'CueXSerif'; src: url('${fonts.serif}') format('truetype'); font-weight: 200 900; font-display: block; }
  @font-face { font-family: 'CueXSans'; src: url('${fonts.sans}') format('truetype'); font-weight: 100 900; font-display: block; }
  @font-face { font-family: 'CueXDisplay'; src: url('${fonts.instrument}') format('truetype'); font-weight: 400; font-display: block; }

  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 1920px;
    height: 1080px;
    overflow: hidden;
    background: #ECEDE7;
    color: #1A211E;
    font-family: 'CueXSerif', serif;
  }
  .poster {
    width: 1920px;
    height: 1080px;
    padding: 92px 108px 82px 108px;
    display: grid;
    grid-template-columns: 1.05fr 0.95fr;
    position: relative;
  }
  .left {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .wordmark {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .wordmark span {
    font-family: 'CueXDisplay', serif;
    font-size: 136px;
    line-height: 0.9;
  }
  .wordmark img {
    width: 108px;
    height: 108px;
    display: block;
  }
  .hero {
    font-size: 92px;
    font-weight: 700;
    line-height: 1.15;
    margin-top: 48px;
    letter-spacing: -0.015em;
  }
  .tagline {
    font-size: 42px;
    color: #2B362F;
    margin-top: 22px;
    font-weight: 450;
  }
  .role {
    font-family: 'CueXSans', sans-serif;
    margin-top: 44px;
    font-size: 28px;
    color: #425847;
    line-height: 1.55;
  }
  .footer {
    font-family: 'CueXSans', sans-serif;
    font-size: 24px;
    color: #68716B;
  }
  .right {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .x-img {
    width: 560px;
    height: 560px;
    filter: drop-shadow(18px 26px 20px rgba(34, 46, 36, 0.16));
    z-index: 2;
  }
  .end {
    position: absolute;
    z-index: 3;
  }
  .end .t { font-size: 44px; line-height: 1.2; }
  .end .s { font-family: 'CueXSans', sans-serif; font-size: 23px; color: #68716B; margin-top: 8px; }
</style>
</head>
<body>
  <div class="poster">
    <div class="left">
      <div>
        <div class="wordmark">
          <span>Cue</span>
          <img src="${symbolDataUri}" alt="X">
        </div>
        <div class="hero">你的快思考外挂</div>
        <div class="tagline">在深度思考之外，接住当下。</div>
        <div class="role">
          AI 演讲与答辩临场引导师<br>
          <span style="color:#68716B;font-size:25px;">平时安静陪听 · 卡壳短词点醒 · 开口自动撤回</span>
        </div>
      </div>
      <div class="footer">
        记性好了一点　　路皓然 / 任逸康　·　怀客松 2026 OPC 模式创新
      </div>
    </div>

    <div class="right">
      <svg viewBox="0 0 820 906" style="position:absolute;inset:0;width:100%;height:100%;">
        <path d="M275 305 C228 248 188 214 148 198" stroke="#B85627" stroke-width="4" stroke-dasharray="2 9" fill="none"/>
        <path d="M545 305 C592 248 632 214 672 198" stroke="#6B57A3" stroke-width="4.5" stroke-linecap="round" fill="none"/>
        <path d="M275 605 C228 662 188 696 148 712" stroke="#6B57A3" stroke-width="4" stroke-dasharray="2 9" fill="none"/>
        <path d="M545 605 C592 662 632 696 672 712" stroke="#B85627" stroke-width="4" stroke-dasharray="2 9" fill="none"/>
      </svg>

      <div class="end" style="left:12px;top:64px;">
        <div class="t">面试与社交</div>
        <div class="s">高压追问破冰</div>
      </div>
      <div class="end" style="right:12px;top:64px;text-align:right;">
        <div class="t" style="color:#B85627;font-weight:700;">演讲与答辩</div>
        <div class="s" style="color:#B85627;font-weight:600;">当前聚焦起步</div>
      </div>
      <img class="x-img" src="${dimensionalXDataUri}" alt="CueX Dimensional X">
      <div class="end" style="left:12px;bottom:64px;">
        <div class="t">讲课与教学</div>
        <div class="s">课堂节奏控场</div>
      </div>
      <div class="end" style="right:12px;bottom:64px;text-align:right;">
        <div class="t">顾问式销售</div>
        <div class="s">方案讲解与异议</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
