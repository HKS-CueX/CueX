import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as THREE from 'three';
import { useIsActivePage, type DesignSystem, type Page, type SlideMeta, type SlideTransition } from '@open-slide/core';
import dimensionalX from '../../../assets/brand/x-dimensional.png';
import symbol from '../../../assets/brand/cuex-symbol-dimensional.svg';
import serifFont from '../../../assets/fonts/NotoSerifSC-VF.ttf';
import sansFont from '../../../assets/fonts/NotoSansSC-VF.ttf';
import instrumentFont from '../../../assets/fonts/InstrumentSerif-Regular.ttf';

export const design: DesignSystem = {
  palette: { bg: '#ECEDE7', text: '#1A211E', accent: '#C85A28' },
  fonts: {
    display: 'CueXHksDisplay, CueXHksSerif, serif',
    body: 'CueXHksSerif, serif',
  },
  typeScale: { hero: 76, body: 30 },
  radius: 0,
};

const serifHref = new URL(serifFont, import.meta.url).href;
const sansHref = new URL(sansFont, import.meta.url).href;
const instrumentHref = new URL(instrumentFont, import.meta.url).href;

const ink = '#1A211E';
const sage = '#425847';
const muted = '#68716B';
const amber = '#B85627';
const violet = '#6B57A3';
const green = '#2F6B55';
const hairline = '#C9CEC3';

const css = `
@font-face{font-family:CueXHksSerif;src:url('${serifHref}') format('truetype');font-style:normal;font-weight:200 900;font-display:block}
@font-face{font-family:CueXHksSans;src:url('${sansHref}') format('truetype');font-style:normal;font-weight:100 900;font-display:block}
@font-face{font-family:CueXHksDisplay;src:url('${instrumentHref}') format('truetype');font-style:normal;font-weight:400;font-display:block}

.cuex-hks,.cuex-hks *{box-sizing:border-box}
.cuex-hks h1,.cuex-hks h2,.cuex-hks h3,.cuex-hks p{margin:0}
.cuex-hks img,.cuex-hks svg,.cuex-hks canvas{display:block;max-width:none}
.cuex-hks svg{overflow:visible}
.cuex-sans{font-family:CueXHksSans,sans-serif}
.cuex-display{font-family:CueXHksDisplay,CueXHksSerif,serif}

.cuex-hks-motion .cx-enter{animation:cx-enter .85s cubic-bezier(.18,.7,.2,1) both}
.cuex-hks-motion .cx-enter-d1{animation:cx-enter .85s cubic-bezier(.18,.7,.2,1) .14s both}
.cuex-hks-motion .cx-draw{stroke-dasharray:1200;animation:cx-draw 1.4s cubic-bezier(.25,.7,.2,1) .15s both}
.cuex-hks-motion .cx-x{animation:cx-x 1.6s cubic-bezier(.18,.7,.2,1) both}

@keyframes cx-enter{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes cx-draw{from{stroke-dashoffset:1200}to{stroke-dashoffset:0}}
@keyframes cx-x{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}

[data-osd-freeze-motion] .cuex-hks *,
@media print {
  .cuex-hks *{animation:none!important;transition:none!important}
}
@media(prefers-reduced-motion:reduce){
  .cuex-hks *{animation:none!important;transition:none!important}
}
`;

if (typeof document !== 'undefined') {
  const id = 'osd-styles-cuex-hks';
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

function Canvas16x9({ children, name }: { children: ReactNode; name: string }) {
  const animate = useIsActivePage();
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#ECEDE7' }}>
      <section
        className={`cuex-wide cuex-hks${animate ? ' cuex-hks-motion' : ''}`}
        data-cuex-page={name}
        style={{
          position: 'relative',
          width: 1920,
          height: 1080,
          overflow: 'clip',
          background: '#ECEDE7',
          color: ink,
          fontFamily: 'var(--osd-font-body)',
        }}
      >
        {children}
      </section>
    </div>
  );
}

function At({ children, style, className }: { children?: ReactNode; style: CSSProperties; className?: string }) {
  return <div className={className} style={{ position: 'absolute', ...style }}>{children}</div>;
}

function SmallMark() {
  return (
    <At style={{ right: 84, top: 64, display: 'flex', gap: 5, alignItems: 'center', zIndex: 3 }}>
      <span className="cuex-display" style={{ fontSize: 42, lineHeight: 1 }}>Cue</span>
      <img src={symbol} alt="X" style={{ width: 38, height: 38 }} />
    </At>
  );
}

/* ============================================================================
 * P1: 封面与真实痛点 — 准备得越深，越怕台上突然卡壳。
 * ========================================================================== */
const P1Cover: Page = () => (
  <Canvas16x9 name="cover">
    {/* Brand Mark */}
    <At style={{ left: 88, top: 76, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="cuex-display" style={{ fontSize: 118, lineHeight: 0.92 }}>Cue</span>
      <img src={symbol} alt="X" style={{ width: 96, height: 96 }} />
    </At>

    <At className="cx-enter" style={{ left: 430, top: 96, fontSize: 72, fontWeight: 550, lineHeight: 1.18 }}>
      准备得越深，越怕突然卡壳。
    </At>

    {/* Left Quiet Context */}
    <At style={{ left: 92, top: 256, fontSize: 34, color: sage, fontWeight: 500 }}>
      AI 演讲与答辩临场引导师
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 318, fontSize: 23, color: muted }}>
      灵感源自卡尼曼《思考，快与慢》
    </At>

    <At style={{ left: 92, top: 438, width: 520 }}>
      <p className="cuex-sans" style={{ fontSize: 22, color: muted, marginBottom: 10 }}>台上交流靠快思考</p>
      <p style={{ fontSize: 32, color: ink, lineHeight: 1.4 }}>眼神看着评委，顺畅讲清观点</p>
    </At>

    <At style={{ left: 92, top: 600, width: 520 }}>
      <p className="cuex-sans" style={{ fontSize: 22, color: amber, marginBottom: 10 }}>突发状况逼出慢思考</p>
      <p style={{ fontSize: 32, color: ink, lineHeight: 1.4 }}>走神忘词、评委追问，大脑瞬间空白</p>
    </At>

    <At className="cuex-sans" style={{ left: 92, bottom: 74, fontSize: 24, color: muted }}>
      记性好了一点　　路皓然 / 任逸康　·　OPC 模式创新
    </At>

    {/* Right Open Trajectory Metaphor (No heavy borders, pure paper breathing room) */}
    <svg aria-label="脱稿演讲遇到追问时，由一个短词点醒并接住表达" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }}>
      <path className="cx-draw" pathLength="1200" d="M 760 560 H 1165" stroke="#4D6553" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <path d="M 1195 560 H 1810" stroke="#8A938C" strokeWidth="2.2" strokeDasharray="4 14" opacity="0.35" fill="none" />
      {/* Interruption Cut */}
      <path d="M 1180 498 V 624" stroke={amber} strokeWidth="5" strokeLinecap="round" />
      <path className="cx-draw" pathLength="1200" d="M 1590 486 C 1410 486, 1300 525, 1188 558" stroke={amber} strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="1590" cy="486" r="5.5" fill={amber} />
      {/* CueX Recovery Curve */}
      <path className="cx-draw" pathLength="1200" d="M 1180 560 C 1280 560, 1335 720, 1495 720 H 1805" stroke={violet} strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <path d="M 1790 710 L 1808 720 L 1790 730" stroke={violet} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="1312" cy="642" r="8" fill={amber} />
    </svg>

    <At className="cuex-sans" style={{ left: 760, top: 454, fontSize: 23, color: muted }}>主讲人</At>
    <At style={{ left: 760, top: 494, fontSize: 38, color: sage }}>脱稿顺畅陈述</At>

    <At className="cuex-sans" style={{ left: 1380, top: 378, fontSize: 23, color: amber }}>评委突然追问</At>
    <At style={{ left: 1380, top: 416, fontSize: 34, color: amber, lineHeight: 1.3 }}>“每秒调大模型，你们怎么赚钱？”</At>

    <At className="cuex-sans" style={{ left: 1620, top: 514, fontSize: 23, color: muted }}>低头死念稿 / 卡壳</At>

    <At className="cuex-sans" style={{ left: 1120, top: 682, fontSize: 22, color: amber, fontWeight: 600 }}>CueX 递出一个词</At>
    <At style={{ left: 1116, top: 720, fontSize: 32, color: ink, fontWeight: 600 }}>「台下预编译」</At>

    <At style={{ left: 1515, top: 654, fontSize: 36, color: violet }}>点醒记忆，看着评委接住</At>
    <At className="cuex-sans" style={{ left: 1515, top: 744, fontSize: 24, color: muted }}>路演 · 答辩 · 汇报</At>
  </Canvas16x9>
);

