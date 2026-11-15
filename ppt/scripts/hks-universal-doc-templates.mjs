export function renderUniversalJobSpecHtml({ fonts, symbolDataUri }) {
  return `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<title>记性好了一点-CueX-AI员工岗位说明书（通用快思考引擎版）</title>
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
    font-size: 9.5pt;
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
  .summary-strip .v { font-weight: 600; color: #1A211E; white-space: nowrap; }

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
    font-size: 9.3pt;
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
          <h1>OPC 全天候临场参谋（通用快思考引擎）</h1>
          <p>超级个体的“随身认知眼镜”：在高压对话现场替你看清潜台词、递出底牌短词，不抢眼神、接住当下。</p>
        </div>
        <div class="mark"><span>Cue</span><img src="${symbolDataUri}" alt="X"></div>
      </header>

      <section class="summary-strip">
        <div>
          <div class="k">直接汇报对象</div>
          <div class="v">OPC 主理人 · 顾问销售 · 求职者</div>
        </div>
        <div>
          <div class="k">跨场景上岗范围</div>
          <div class="v">路演游园 · 商务谈判 · 高压面试与社交</div>
        </div>
        <div>
          <div class="k">底层引擎与单场算力</div>
          <div class="v mono">Jev-like 单字决策 · ~1.1万 Tokens (¥0.12)</div>
        </div>
      </section>

      <section class="sec">
        <div class="sec-title"><span class="n">01</span><h2>岗位职责</h2><span class="sub">一人公司多身份切换时的随身临场大脑</span></div>
        <ul class="list">
          <li class="violet"><strong>场前 · 组装场景底牌卡包</strong>：无论有稿还是无稿，自动吃透项目文档、报价底线、个人简历或客户背景，生成结构化《临场底牌卡包》并置入共享上下文缓存。</li>
          <li class="amber"><strong>场中 · 看清局势与四级轻引导</strong>：由 Jev-like 决策模型高频并行识别“对方真实关切 / 是否跑题 / 是否卡壳”——顺畅交流时绝对隐身（L0）；偏离关切给边缘微光（L1）；被突发追问时优先递出 2–6 字底牌词点醒（L2），持续受阻再给回应支架（L3）；一旦用户自己开口补上，候选提示立即自动撤回。</li>
          <li class="green"><strong>场后 · 沉淀个人底牌记忆库</strong>：自动归档本场新出现的真实追问与有效应对点，持续增厚主理人专属上下文资产（亦可按需切入片段重练）。</li>
        </ul>
      </section>

      <div class="two-col">
        <section class="sec">
          <div class="sec-title"><span class="n">02</span><h2>输入要求</h2><span class="sub">不限文体，无需逐字稿</span></div>
          <ul class="list">
            <li><strong>业务底牌材料</strong>：产品手册、项目简介、个人简历、报价红线或过往沟通纪要（支持无讲稿即兴上场）。</li>
            <li class="violet"><strong>本场目标与对手画像</strong>：本次交流核心诉求（如展会破冰、谈成合作、通过面试）及对方关注焦点。</li>
            <li class="amber"><strong>实时现场音频流</strong>：麦克风流式语音输入与对话状态跟踪。</li>
          </ul>
        </section>

        <section class="sec">
          <div class="sec-title"><span class="n">03</span><h2>交付成果</h2><span class="sub">可核验的跨场景工作产出</span></div>
          <ul class="list">
            <li class="violet"><strong>可秒切的《场景底牌卡包》</strong>：一套引擎按需挂载路演卡、谈判卡、面试卡等任意快思考卡包。</li>
            <li class="amber"><strong>双视角实时护航界面</strong>：面向使用者的极简无打扰视图（Focus）+ 面向复核与评审的内部决策透视视图（Underlying）。</li>
            <li class="green"><strong>《关键追问与底牌更新单》</strong>：绑定对话时间线的局势转折记录与底牌增量沉淀。</li>
          </ul>
        </section>
      </div>

      <section class="sec">
        <div class="sec-title"><span class="n">04</span><h2>人工介入条件</h2><span class="sub">人机权责边界（Human-in-the-Loop）</span></div>
        <div class="redlines">
          <div class="rl-card">
            <strong>① 场前：核心底线与事实本人锁定</strong>
            涉及报价底线、核心指标、履历事实与商务承诺的数据，须经本人审阅锁定，严禁 AI 临场自由捏造。
          </div>
          <div class="rl-card">
            <strong>② 场中：表达主权归人与一键静默</strong>
            参谋只递支点词，绝不替人接管发声；遇到无需辅助的私密寒暄或议题转向，主理人可一键切回纯静默随时接管。
          </div>
          <div class="rl-card">
            <strong>③ 场后：长期记忆入库人工审核</strong>
            场中临时权宜话术不会自动污染长期底牌库，须经本人确认后才沉淀为跨场次复用的标准应对经验。
          </div>
        </div>
      </section>

      <section class="sec">
        <div class="sec-title"><span class="n">05</span><h2>验收标准（SLA）</h2><span class="sub">通用快思考引擎交付指标</span></div>
        <div class="sla-grid">
          <div class="sla-item"><strong>• 充足上下文与极短提示</strong>：100% 共享完整底牌缓存；L2 临场点醒词严格控制在 2–6 字，零长篇大论刷屏。</div>
          <div class="sla-item"><strong>• 顺畅交流零打扰</strong>：用户正常围绕对方关切交流或自然换词表达时，无关弹窗打断次数为 0。</div>
          <div class="sla-item"><strong>• 单字决策速度与自动撤回</strong>：Jev-like 并行单 Token 判断延迟 &lt;800ms；用户自行接上话后，过期候选撤回率 ≥90%。</div>
          <div class="sla-item"><strong>• 跨场景切换与低成本</strong>：30 秒内完成新场景卡包挂载；15 分钟高压对话总消耗稳定在 ~1.1 万 Tokens 内。</div>
        </div>
      </section>
    </div>

    <footer class="ftr">
      <span>团队：记性好了一点（路皓然 · 任逸康）　|　2026 怀柔科学城 AI for Science - OPC 创新挑战赛（通用快思考引擎版）</span>
      <span class="mono">Page 1 / 1</span>
    </footer>
  </main>
</body>
</html>`;
}