/* ============================================================================
 * P2: 痛点反驳 — 提示太长，反而打断表达。
 * ========================================================================== */
const P2LessIsMore: Page = () => (
  <Canvas16x9 name="less-is-more">
    <SmallMark />
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 78, fontWeight: 550, lineHeight: 1.18 }}>
      提示太长，反而打断表达。
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 196, fontSize: 28, color: muted }}>
      AI 回答正确 ≠ 现场帮得上忙。在台上，读字本身就是最大的分心。
    </At>

    {/* Three Clean Open Columns separated only by hairlines */}
    <svg aria-hidden viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }}>
      <line x1="656" y1="320" x2="656" y2="880" stroke={hairline} strokeWidth="1.5" />
      <line x1="1264" y1="320" x2="1264" y2="880" stroke={hairline} strokeWidth="1.5" />
    </svg>

    {/* Column 1 */}
    <At style={{ left: 92, top: 332, width: 500 }}>
      <p className="cuex-sans" style={{ fontSize: 24, color: muted }}>传统提词器</p>
      <h2 style={{ marginTop: 18, fontSize: 50, fontWeight: 600, color: '#4E5851' }}>逐字滚屏</h2>
      <p className="cuex-sans" style={{ marginTop: 34, fontSize: 28, lineHeight: 1.6, color: '#4E5851' }}>
        眼神被锁死在屏幕上，<br />
        临场改一句话就错位，<br />
        一进自由问答彻底失效。
      </p>
      <p className="cuex-sans" style={{ marginTop: 64, fontSize: 24, color: muted }}>
        像在背书，不像在交流
      </p>
    </At>

    {/* Column 2 */}
    <At style={{ left: 712, top: 332, width: 496 }}>
      <p className="cuex-sans" style={{ fontSize: 24, color: amber }}>普通实时 AI</p>
      <h2 style={{ marginTop: 18, fontSize: 50, fontWeight: 600, color: amber }}>弹出整段长文</h2>
      <p className="cuex-sans" style={{ marginTop: 34, fontSize: 28, lineHeight: 1.6, color: ink }}>
        一秒刷出上百字标准答案，<br />
        读完要花六七秒，<br />
        台上早已冷场，越看越乱。
      </p>
      <p className="cuex-sans" style={{ marginTop: 64, fontSize: 24, color: amber, fontWeight: 500 }}>
        阅读负担过重，帮了倒忙
      </p>
    </At>

    {/* Column 3: CueX */}
    <At style={{ left: 1320, top: 332, width: 512 }}>
      <p className="cuex-sans" style={{ fontSize: 24, color: green, fontWeight: 600 }}>CueX 临场引导</p>
      <h2 style={{ marginTop: 18, fontSize: 50, fontWeight: 650, color: ink }}>只递关键短词</h2>
      <p className="cuex-sans" style={{ marginTop: 34, fontSize: 28, lineHeight: 1.6, color: ink }}>
        顺畅讲时绝不弹窗；<br />
        卡壳时只给 2–4 个字，<br />
        余光一扫点醒，话由自己说出。
      </p>
      <div style={{ marginTop: 52, display: 'inline-block', padding: '12px 24px', borderLeft: `4px solid ${green}`, background: '#E5EFEA' }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: green }}>把眼神留给评委</span>
      </div>
    </At>
  </Canvas16x9>
);

/* ============================================================================
 * P3: AI 员工岗位闭环 — 平时不打扰，卡壳由轻到重托底。
 * ========================================================================== */
const P3EmployeeLoop: Page = () => (
  <Canvas16x9 name="employee-loop">
    <SmallMark />
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 76, fontWeight: 550, lineHeight: 1.18 }}>
      平时不打扰，卡壳由轻到重托底。
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 196, fontSize: 28, color: sage }}>
      首名 AI 员工岗位：战前整理导播单　→　台上四级线性引导　→　下台复盘重练
    </At>

    {/* Clean 4-Step Linear Escalation Ladder */}
    <svg aria-label="从安静陪听到微光、短词弱提示、要点支架的线性递进与自动撤回" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }}>
      <line x1="92" y1="562" x2="1828" y2="562" stroke={hairline} strokeWidth="2.5" />
      <circle cx="220" cy="562" r="9" fill="#68716B" />
      <circle cx="670" cy="562" r="9" fill={green} />
      <circle cx="1120" cy="562" r="12" fill={amber} />
      <circle cx="1570" cy="562" r="9" fill={violet} />

      {/* Withdraw return arc */}
      <path className="cx-draw" pathLength="1200" d="M 1570 624 C 1360 718, 880 718, 670 624" stroke={green} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M 686 620 L 668 623 L 679 638" stroke={green} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>

    <At style={{ left: 92, top: 344, width: 360 }}>
      <p className="cuex-display" style={{ fontSize: 34, color: muted }}>L0</p>
      <h3 style={{ fontSize: 42, fontWeight: 600, marginTop: 6 }}>安静陪听</h3>
      <p className="cuex-sans" style={{ fontSize: 24, color: muted, marginTop: 14 }}>顺畅发挥时零弹窗</p>
    </At>

    <At style={{ left: 542, top: 344, width: 360 }}>
      <p className="cuex-display" style={{ fontSize: 34, color: green }}>L1</p>
      <h3 style={{ fontSize: 42, fontWeight: 600, color: green, marginTop: 6 }}>边缘微光</h3>
      <p className="cuex-sans" style={{ fontSize: 24, color: muted, marginTop: 14 }}>超时或偏题，余光轻提醒</p>
    </At>

    <At style={{ left: 992, top: 336, width: 390 }}>
      <p className="cuex-display" style={{ fontSize: 36, color: amber }}>L2 · 优先触发</p>
      <h3 style={{ fontSize: 46, fontWeight: 650, color: amber, marginTop: 4 }}>两三字弱提示</h3>
      <p className="cuex-sans" style={{ fontSize: 25, color: ink, marginTop: 14 }}>递出关键词，瞬间点醒思路</p>
    </At>

    <At style={{ left: 1442, top: 344, width: 390 }}>
      <p className="cuex-display" style={{ fontSize: 34, color: violet }}>L3</p>
      <h3 style={{ fontSize: 42, fontWeight: 600, color: violet, marginTop: 6 }}>要点短支架</h3>
      <p className="cuex-sans" style={{ fontSize: 24, color: muted, marginTop: 14 }}>持续卡壳，再给切入角度与数据</p>
    </At>

    {/* Withdraw Label */}
    <At className="cuex-sans" style={{ left: 820, top: 726, width: 600, textAlign: 'center', fontSize: 27, color: green, fontWeight: 600 }}>
      一旦自己开口接上，未用提示立即自动撤回
    </At>

    {/* Bottom Left: Live Demo Entry + Bottom Right: Human Redlines */}
    <At style={{ left: 92, bottom: 78, display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg aria-label="进入现场产品演示" viewBox="0 0 64 64" style={{ width: 62, height: 62 }}>
        <circle cx="32" cy="32" r="29" fill="none" stroke={amber} strokeWidth="2" />
        <path d="M26 20 45 32 26 44Z" fill={amber} />
      </svg>
      <span style={{ fontSize: 34, color: amber, fontWeight: 550 }}>接下来：75 秒现场实机演示</span>
    </At>

    <At className="cuex-sans" style={{ right: 88, bottom: 88, fontSize: 23, color: muted, textAlign: 'right' }}>
      人机边界：关键事实战前本人锁定　·　台上一键静音接管　·　复盘人工确认入库
    </At>
  </Canvas16x9>
);

/* ============================================================================
 * P4: 并行机制（真实 WebGL 双通路粒子流）— 表面极简安静，背后并行准备。
 * ========================================================================== */
function StreamsFallback16x9() {
  return (
    <svg aria-label="快慢双通路与输出复核门静态路径" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }}>
      <path d="M96 580 H410" stroke="#536152" strokeWidth="2.5" strokeDasharray="2 9" fill="none" />
      <path d="M410 580 C650 320 1030 320 1290 580" stroke={amber} strokeWidth="3.5" strokeDasharray="2 9" fill="none" />
      <path d="M410 580 C650 830 1030 830 1290 580" stroke={violet} strokeWidth="3.5" strokeDasharray="2 9" fill="none" />
      <ellipse cx="1290" cy="580" rx="52" ry="86" fill="none" stroke="#4B6653" strokeWidth="2" />
      <path d="M1342 580 H1810" stroke="#536152" strokeWidth="2.5" strokeDasharray="2 9" fill="none" />
    </svg>
  );
}