export function renderUniversalBmcAndBillHtml({ fonts, symbolDataUri, tokenProofDataUri }) {
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
           涵盖赛中真实调用：多场景底牌卡包合成 · 突发追问慢思考备货 · 游园会与路演实测
         </div>
       </div>`;

  return `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<title>记性好了一点-CueX-商业模式画布与单位经济账单（通用快思考引擎版）</title>
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
  .cell-body { font-size: 8.9pt; line-height: 1.54; color: #26302A; display: grid; gap: 2mm; }

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
        <h1>CueX 商业模式画布（8 要素 · 通用快思考引擎版）</h1>
        <p>商业主线：在大模型普遍强化“事前慢思考”的时代，占领真实世界高压交流的“临场快思考交互层”（注：定价为商业计划假设）</p>
      </div>
      <div class="mark"><span>Cue</span><img src="${symbolDataUri}" alt="X"></div>
    </header>

    <div class="canvas-grid">
      <div class="cell">
        <div class="cell-head"><span class="n">01</span><h2>目标客户</h2></div>
        <div class="cell-body">
          <div><strong>• 核心超级个体（OPC）</strong>：一人身兼创始人、销售、公关多职的主理人与顾问（游园接待、路演、商务谈判）。</div>
          <div><strong>• 高压沟通人群</strong>：面临尖锐追问的<strong>顾问式销售</strong>（异议应对）与<strong>求职面试/社交破冰者</strong>（深度思考但临场慢热人群）。</div>
        </div>
      </div>

      <div class="cell amber">
        <div class="cell-head"><span class="n">02</span><h2>客户痛点</h2></div>
        <div class="cell-body">
          <div><strong>• 当局者迷看漏潜台词</strong>：身处高压对话中注意力被情绪占满，难以及时察觉对方的真实意图与话锋转移。</div>
          <div><strong>• 脑中有货却调不出底牌</strong>：即便事前准备充分，突发追问前几秒依然容易大脑空白、嘴跟不上脑子。</div>
          <div><strong>• 生成式 AI 长文抢走眼神</strong>：普通语音 AI 每次吐出百字长段，现场根本没法读完，一看屏幕交流就断。</div>
        </div>
      </div>

      <div class="cell violet">
        <div class="cell-head"><span class="n">03</span><h2>价值主张</h2></div>
        <div class="cell-body">
          <div><strong>• 像眼镜一样融入现场的快思考外挂</strong>：全场景通用，平时安静隐身零打扰。</div>
          <div><strong>• 看清局势 + 只递一词</strong>：关键时刻用 2–6 字点破对方潜台词并唤醒你的个人底牌，一旦自己接上话立即撤回。</div>
        </div>
      </div>

      <div class="cell">
        <div class="cell-head"><span class="n">04</span><h2>交付成果</h2></div>
        <div class="cell-body">
          <div><strong>① 可秒切的《场景底牌卡包》</strong>：支持无逐字稿上场，一键切换路演游园、商务谈判、求职面试等卡包。</div>
          <div><strong>② 双视角实时护航</strong>：使用者 Focus 极简视图 + 评审复核 Underlying 决策透明视图。</div>
          <div><strong>③ 个人长期底牌记忆库</strong>：沉淀历次实战追问与应对资产。</div>
        </div>
      </div>

      <div class="cell amber">
        <div class="cell-head"><span class="n">05</span><h2>定价假设（SaaS 订阅）</h2></div>
        <div class="cell-body">
          <div><strong>• 免费体验版（¥0）</strong>：每月 2 场临场护航 + 公开卡包体验，驱动社区口碑裂变。</div>
          <div><strong>• 个人 / OPC 参谋版（¥59/月 或 ¥499/年）</strong>：全场景无限切换、四级实时引导、个人专属底牌库持续沉淀。</div>
          <div><strong>• 团队 / 社区席位（¥199/席/月）</strong>：面向 OPC 社区与销售团队，共享金牌应对经验卡包。</div>
        </div>
      </div>

      <div class="cell">
        <div class="cell-head"><span class="n">06</span><h2>成本结构</h2></div>
        <div class="cell-body">
          <div><strong>• 单场可变算力极轻</strong>：依托共享上下文 KV 缓存 + Jev-like 单 Token 决策，15 分钟高压交流仅约 1.1 万 Tokens（<strong>≈ ¥0.12 / 场</strong>）。</div>
          <div><strong>• 轻量流式底座</strong>：Web 端与轻量流式语音通道，无需昂贵视频渲染。</div>
          <div><strong>• 边际交付成本趋近 0</strong>：双人 OPC 团队协同 AI 研发维护。</div>
        </div>
      </div>

      <div class="cell violet">
        <div class="cell-head"><span class="n">07</span><h2>获客渠道</h2></div>
        <div class="cell-body">
          <div><strong>① 现场佩戴自证（Dogfooding）</strong>：在黑客松游园会、创业展会与路演现场亲自佩戴实战，直观转化同频创业者。</div>
          <div><strong>② 场景卡包生态传播</strong>：在果壳 OPC 社区与 Agent 集市分发“融资快问快答卡”“谈单异议卡”“秋招面试卡”。</div>
          <div><strong>③ 双视角实测短视频</strong>：展示“表面极简安静 vs 后台毫秒级撤回”的真实反差。</div>
        </div>
      </div>

      <div class="cell">
        <div class="cell-head"><span class="n">08</span><h2>竞争壁垒</h2></div>
        <div class="cell-body">
          <div><strong>① Jev-like 单字决策 × 慢思考解耦架构</strong>：不靠阉割小参数 LLM，而靠类型化单 Token 校准概率实现给足上下文下的毫秒门控。</div>
          <div><strong>② 随身底牌库切换成本</strong>：积累用户的真实业务底牌与表达习惯，越用越默契。</div>
          <div><strong>③ 真实“点醒瞬间”偏好数据飞轮</strong>：沉淀稀缺的人类临场快思考反馈轨迹。</div>
        </div>
      </div>
    </div>

    <div class="note-strip">
      <strong>为什么是“认知眼镜”式高留存</strong>：OPC 超级个体每天都在见陌生客户、谈新项目、跨入新局，底牌常换常新——CueX 不是用完即弃的一次性培训班，而是全天候陪跑的随身临场参谋。
    </div>

    <footer class="ftr">
      <span>团队：记性好了一点（路皓然 · 任逸康）　|　怀客松 2026 · OPC 模式创新赛道（通用快思考引擎版）</span>
      <span class="mono">Page 1 / 2</span>
    </footer>
  </section>

  <!-- PAGE 2: 单位经济账单 -->
  <section class="page">
    <header class="hdr">
      <div>
        <div class="eyebrow">怀客松 2026 · OPC 模式创新赛道 · 必交商业文件（2/2）</div>
        <h1>CueX 单位经济账单（Unit Economics &amp; Token ROI）</h1>
        <p>核心省流原理：上下文一点不省（走共享缓存），省掉 99% 的长思维链与废话生成（Jev-like 每次只读 1 个决策 Token）</p>
      </div>
      <div class="mark"><span>Cue</span><img src="${symbolDataUri}" alt="X"></div>
    </header>

    <div class="bill-layout">
      <div style="display:flex;flex-direction:column;justify-content:space-between;gap:3.6mm;">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2.6mm;">
            <h2 class="serif" style="font-size:12pt;font-weight:700;">一、 单场（15 分钟高压交流）Token 消耗对比</h2>
            <span class="mono" style="font-size:8.2pt;font-weight:700;color:#2F6B55;background:#E5EFEA;padding:0.8mm 2.2mm;">省去 ~99% 废话生成算力</span>
          </div>
          <div style="margin-bottom:2.8mm;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:3mm;font-size:8.6pt;margin-bottom:1.2mm;">
              <span style="white-space:nowrap;"><strong>生成式实时语音 AI</strong>（每轮重跑长思维链并输出百字回复）</span>
              <span class="mono" style="color:#B85627;font-weight:700;white-space:nowrap;flex-shrink:0;">~1,500,000 Tokens ≈ ¥8–¥20 / 场</span>
            </div>
            <div style="height:4.2mm;background:#F6EAE3;"><div style="width:100%;height:100%;background:#C45525;"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:3mm;font-size:8.6pt;margin-bottom:1.2mm;">
              <span style="white-space:nowrap;"><strong>CueX 共享缓存 + Jev-like 单字决策</strong>（缓存底牌 + 1-Token 判断 + 异步短词）</span>
              <span class="mono" style="color:#2F6B55;font-weight:700;white-space:nowrap;flex-shrink:0;">~11,000 Tokens ≈ ¥0.12 / 场</span>
            </div>
            <div style="height:4.2mm;background:#EFEFE9;display:flex;align-items:center;">
              <div style="width:1.6%;min-width:3mm;height:100%;background:#2F6B55;"></div>
              <span style="font-size:8pt;color:#2F6B55;font-weight:600;margin-left:2.5mm;">即便没有逐字演讲稿，靠前缀缓存与单 Token 决策依然单场仅需一毛二</span>
            </div>
          </div>
        </div>

        <div class="card" style="flex:1;display:flex;flex-direction:column;justify-content:space-between;">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <h2 class="serif" style="font-size:12pt;font-weight:700;">二、 单个订阅用户月度收益测算（OPC 参谋版 ¥59 / 月）</h2>
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
                  <td>个人与 OPC 参谋版主力月付定价（年付 ¥499）</td>
                </tr>
                <tr>
                  <td><strong>活跃用户月均实战场次</strong></td>
                  <td class="mono">20 场 / 月</td>
                  <td>涵盖客户谈判、展会接待、路演答辩与高压面试</td>
                </tr>
                <tr>
                  <td><strong>月均有效 Token 消耗</strong></td>
                  <td class="mono">220,000 Tokens</td>
                  <td>11,000 Tokens / 场 × 20 场（高比例命中共享缓存）</td>
                </tr>
                <tr>
                  <td><strong>月度直接算力总成本</strong></td>
                  <td class="mono"><strong>≈ ¥2.40 / 月</strong></td>
                  <td>Output Token 极少，按混合推理与缓存均价折算</td>
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
              <div style="font-size:8pt;color:#6B57A3;font-weight:600;">团队席位（¥199/月）ROI</div>
              <div class="mono" style="font-size:16.5pt;font-weight:800;color:#6B57A3;">&gt; 55×</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="display:flex;flex-direction:column;justify-content:space-between;">
        <div style="margin-bottom:2.8mm;">
          <h2 class="serif" style="font-size:12pt;font-weight:700;">三、 赛中真实 Token 消耗证明</h2>
          <p style="font-size:8.4pt;color:#68716B;margin-top:1mm;line-height:1.45;">
            怀客松 48 小时开发联调与游园会实测期间，赛事官方算力平台真实调用凭证：
          </p>
        </div>
        ${proofBlock}
      </div>
    </div>

    <footer class="ftr">
      <span>团队：记性好了一点（路皓然 · 任逸康）　|　怀客松 2026 · OPC 模式创新赛道（通用快思考引擎版）</span>
      <span class="mono">Page 2 / 2</span>
    </footer>
  </section>
</body>
</html>`;
}

export function renderUniversalCoverPosterHtml({ fonts, symbolDataUri, dimensionalXDataUri }) {
  return `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<title>CueX Universal Cover 1920x1080</title>
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
          通用快思考引擎 · OPC 全天候临场参谋<br>
          <span style="color:#68716B;font-size:25px;">看清潜台词 · 递出底牌短词 · 开口自动撤回</span>
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
        <div class="t">求职面试</div>
        <div class="s">高压追问破冰</div>
      </div>
      <div class="end" style="right:12px;top:64px;text-align:right;">
        <div class="t" style="color:#B85627;font-weight:700;">路演与游园会</div>
        <div class="s" style="color:#B85627;font-weight:600;">高频答疑 · 现场实测</div>
      </div>
      <img class="x-img" src="${dimensionalXDataUri}" alt="CueX Dimensional X">
      <div class="end" style="left:12px;bottom:64px;">
        <div class="t">即兴社交与交流</div>
        <div class="s">看清潜台词接话</div>
      </div>
      <div class="end" style="right:12px;bottom:64px;text-align:right;">
        <div class="t">商务谈判与销售</div>
        <div class="s">方案博弈与异议</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