function ThreeStreams16x9() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animate = useIsActivePage();
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let healthy = true;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const scene = new THREE.Scene();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const print = window.matchMedia('print');
    let freezeNow = () => {};
    const geometry = <T extends THREE.BufferGeometry>(g: T): T => { geometries.add(g); return g; };
    const material = <T extends THREE.Material>(m: T): T => { materials.add(m); return m; };
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const fract = (v: number) => v - Math.floor(v);
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    const point = (x: number, y: number, z = 0) => new THREE.Vector3(x - 960, 540 - y, z);
    const fail = (reason?: unknown) => {
      healthy = false;
      cancelAnimationFrame(raf);
      canvas.dataset.error3d = reason instanceof Error ? reason.message : String(reason ?? 'WebGL failed');
      if (!disposed) setStatus('fallback');
    };
    const lost = (event: Event) => { event.preventDefault(); fail('WebGL context lost'); };
    canvas.addEventListener('webglcontextlost', lost);
    setStatus('loading');

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(2);
      renderer.setSize(1920, 1080, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;

      const fov = 32;
      const camera = new THREE.PerspectiveCamera(fov, 1920 / 1080, 1, 4000);
      const pigment = (hex: number) => new THREE.Color(hex).toArray();
      const inkCol = pigment(0x304939);
      const gold = pigment(0xa3481c);
      const lilac = pigment(0x5c4292);
      const mint = pigment(0x2d6e4e);
      const rng = (seed: number) => () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const table = (n: number, seed: number) => { const r = rng(seed); return Float32Array.from({ length: n * 4 }, () => r()); };
      const curves = {
        fast: new THREE.CatmullRomCurve3([point(380, 585), point(600, 395, 28), point(850, 360), point(1090, 405, -28), point(1268, 585)], false, 'centripetal'),
        slow: new THREE.CatmullRomCurve3([point(380, 585), point(600, 765, -28), point(850, 800), point(1090, 765, 28), point(1268, 585)], false, 'centripetal'),
      };
      const lookup = (curve: THREE.Curve<THREE.Vector3>) => {
        const lut = new Float32Array(600 * 3);
        for (let i = 0; i < 600; i++) curve.getPointAt(i / 599).toArray(lut, i * 3);
        return lut;
      };
      const fastLut = lookup(curves.fast);
      const slowLut = lookup(curves.slow);
      const sample = (lut: Float32Array, u: number, out: THREE.Vector3) => {
        const f = clamp(u) * 599;
        const i = Math.floor(f);
        const j = Math.min(599, i + 1);
        const t = f - i;
        return out.set(mix(lut[i * 3], lut[j * 3], t), mix(lut[i * 3 + 1], lut[j * 3 + 1], t), mix(lut[i * 3 + 2], lut[j * 3 + 2], t));
      };
      const pointsMaterial = material(new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: { uScale: { value: 1080 * 2 / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2))) } },
        vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
          uniform float uScale; varying float vAlpha; varying vec3 vColor;
          void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=aSize*uScale/max(1.0,-mv.z);gl_Position=projectionMatrix*mv;vAlpha=aAlpha;vColor=aColor;}`,
        fragmentShader: `varying float vAlpha; varying vec3 vColor;
          void main(){float d=length(gl_PointCoord-.5)*2.0;float a=pow(clamp(1.0-d,0.0,1.0),1.05)*vAlpha;
          if(a<.003)discard;gl_FragColor=vec4(vColor,a);
          #include <colorspace_fragment>
          }`,
      }));
      const cloud = (count: number, seed: number) => {
        const g = geometry(new THREE.BufferGeometry());
        const b = { position: new Float32Array(count * 3), aColor: new Float32Array(count * 3), aSize: new Float32Array(count), aAlpha: new Float32Array(count) };
        for (const [name, array] of Object.entries(b)) g.setAttribute(name, new THREE.BufferAttribute(array, name === 'position' || name === 'aColor' ? 3 : 1).setUsage(THREE.DynamicDrawUsage));
        const mesh = new THREE.Points(g, pointsMaterial);
        mesh.frustumCulled = false;
        scene.add(mesh);
        return { g, b, count, random: table(count, seed) };
      };
      type Cloud = ReturnType<typeof cloud>;
      const input = cloud(420, 11);
      const fast = cloud(320 * 3, 21);
      const slow = cloud(560, 31);
      const output = cloud(340, 41);
      const burst = cloud(200, 51);
      const fastRandom = table(320, 22);
      const put = (c: Cloud, i: number, p: THREE.Vector3, color: number[], size: number, alpha: number) => {
        c.b.position.set([p.x, p.y, p.z], i * 3);
        c.b.aColor.set(color, i * 3);
        c.b.aSize[i] = size;
        c.b.aAlpha[i] = alpha;
      };
      const commit = (c: Cloud) => { for (const attr of Object.values(c.g.attributes)) attr.needsUpdate = true; };

      const core = new THREE.Group();
      core.position.copy(point(850, 800));
      const coreInner = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(38, 1)), material(new THREE.MeshBasicMaterial({ color: 0x5c4292, wireframe: true, transparent: true, opacity: 0.72, depthWrite: false })));
      const coreOuter = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(62, 0)), material(new THREE.MeshBasicMaterial({ color: 0x5c4292, wireframe: true, transparent: true, opacity: 0.42, depthWrite: false })));
      core.add(coreInner, coreOuter);
      scene.add(core);

      const gate = new THREE.Group();
      gate.position.copy(point(1302, 585));
      gate.rotation.y = Math.PI / 2 - 0.75;
      const gateInk = material(new THREE.MeshBasicMaterial({ color: 0x4b6653, transparent: true, opacity: 0.72, side: THREE.DoubleSide }));
      const gateRing = new THREE.Mesh(geometry(new THREE.TorusGeometry(88, 1.8, 8, 160)), gateInk);
      gate.add(gateRing);
      const ticks = new THREE.Group();
      const tickGeo = geometry(new THREE.PlaneGeometry(9, 1.5));
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const tick = new THREE.Mesh(tickGeo, gateInk);
        tick.position.set(Math.cos(a) * 112, Math.sin(a) * 112, 0);
        tick.rotation.z = a;
        ticks.add(tick);
      }
      gate.add(ticks);
      scene.add(gate);

      const p = new THREE.Vector3();
      const stop = sample(slowLut, 0.82, new THREE.Vector3());
      const draw = (time: number) => {
        camera.position.set(0, 0, 1900);
        camera.lookAt(0, 0, 0);
        for (let i = 0; i < input.count; i++) {
          const r = input.random;
          const a = r[i * 4], b = r[i * 4 + 1], c = r[i * 4 + 2], d = r[i * 4 + 3];
          const u = fract(a + time * 0.18);
          const x = 88 + u * 292;
          const y = 585 + Math.sin(x * 0.035 - time * 4.5) * 11 + (b - 0.5) * 5;
          put(input, i, point(x, y, (c - 0.5) * 26), inkCol, 3.6 + d * 2.8, 0.8 * clamp(u / 0.12));
        }
        for (let i = 0; i < 320; i++) {
          const a = fastRandom[i * 4], b = fastRandom[i * 4 + 1], c = fastRandom[i * 4 + 2];
          for (let k = 0; k < 3; k++) {
            const u = fract(a + time * 0.4) - k * 0.004;
            sample(fastLut, u, p);
            p.y += (b - 0.5) * 7;
            p.z += (c - 0.5) * 14;
            put(fast, i * 3 + k, p, gold, (4.0 + c * 3.2) * (1 - k * 0.2), 0.9 * (1 - k * 0.25) * clamp(u / 0.05) * clamp((1 - u) / 0.05));
          }
        }
        for (let i = 0; i < slow.count; i++) {
          const r = slow.random;
          const a = r[i * 4], b = r[i * 4 + 1], c = r[i * 4 + 2];
          const u = fract(a + time * 0.13);
          sample(slowLut, u, p);
          const radius = 58 * Math.exp(-Math.pow((u - 0.5) / 0.17, 2)) * (0.4 + b * 0.6);
          const angle = b * 40 + time * 1.3 * (c > 0.5 ? 1 : -1);
          p.y += Math.cos(angle) * radius;
          p.z += Math.sin(angle) * radius;
          put(slow, i, p, lilac, 4.0 + c * 3.5, 0.88 * clamp(u / 0.05) * clamp((1 - u) / 0.05));
        }
        for (let i = 0; i < output.count; i++) {
          const r = output.random;
          const a = r[i * 4], b = r[i * 4 + 1], c = r[i * 4 + 2];
          const u = fract(a + time * 0.21);
          const x = 1302 + u * 520;
          put(output, i, point(x, 585 + Math.sin(x * 0.03 - time * 4) * 5 + (b - 0.5) * 4, (c - 0.5) * 20), inkCol, 3.6 + c * 3.0, 0.76 * clamp(u / 0.05));
        }
        for (let i = 0; i < burst.count; i++) {
          const r = burst.random;
          const a = r[i * 4], b = r[i * 4 + 1], c = r[i * 4 + 2], d = r[i * 4 + 3];
          const th = a * Math.PI * 2;
          const dist = 12 + c * 36;
          p.copy(stop).add(new THREE.Vector3(Math.cos(th) * dist, Math.sin(th) * dist * 0.6, (b - 0.5) * 24));
          put(burst, i, p, mint, 3.4 + d * 2.6, 0.32);
        }
        coreInner.rotation.set(time * 0.3, time * 0.48, 0);
        coreOuter.rotation.set(-time * 0.22, -time * 0.34, 0.4);
        ticks.rotation.z = time * 0.28;
        for (const c of [input, fast, slow, output, burst]) commit(c);
        renderer!.render(scene, camera);
        canvas.dataset['3dReady'] = 'true';
      };

      const shouldFreeze = () => !animate || reduce.matches || print.matches || Boolean(canvas.closest('[data-osd-freeze-motion]'));
      freezeNow = () => { cancelAnimationFrame(raf); if (!disposed) { try { draw(10); } catch (e) { fail(e); } } };
      const began = performance.now();
      const tick = (now: number) => {
        if (disposed) return;
        if (shouldFreeze()) { freezeNow(); return; }
        const time = Math.max(0, Math.min(12, (now - began) / 1000));
        try { draw(time); } catch (e) { fail(e); return; }
        if (time < 12) raf = requestAnimationFrame(tick);
      };
      if (shouldFreeze()) freezeNow();
      else { draw(0); raf = requestAnimationFrame(tick); }
      if (healthy) setStatus('ready');
    } catch (e) { fail(e); }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', lost);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer?.renderLists.dispose();
      renderer?.dispose();
      scene.clear();
    };
  }, [animate]);

  return (
    <div data-3d-scene style={{ position: 'absolute', inset: 0, width: 1920, height: 1080, pointerEvents: 'none', zIndex: 0 }}>
      <div data-3d-fallback data-3d-ready={status === 'fallback' ? 'true' : undefined} style={{ display: status === 'ready' ? 'none' : 'block' }}>
        <StreamsFallback16x9 />
      </div>
      <canvas
        ref={canvasRef}
        data-3d-ready={status === 'ready' ? 'true' : undefined}
        style={{ position: 'absolute', inset: 0, width: 1920, height: 1080, display: status === 'ready' ? 'block' : 'none' }}
      />
    </div>
  );
}

const P4Mechanism: Page = () => (
  <Canvas16x9 name="two-streams">
    <SmallMark />
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 76, fontWeight: 550, lineHeight: 1.18, zIndex: 2 }}>
      表面极简安静，背后并行准备。
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 196, fontSize: 27, color: muted, zIndex: 2 }}>
      Focus 视图给主讲人留白；展开 Underlying 视图，看见系统每一次等待与撤回。
    </At>

    <ThreeStreams16x9 />

    <At style={{ left: 92, top: 518, fontSize: 32, zIndex: 2 }}>台上表达</At>

    <At style={{ left: 670, top: 430, width: 360, textAlign: 'center', fontSize: 32, lineHeight: 1.38, zIndex: 2 }}>
      <span style={{ color: amber }}>System 1</span><br />
      高频跟进状态
    </At>

    <At style={{ left: 670, top: 615, width: 360, textAlign: 'center', fontSize: 32, lineHeight: 1.38, zIndex: 2 }}>
      <span style={{ color: violet }}>System 2</span><br />
      战前编译 + 盲区备货
    </At>

    <At style={{ left: 1142, top: 348, width: 320, textAlign: 'center', fontSize: 30, lineHeight: 1.38, zIndex: 2 }}>
      <span className="cuex-sans" style={{ fontSize: 23, color: muted }}>Controller</span><br />
      输出前复核
    </At>

    <At style={{ left: 1418, top: 626, fontSize: 30, zIndex: 2 }}>保持安静</At>
    <At style={{ left: 1598, top: 626, fontSize: 30, color: amber, zIndex: 2 }}>递短词</At>
    <At style={{ left: 1742, top: 626, fontSize: 30, color: green, zIndex: 2 }}>撤回</At>

    <At style={{ left: 1418, top: 760, fontSize: 38, color: sage, zIndex: 2 }}>
      备好候选 ≠ 弹出打扰
    </At>
  </Canvas16x9>
);

/* ============================================================================
 * P5: 商业模式 — 为关键上台付费，因个人记忆留存。
 * ========================================================================== */
const P5BusinessModel: Page = () => (
  <Canvas16x9 name="business-model">
    <SmallMark />
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 76, fontWeight: 550, lineHeight: 1.18 }}>
      为关键上台付费，因个人记忆留存。
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 196, fontSize: 27, color: muted }}>
      OPC 商业模式（待验证商业计划）：切入高价值演讲破冰获客，靠专属知识库复利持续订阅
    </At>

    <svg aria-hidden viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }}>
      <line x1="92" y1="590" x2="1828" y2="590" stroke={hairline} strokeWidth="1.5" />
      <path className="cx-draw" pathLength="1200" d="M 510 742 H 720 M 1245 742 H 1365" stroke="#8C9A86" strokeWidth="2.5" fill="none" />
      <path d="M 706 734 L 722 742 L 706 750 M 1351 734 L 1367 742 L 1351 750" stroke="#8C9A86" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>

    {/* Upper Row: Target Customer / Acquisition / Retention Wall */}
    <At style={{ left: 92, top: 312, width: 520 }}>
      <p className="cuex-sans" style={{ fontSize: 23, color: muted }}>核心首发客群</p>
      <p style={{ marginTop: 14, fontSize: 42, color: sage, fontWeight: 600 }}>创业路演 · 硕博答辩</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 25, color: muted }}>
        一次关键表达输不起的超级个体与专业汇报者
      </p>
    </At>

    <At style={{ left: 696, top: 312, width: 560 }}>
      <p className="cuex-sans" style={{ fontSize: 23, color: muted }}>获客切口</p>
      <p style={{ marginTop: 14, fontSize: 42, color: ink, fontWeight: 600 }}>承接 PPT 工具下游</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 25, color: muted, whiteSpace: 'nowrap' }}>
        “AI 写完了稿，CueX 陪你上台讲赢” · 赛事自传播
      </p>
    </At>

    <At style={{ left: 1336, top: 312, width: 500 }}>
      <p className="cuex-sans" style={{ fontSize: 23, color: muted }}>长期留存壁垒</p>
      <p style={{ marginTop: 14, fontSize: 42, color: violet, fontWeight: 600 }}>彩排当教练，上台当保险</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 25, color: muted }}>
        每次新路演沉淀专属项目记忆库，越用越懂你
      </p>
    </At>

    {/* Lower Row: Clear Subscription Tiers */}
    <At className="cuex-sans" style={{ left: 92, top: 642, fontSize: 23, color: muted }}>
      订阅制定价假设（完整 8 要素画布见附件）
    </At>

    <At style={{ left: 92, top: 716, width: 410 }}>
      <p style={{ fontSize: 40, color: '#4E5851', fontWeight: 600 }}>免费体验　¥0</p>
      <p className="cuex-sans" style={{ marginTop: 12, fontSize: 24, color: muted }}>每月 2 场导播单 · 校园与赛事裂变</p>
    </At>

    <At style={{ left: 752, top: 716, width: 480 }}>
      <p style={{ fontSize: 42, color: amber, fontWeight: 650, whiteSpace: 'nowrap' }}>个人 / OPC　¥59 / 月</p>
      <p className="cuex-sans" style={{ marginTop: 12, fontSize: 24, color: ink, whiteSpace: 'nowrap' }}>无限编译 · 四级实时提示 · 专属知识库</p>
    </At>

    <At style={{ left: 1390, top: 716, width: 450 }}>
      <p style={{ fontSize: 40, color: violet, fontWeight: 600, whiteSpace: 'nowrap' }}>团队与孵化器　¥199 / 席</p>
      <p className="cuex-sans" style={{ marginTop: 12, fontSize: 24, color: muted, whiteSpace: 'nowrap' }}>共享问答弹药库 · 机构路演演练看板</p>
    </At>
  </Canvas16x9>
);

/* ============================================================================
 * P6: 单位经济账单 — 把慢思考留在台下，单场算力只要一毛二。
 * ========================================================================== */
const P6UnitEconomics: Page = () => (
  <Canvas16x9 name="unit-economics">
    <SmallMark />
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 74, fontWeight: 550, lineHeight: 1.18 }}>
      把慢思考留在台下，单场算力只要一毛二。
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 196, fontSize: 27, color: muted }}>
      演讲是有准备的实时任务：上台前编译一次，台上 90% 时间零大模型消耗。
    </At>

    {/* Left: Clean Visual Cost Contrast + 3 Key ROI Numbers */}
    <At style={{ left: 92, top: 320, width: 1020 }}>
      {/* Bar 1 */}
      <div>
        <div className="cuex-sans" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 25, color: muted, marginBottom: 14 }}>
          <span>普通实时语音 AI（每秒重算长上下文）</span>
          <span style={{ color: amber, fontWeight: 600 }}>~150 万 Tokens　≈ ¥8 – ¥20 / 场</span>
        </div>
        <div style={{ height: 24, width: '100%', background: '#D46B3E' }} />
      </div>

      {/* Bar 2 */}
      <div style={{ marginTop: 48 }}>
        <div className="cuex-sans" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: ink, fontWeight: 600, marginBottom: 14 }}>
          <span>CueX 前置编译 + 轻量跟进（15 分钟演讲与问答）</span>
          <span style={{ color: green }}>~1.1 万 Tokens　≈ ¥0.12 / 场</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ height: 24, width: 18, background: green }} />
          <span className="cuex-sans" style={{ fontSize: 23, color: green }}>省去约 99% 冗余实时 Token，彻底告别“用户越活跃越亏损”</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1.5, background: hairline, margin: '56px 0 42px 0' }} />

      {/* 3 Big Clear ROI Metrics */}
      <p className="cuex-sans" style={{ fontSize: 23, color: muted, marginBottom: 24 }}>
        单订户月度单位经济测算（按个人订阅 ¥59 / 月、重度用户月用 20 场测算）
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
        <div>
          <p className="cuex-display" style={{ fontSize: 64, lineHeight: 1, color: ink }}>¥2.40</p>
          <p className="cuex-sans" style={{ marginTop: 12, fontSize: 24, color: muted }}>月均算力成本</p>
        </div>
        <div>
          <p className="cuex-display" style={{ fontSize: 64, lineHeight: 1, color: green }}>95.9%</p>
          <p className="cuex-sans" style={{ marginTop: 12, fontSize: 24, color: green, fontWeight: 600 }}>订阅算力毛利率</p>
        </div>
        <div>
          <p className="cuex-display" style={{ fontSize: 64, lineHeight: 1, color: amber }}>24.5×</p>
          <p className="cuex-sans" style={{ marginTop: 12, fontSize: 24, color: muted }}>Token 营收产投比</p>
        </div>
      </div>
    </At>

    {/* Right: Clean Official Token Consumption Proof Frame */}
    <At style={{ right: 88, top: 312, width: 640, height: 640, display: 'flex', flexDirection: 'column' }}>
      <p className="cuex-sans" style={{ fontSize: 24, color: sage, fontWeight: 600, marginBottom: 16 }}>
        赛事算力平台真实消耗证明
      </p>
      <div
        data-token-proof-slot="true"
        style={{
          flex: 1,
          background: '#F5F6F0',
          border: `1.5px dashed #B8BFAEE0`,
          padding: 36,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 30, color: ink, fontWeight: 600 }}>官方算力后台 Token 消耗截图位</p>
        <p className="cuex-sans" style={{ marginTop: 18, fontSize: 21, lineHeight: 1.6, color: muted, maxWidth: 480 }}>
          封版前放入 OpenDev / BJMoMA 控制台截图（保存至 assets/hks/token-usage-proof.png 后一键自动嵌入）
        </p>
        <p className="cuex-sans" style={{ marginTop: 32, fontSize: 20, color: sage }}>
          覆盖：导播单预编译 · 突发追问兜底 · 赛中联调复盘
        </p>
      </div>
    </At>
  </Canvas16x9>
);

/* ============================================================================
 * P7: 未来商业畅想（真实 WebGL 四端体积粒子 X）— 从演讲起步，走向每一个快思考现场。
 * ========================================================================== */
function VisionParticles16x9() {
  const ref = useRef<HTMLCanvasElement>(null);
  const active = useIsActivePage();
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer | undefined;
    let disposed = false;
    let healthy = true;
    let raf = 0;
    const scene = new THREE.Scene();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const print = window.matchMedia('print');
    const geometry = <T extends THREE.BufferGeometry>(g: T): T => { geometries.add(g); return g; };
    const material = <T extends THREE.Material>(m: T): T => { materials.add(m); return m; };
    const pt = (x: number, y: number, z = 0) => new THREE.Vector3(x - 960, 540 - y, z);
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const fract = (v: number) => v - Math.floor(v);
    const fail = (reason?: unknown) => {
      healthy = false;
      cancelAnimationFrame(raf);
      canvas.dataset.error3d = reason instanceof Error ? reason.message : String(reason ?? 'WebGL unavailable');
      if (!disposed) setStatus('fallback');
    };
    const lost = (event: Event) => { event.preventDefault(); fail('WebGL context lost'); };
    let freeze = () => {};
    canvas.addEventListener('webglcontextlost', lost);
    setStatus('loading');

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(2);
      renderer.setSize(1920, 1080, false);
      renderer.setClearColor(0, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;

      const camera = new THREE.PerspectiveCamera(32, 1920 / 1080, 1, 4000);
      const gold = new THREE.Color(0xa3481c).toArray();
      const purple = new THREE.Color(0x5c4292).toArray();
      let seed = 1527;
      const rand = () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const count = 340 * 2 * 4 + 480;
      const g = geometry(new THREE.BufferGeometry());
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const alphas = new Float32Array(count);
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      g.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
      const random = Float32Array.from({ length: count * 4 }, () => rand());

      const shader = material(new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: { uScale: { value: 1080 * 2 / (2 * Math.tan(THREE.MathUtils.degToRad(16))) } },
        vertexShader: `attribute vec3 aColor;attribute float aSize;attribute float aAlpha;uniform float uScale;varying vec3 vColor;varying float vAlpha;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=aSize*uScale/max(1.,-mv.z);vColor=aColor;vAlpha=aAlpha;}`,
        fragmentShader: `varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;float a=pow(clamp(1.-d,0.,1.),1.05)*vAlpha;if(a<.003)discard;gl_FragColor=vec4(vColor,a);\n#include <colorspace_fragment>\n}`,
      }));
      const cloud = new THREE.Points(g, shader);
      cloud.frustumCulled = false;
      scene.add(cloud);

      const paths = [
        new THREE.CatmullRomCurve3([pt(825, 435), pt(735, 360, 32), pt(635, 395, -24), pt(535, 415)], false, 'centripetal'),
        new THREE.CatmullRomCurve3([pt(1095, 410), pt(1185, 350, -30), pt(1285, 395, 28), pt(1385, 415)], false, 'centripetal'),
        new THREE.CatmullRomCurve3([pt(815, 755), pt(730, 815, 28), pt(635, 765, -28), pt(535, 755)], false, 'centripetal'),
        new THREE.CatmullRomCurve3([pt(1100, 760), pt(1190, 820, -28), pt(1285, 765, 30), pt(1385, 755)], false, 'centripetal'),
      ];
      const luts = paths.map((curve) => {
        const data = new Float32Array(400 * 6);
        for (let i = 0; i < 400; i++) {
          curve.getPointAt(i / 399).toArray(data, i * 6);
          curve.getTangentAt(i / 399).toArray(data, i * 6 + 3);
        }
        return data;
      });
      const sample = (arm: number, u: number, position: THREE.Vector3, tangent: THREE.Vector3) => {
        const f = clamp(u) * 399;
        const i = Math.floor(f);
        const j = Math.min(399, i + 1);
        const t = f - i;
        const lut = luts[arm];
        position.set(lut[i * 6] + (lut[j * 6] - lut[i * 6]) * t, lut[i * 6 + 1] + (lut[j * 6 + 1] - lut[i * 6 + 1]) * t, lut[i * 6 + 2] + (lut[j * 6 + 2] - lut[i * 6 + 2]) * t);
        tangent.set(lut[i * 6 + 3] + (lut[j * 6 + 3] - lut[i * 6 + 3]) * t, lut[i * 6 + 4] + (lut[j * 6 + 4] - lut[i * 6 + 4]) * t, 0).normalize();
      };
      const inner = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(52, 1)), material(new THREE.MeshBasicMaterial({ color: 0x66519f, wireframe: true, transparent: true, opacity: 0.2, depthWrite: false })));
      const outer = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(82, 0)), material(new THREE.MeshBasicMaterial({ color: 0x66519f, wireframe: true, transparent: true, opacity: 0.13, depthWrite: false })));
      inner.position.copy(pt(960, 595, -16));
      outer.position.copy(inner.position);
      scene.add(inner, outer);

      const p0 = new THREE.Vector3();
      const tangent = new THREE.Vector3();
      const crossStart = [pt(825, 435, 3), pt(815, 755, -3)];
      const crossEnd = [pt(1100, 760, -3), pt(1095, 410, 3)];
      const draw = (time: number) => {
        camera.position.set(0, 0, 1880);
        camera.lookAt(0, 0, 0);
        for (let arm = 0; arm < 4; arm++) {
          const amberArm = arm === 0 || arm === 3;
          const color = amberArm ? gold : purple;
          const speed = arm === 1 ? 0.2 : amberArm ? 0.15 : 0.12;
          for (let i = 0; i < 340; i++) {
            const base = (arm * 680 + i * 2) * 4;
            const a = random[base], b = random[base + 1], d = random[base + 3];
            for (let trail = 0; trail < 2; trail++) {
              const index = arm * 680 + i * 2 + trail;
              const u = fract(a + time * speed) - trail * 0.009;
              sample(arm, u, p0, tangent);
              const radius = (13 + 12 * Math.sin(Math.PI * clamp(u))) * (0.35 + b * 0.65);
              const angle = b * 35 + time * (amberArm ? 0.8 : -0.65);
              p0.x += tangent.y * Math.cos(angle) * radius;
              p0.y -= tangent.x * Math.cos(angle) * radius;
              p0.z += Math.sin(angle) * radius * 1.5;
              positions.set([p0.x, p0.y, p0.z], index * 3);
              colors.set(color, index * 3);
              sizes[index] = (3.8 + d * 3.2) * (1 - trail * 0.25);
              alphas[index] = (arm === 1 ? 0.94 : 0.78) * (1 - trail * 0.3) * clamp(u / 0.05) * clamp((1 - u) / 0.06);
            }
          }
        }
        for (let i = 0; i < 480; i++) {
          const index = 2720 + i;
          const lane = i < 240 ? 0 : 1;
          const r = index * 4;
          const a = random[r], b = random[r + 1], c = random[r + 2], d = random[r + 3];
          const u = fract(a + time * 0.08);
          p0.copy(crossStart[lane]).lerp(crossEnd[lane], u);
          const spread = (b - 0.5) * 34;
          p0.x += spread;
          p0.y += (lane === 0 ? -1 : 1) * spread;
          p0.z += (c - 0.5) * 48;
          positions.set([p0.x, p0.y, p0.z], index * 3);
          colors.set(lane === 0 ? gold : purple, index * 3);
          sizes[index] = 3.5 + d * 3.0;
          alphas[index] = 0.45 * clamp(u / 0.08) * clamp((1 - u) / 0.08);
        }
        inner.rotation.set(time * 0.23, time * 0.32, 0.2);
        outer.rotation.set(-time * 0.17, time * 0.22, -0.1);
        for (const attribute of Object.values(g.attributes)) attribute.needsUpdate = true;
        renderer!.render(scene, camera);
        canvas.dataset['3dReady'] = 'true';
      };

      const isFrozen = () => !active || reduce.matches || print.matches || Boolean(canvas.closest('[data-osd-freeze-motion]'));
      freeze = () => { cancelAnimationFrame(raf); if (!disposed) { try { draw(10); } catch (e) { fail(e); } } };
      const began = performance.now();
      const tick = (now: number) => {
        if (disposed) return;
        if (isFrozen()) { freeze(); return; }
        const time = Math.max(0, Math.min(12, (now - began) / 1000));
        try { draw(time); } catch (e) { fail(e); return; }
        if (time < 12) raf = requestAnimationFrame(tick);
      };
      if (isFrozen()) freeze();
      else { draw(0); raf = requestAnimationFrame(tick); }
      if (healthy) setStatus('ready');
    } catch (e) { fail(e); }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', lost);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer?.renderLists.dispose();
      renderer?.dispose();
      scene.clear();
    };
  }, [active]);

  return (
    <div data-vision-3d style={{ position: 'absolute', inset: 0, width: 1920, height: 1080, pointerEvents: 'none', zIndex: 0 }}>
      <svg data-3d-ready={status === 'fallback' ? 'true' : undefined} viewBox="0 0 1920 1080" style={{ display: status === 'ready' ? 'none' : 'block', width: 1920, height: 1080 }}>
        <path d="M825 435 C725 350 635 405 535 415 M1100 760 C1200 845 1285 765 1385 755" stroke={amber} strokeWidth="4" strokeDasharray="2 8" fill="none" />
        <path d="M1095 410 C1195 340 1285 405 1385 415 M815 755 C715 835 635 765 535 755" stroke={violet} strokeWidth="4" strokeDasharray="2 8" fill="none" />
      </svg>
      <canvas ref={ref} data-3d-ready={status === 'ready' ? 'true' : undefined} style={{ display: status === 'ready' ? 'block' : 'none', width: 1920, height: 1080 }} />
    </div>
  );
}

const P7Vision: Page = () => (
  <Canvas16x9 name="vision">
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 72, fontWeight: 550, lineHeight: 1.18, zIndex: 2 }}>
      从演讲起步，走向每一个快思考现场。
    </At>

    <At className="cuex-sans" style={{ right: 88, top: 86, textAlign: 'right', zIndex: 2 }}>
      <p style={{ fontSize: 22, color: muted }}>长期飞轮</p>
      <p style={{ marginTop: 8, fontSize: 26, color: sage }}>沉淀真实点醒轨迹 → 训练端侧快思考小模型</p>
    </At>

    <VisionParticles16x9 />

    <At style={{ left: 660, top: 295, width: 600, height: 600, zIndex: 1, pointerEvents: 'none' }}>
      <img className="cx-x" src={dimensionalX} alt="四个端点向外连接的 CueX 立体 X" style={{ width: 600, height: 600, filter: 'drop-shadow(14px 22px 14px #39463722)' }} />
    </At>

    {/* Four Clean Open Endpoints (exact deck-131 P5 spirit) */}
    <At style={{ left: 100, top: 360, width: 400, textAlign: 'right', zIndex: 2 }}>
      <p style={{ fontSize: 52, lineHeight: 1.2 }}>面试与社交</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 28, color: muted }}>高压追问破冰</p>
    </At>

    <At style={{ left: 1420, top: 360, width: 420, zIndex: 2 }}>
      <p style={{ fontSize: 54, lineHeight: 1.2, fontWeight: 650, color: amber }}>演讲与答辩</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 30, fontWeight: 600, color: amber }}>当前聚焦起步</p>
    </At>

    <At style={{ left: 100, top: 700, width: 400, textAlign: 'right', zIndex: 2 }}>
      <p style={{ fontSize: 52, lineHeight: 1.2 }}>讲课与教学</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 28, color: muted }}>课堂节奏控场</p>
    </At>

    <At style={{ left: 1420, top: 700, width: 420, zIndex: 2 }}>
      <p style={{ fontSize: 52, lineHeight: 1.2 }}>顾问式销售</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 28, color: muted }}>方案讲解与异议</p>
    </At>

    <At className="cuex-sans" style={{ left: 92, bottom: 68, fontSize: 24, color: muted, zIndex: 2 }}>
      X，代表任意需要快思考的场景
    </At>
  </Canvas16x9>
);

/* ============================================================================
 * P8: 合规披露与团队 — 延续双流底座，48 小时重做产品与商业。
 * ========================================================================== */
const P8Compliance: Page = () => (
  <Canvas16x9 name="compliance">
    <SmallMark />
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 74, fontWeight: 550, lineHeight: 1.18 }}>
      延续双流底座，48 小时重做产品与商业。
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 196, fontSize: 27, color: muted }}>
      主动透明切分赛前基础与本次怀客松赛中全新成果
    </At>

    <svg aria-hidden viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }}>
      <line x1="836" y1="316" x2="836" y2="856" stroke={hairline} strokeWidth="1.5" />
    </svg>

    {/* Left: Pre-existing */}
    <At style={{ left: 92, top: 320, width: 680 }}>
      <p className="cuex-sans" style={{ fontSize: 24, color: muted }}>赛前已有基础（11.01 早期原型基线）</p>
      <div className="cuex-sans" style={{ marginTop: 34, display: 'grid', gap: 36, fontSize: 28, lineHeight: 1.55, color: '#4E5851' }}>
        <p>
          <strong style={{ color: ink }}>医药代表模拟对练原型</strong><br />
          AI 扮演对面虚拟医生提问，仅绑定单一虚构药品资料
        </p>
        <p>
          <strong style={{ color: ink }}>基础实时语音与灯效组件</strong><br />
          浏览器语音流通道、屏幕边缘光效与双流概念探索
        </p>
      </div>
    </At>

    {/* Right: New in 48h */}
    <At style={{ left: 912, top: 320, width: 920 }}>
      <p className="cuex-sans" style={{ fontSize: 24, color: green, fontWeight: 600 }}>怀客松 48 小时赛中全新完成</p>
      <div className="cuex-sans" style={{ marginTop: 34, display: 'grid', gap: 28, fontSize: 28, lineHeight: 1.5, color: ink }}>
        <p>
          <strong style={{ color: amber }}>1. 角色彻底反转</strong>：从“对面考官”重做为<strong>主讲人身后的 AI 演讲引导员工</strong>
        </p>
        <p>
          <strong style={{ color: violet }}>2. 通用讲稿预编译与四级渐进引导</strong>：任意讲稿生成导播单，弱提示优先、开口自动撤回
        </p>
        <p>
          <strong style={{ color: green }}>3. 双视角界面与证据复盘</strong>：Focus 极简护航 + Underlying 决策透视与 Token 计量
        </p>
        <p>
          <strong style={{ color: sage }}>4. 完整 OPC 商业闭环</strong>：岗位说明书、8 要素商业画布与单位经济账单
        </p>
      </div>
    </At>

    {/* Clean Footer */}
    <At className="cuex-sans" style={{ left: 92, bottom: 72, fontSize: 26, color: ink }}>
      <strong>记性好了一点</strong>　　路皓然 / 任逸康　　<span style={{ color: muted }}>下一步：申请入驻果壳 OPC 社区与 Agent 集市开启内测</span>
    </At>
    <At style={{ right: 88, bottom: 70, fontSize: 30, color: amber }}>
      欢迎评委老师现场提问测试
    </At>
  </Canvas16x9>
);

export const transition: SlideTransition = {
  duration: 260,
  exit: { duration: 260, keyframes: [{ opacity: 1 }, { opacity: 1 }] },
  enter: {
    duration: 260,
    easing: 'cubic-bezier(0,0,.2,1)',
    keyframes: [
      { opacity: 0, transform: 'perspective(2000px) rotateY(-.35deg) translateY(6px)' },
      { opacity: 1, transform: 'perspective(2000px) rotateY(0deg) translateY(0)' },
    ],
  },
};

export const meta: SlideMeta = {
  title: 'CueX · AI 演讲与答辩临场引导师',
  createdAt: '2026-11-15T22:08:00.000Z',
};

// Natural, conversational spoken script: 3m10s slides + 1m15s live demo = 4m25s (well inside 5m00s cutoff).
export const notes: (string | undefined)[] = [
  '【P1｜25秒｜累计 0:25】各位评委老师好，我们是“记性好了一点”，路皓然和任逸康。很多人在台下准备得非常深，但一上台遇到走神，或者评委突然追问，前几秒大脑反而容易一片空白。卡尼曼在《思考，快与慢》里讲过，台上看着评委顺畅交流靠的是快思考；一旦现场强行启动慢思考，注意力瞬间就不够用了。所以这次我们带来了超级个体的第一位 AI 员工：CueX，AI 演讲与答辩临场引导师。',
  '【P2｜25秒｜累计 0:50】为什么传统提词器和普通实时 AI 帮不上忙？盯滚屏提词器会把眼神锁死在屏幕上，一到自由问答就彻底失效；而普通实时 AI 一秒弹出上百字长答案，人在台上根本来不及读，越看越乱。我们认为，AI 回答正确不代表现场有效——好的提示只给两三个关键词，余光一扫点醒你自己，把眼神留给评委。',
  '【P3｜25秒 + 75秒实机演示｜累计 2:30】这位 AI 员工分三步工作：上台前先读懂讲稿，整理出一页导播单；在台上严格按轻重四级提示——顺畅讲时绝对安静，超时给边缘微光，卡壳优先给两三字弱提示，实在接不上再给要点支架；一旦你开口接上，未用提示自动撤回。同时关键事实由本人战前锁定，杜绝编造数字。接下来 75 秒，直接看实机演示。',
  '【P4｜25秒｜累计 2:55】刚才大家看到的反差，来自背后的双通路架构。主讲人看到的 Focus 界面极度留白；而展开给评委看的 Underlying 视图里，System 1 实时跟进状态，System 2 提前备好问答，Controller 在输出前最后一刻决定继续安静、递出短词还是撤回。备好候选，绝不等于弹出打扰。',
  '【P5｜25秒｜累计 3:20】商业模式上，我们从创业路演、硕博答辩这些“输不起的关键上台”切入，承接 Kimi、Gamma 写完 PPT 后的下游刚需。定价采用订阅制假设：免费版裂变，个人与 OPC 主力档每月 59 元，团队与孵化器每席 199 元。哪怕用户演讲越来越熟练，平时彩排当教练、上台当保险，每次新路演沉淀的专属知识库都会让他持续留存。',
  '【P6｜25秒｜累计 3:45】这套架构更直接决定了健康的单位经济账单。普通实时语音 AI 每秒重算长上下文，一场十五分钟烧掉上百万 Token、成本十几块；而我们把重计算留在上台前预编译，台上九成时间本地安静陪听，单场全流程只花约 1.1 万 Token，直接算力成本一毛二左右。按 59 元月订阅、每月重度使用 20 场测算，算力毛利率超过 95%，右边是我们在赛事算力平台的真实消耗记录。',
  '【P7｜25秒｜累计 4:10】今天我们只聚焦把“演讲与答辩”这一个切口做透；而中间这个 X，代表未来一切需要快思考的现场——讲课教学、顾问销售、求职面试与社交。更重要的是，当所有大模型都在把思维链越训越长，我们在真实场景里积累“哪一个短词真正点醒了人”，未来用于训练端侧快思考小模型。',
  '【P8｜15秒｜累计 4:25】最后如实汇报赛前与赛中边界：早期版本只是虚拟医生向医药代表提问的对练原型；这次怀客松 48 小时，我们把角色彻底反转为主讲人身后的演讲引导员工，全新完成了讲稿预编译、四级渐进提示、双视角界面与全套 OPC 商业账单。谢谢各位老师，欢迎提问！',
];

export default [
  P1Cover,
  P2LessIsMore,
  P3EmployeeLoop,
  P4Mechanism,
  P5BusinessModel,
  P6UnitEconomics,
  P7Vision,
  P8Compliance,
] satisfies Page[];
