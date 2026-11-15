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
    display: 'CueXHksUDisplay, CueXHksUSerif, serif',
    body: 'CueXHksUSerif, serif',
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
@font-face{font-family:CueXHksUSerif;src:url('${serifHref}') format('truetype');font-style:normal;font-weight:200 900;font-display:block}
@font-face{font-family:CueXHksUSans;src:url('${sansHref}') format('truetype');font-style:normal;font-weight:100 900;font-display:block}
@font-face{font-family:CueXHksUDisplay;src:url('${instrumentHref}') format('truetype');font-style:normal;font-weight:400;font-display:block}

.cuex-hks-u,.cuex-hks-u *{box-sizing:border-box}
.cuex-hks-u h1,.cuex-hks-u h2,.cuex-hks-u h3,.cuex-hks-u p{margin:0}
.cuex-hks-u img,.cuex-hks-u svg,.cuex-hks-u canvas{display:block;max-width:none}
.cuex-hks-u svg{overflow:visible}
.cuex-sans{font-family:CueXHksUSans,sans-serif}
.cuex-display{font-family:CueXHksUDisplay,CueXHksUSerif,serif}

.cuex-hks-u-motion .cx-enter{animation:cx-u-enter .85s cubic-bezier(.18,.7,.2,1) both}
.cuex-hks-u-motion .cx-draw{stroke-dasharray:1200;animation:cx-u-draw 1.4s cubic-bezier(.25,.7,.2,1) .15s both}
.cuex-hks-u-motion .cx-x{animation:cx-u-x 1.6s cubic-bezier(.18,.7,.2,1) both}

@keyframes cx-u-enter{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes cx-u-draw{from{stroke-dashoffset:1200}to{stroke-dashoffset:0}}
@keyframes cx-u-x{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}

[data-osd-freeze-motion] .cuex-hks-u *,
@media print {
  .cuex-hks-u *{animation:none!important;transition:none!important}
}
@media(prefers-reduced-motion:reduce){
  .cuex-hks-u *{animation:none!important;transition:none!important}
}
`;

if (typeof document !== 'undefined') {
  const id = 'osd-styles-cuex-hks-universal';
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
        className={`cuex-wide cuex-hks-u${animate ? ' cuex-hks-u-motion' : ''}`}
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
 * P1: 封面与时代痛点 — 想得再深，现场往往只给你一秒。
 * ========================================================================== */
const P1Cover: Page = () => (
  <Canvas16x9 name="cover">
    <At style={{ left: 88, top: 76, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="cuex-display" style={{ fontSize: 118, lineHeight: 0.92 }}>Cue</span>
      <img src={symbol} alt="X" style={{ width: 96, height: 96 }} />
    </At>

    <At className="cx-enter" style={{ left: 430, top: 96, fontSize: 70, fontWeight: 550, lineHeight: 1.18 }}>
      想得再深，现场往往只给你一秒。
    </At>

    {/* Left Quiet Context */}
    <At style={{ left: 92, top: 256, fontSize: 34, color: sage, fontWeight: 500 }}>
      你的快思考外挂 · 全天候临场参谋
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 318, fontSize: 23, color: muted }}>
      灵感源自卡尼曼《思考，快与慢》
    </At>

    <At style={{ left: 92, top: 438, width: 530 }}>
      <p className="cuex-sans" style={{ fontSize: 22, color: muted, marginBottom: 10 }}>大模型擅长慢思考</p>
      <p style={{ fontSize: 32, color: ink, lineHeight: 1.4 }}>写方案、跑长推理，前提是有人等你</p>
    </At>

    <At style={{ left: 92, top: 600, width: 590 }}>
      <p className="cuex-sans" style={{ fontSize: 22, color: amber, marginBottom: 10 }}>真实交流全靠快思考</p>
      <p style={{ fontSize: 32, color: ink, lineHeight: 1.4, whiteSpace: 'nowrap' }}>看穿潜台词、调出底牌，嘴必须跟上脑子</p>
    </At>

    <At className="cuex-sans" style={{ left: 92, bottom: 74, fontSize: 24, color: muted }}>
      记性好了一点　　路皓然 / 任逸康　·　OPC 模式创新
    </At>

    {/* Right Open Trajectory Metaphor */}
    <svg aria-label="高压对话中遇到突发追问时，看清局势并由一个底牌词点醒回应" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }}>
      <path className="cx-draw" pathLength="1200" d="M 760 560 H 1165" stroke="#4D6553" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <path d="M 1195 560 H 1810" stroke="#8A938C" strokeWidth="2.2" strokeDasharray="4 14" opacity="0.35" fill="none" />
      <path d="M 1180 498 V 624" stroke={amber} strokeWidth="5" strokeLinecap="round" />
      <path className="cx-draw" pathLength="1200" d="M 1590 486 C 1410 486, 1300 525, 1188 558" stroke={amber} strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="1590" cy="486" r="5.5" fill={amber} />
      <path className="cx-draw" pathLength="1200" d="M 1180 560 C 1280 560, 1335 720, 1495 720 H 1805" stroke={violet} strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <path d="M 1790 710 L 1808 720 L 1790 730" stroke={violet} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="1312" cy="642" r="8" fill={amber} />
    </svg>

    <At className="cuex-sans" style={{ left: 760, top: 454, fontSize: 23, color: muted }}>高压对话现场</At>
    <At style={{ left: 760, top: 494, fontSize: 38, color: sage }}>看着对方自然交流</At>

    <At className="cuex-sans" style={{ left: 1365, top: 378, fontSize: 23, color: amber }}>对方突然抛出潜台词</At>
    <At style={{ left: 1365, top: 416, fontSize: 34, color: amber, lineHeight: 1.3 }}>“你们和普通语音 AI 有什么区别？”</At>

    <At className="cuex-sans" style={{ left: 1590, top: 514, fontSize: 23, color: muted }}>当局者迷 / 调不出底牌</At>

    <At className="cuex-sans" style={{ left: 1106, top: 682, fontSize: 22, color: amber, fontWeight: 600 }}>CueX 递出底牌词</At>
    <At style={{ left: 1102, top: 720, fontSize: 32, color: ink, fontWeight: 600 }}>「单字决策」</At>

    <At style={{ left: 1515, top: 654, fontSize: 36, color: violet }}>看清局势，自然接住话茬</At>
    <At className="cuex-sans" style={{ left: 1515, top: 744, fontSize: 24, color: muted }}>路演游园 · 商务谈判 · 求职面试</At>
  </Canvas16x9>
);

/* ============================================================================
 * P2: 核心反驳 — 对话正在发生时，长篇大论就是打扰。
 * ========================================================================== */
const P2LessIsMore: Page = () => (
  <Canvas16x9 name="less-is-more">
    <SmallMark />
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 76, fontWeight: 550, lineHeight: 1.18 }}>
      对话正在发生时，长篇大论就是打扰。
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 196, fontSize: 28, color: muted }}>
      人在现场缺的不是一份千字答案，而是看清潜台词、调出底牌的那一个支点。
    </At>

    <svg aria-hidden viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }}>
      <line x1="656" y1="320" x2="656" y2="880" stroke={hairline} strokeWidth="1.5" />
      <line x1="1264" y1="320" x2="1264" y2="880" stroke={hairline} strokeWidth="1.5" />
    </svg>

    {/* Column 1 */}
    <At style={{ left: 92, top: 332, width: 500 }}>
      <p className="cuex-sans" style={{ fontSize: 24, color: muted }}>慢思考大模型</p>
      <h2 style={{ marginTop: 18, fontSize: 50, fontWeight: 600, color: '#4E5851' }}>只能事前写稿</h2>
      <p className="cuex-sans" style={{ marginTop: 34, fontSize: 28, lineHeight: 1.6, color: '#4E5851' }}>
        在书桌前能写完万字方案，<br />
        一旦合上电脑走进会场，<br />
        突发追问只能靠自己硬扛。
      </p>
      <p className="cuex-sans" style={{ marginTop: 64, fontSize: 24, color: muted }}>
        管得了准备，进不了现场
      </p>
    </At>

    {/* Column 2 */}
    <At style={{ left: 712, top: 332, width: 496 }}>
      <p className="cuex-sans" style={{ fontSize: 24, color: amber }}>普通生成式语音 AI</p>
      <h2 style={{ marginTop: 18, fontSize: 50, fontWeight: 600, color: amber }}>吐出整段长文</h2>
      <p className="cuex-sans" style={{ marginTop: 34, fontSize: 28, lineHeight: 1.6, color: ink }}>
        每次重跑推理刷出百字回复，<br />
        读完要花六七秒，<br />
        眼神一飘向屏幕，气场全断。
      </p>
      <p className="cuex-sans" style={{ marginTop: 64, fontSize: 24, color: amber, fontWeight: 500 }}>
        喧宾夺主，反而帮了倒忙
      </p>
    </At>

    {/* Column 3: CueX */}
    <At style={{ left: 1320, top: 332, width: 512 }}>
      <p className="cuex-sans" style={{ fontSize: 24, color: green, fontWeight: 600 }}>CueX 通用快思考引擎</p>
      <h2 style={{ marginTop: 18, fontSize: 50, fontWeight: 650, color: ink }}>看局势，递一词</h2>
      <p className="cuex-sans" style={{ marginTop: 34, fontSize: 28, lineHeight: 1.6, color: ink }}>
        顺畅交流时安静隐身；<br />
        跑偏或卡壳时只给两三个字，<br />
        余光一扫点醒，话由自己说出。
      </p>
      <div style={{ marginTop: 52, display: 'inline-block', padding: '12px 24px', borderLeft: `4px solid ${green}`, background: '#E5EFEA' }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: green }}>像眼镜一样融入现场</span>
      </div>
    </At>
  </Canvas16x9>
);

/* ============================================================================
 * P3: OPC 员工闭环 — 一位全天候参谋，陪一人公司切换所有战场。
 * ========================================================================== */
const P3EmployeeLoop: Page = () => (
  <Canvas16x9 name="employee-loop">
    <SmallMark />
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 72, fontWeight: 550, lineHeight: 1.18 }}>
      一位全天候参谋，陪一人公司切换所有战场。
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 196, fontSize: 27, color: sage }}>
      OPC 岗位：首席临场参谋　·　换上不同场景上下文卡包（游园路演 / 商务谈判 / 求职面试），同一引擎实时护航
    </At>

    <svg aria-label="从安静陪听到微光、短词点醒、策略支架的线性递进与自动撤回" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }}>
      <line x1="92" y1="562" x2="1828" y2="562" stroke={hairline} strokeWidth="2.5" />
      <circle cx="220" cy="562" r="9" fill="#68716B" />
      <circle cx="670" cy="562" r="9" fill={green} />
      <circle cx="1120" cy="562" r="12" fill={amber} />
      <circle cx="1570" cy="562" r="9" fill={violet} />

      <path className="cx-draw" pathLength="1200" d="M 1570 624 C 1360 718, 880 718, 670 624" stroke={green} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M 686 620 L 668 623 L 679 638" stroke={green} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>

    <At style={{ left: 92, top: 344, width: 360 }}>
      <p className="cuex-display" style={{ fontSize: 34, color: muted }}>L0</p>
      <h3 style={{ fontSize: 42, fontWeight: 600, marginTop: 6 }}>安静陪听</h3>
      <p className="cuex-sans" style={{ fontSize: 24, color: muted, marginTop: 14 }}>顺畅交流时零弹窗干扰</p>
    </At>

    <At style={{ left: 542, top: 344, width: 360 }}>
      <p className="cuex-display" style={{ fontSize: 34, color: green }}>L1</p>
      <h3 style={{ fontSize: 42, fontWeight: 600, color: green, marginTop: 6 }}>边缘微光</h3>
      <p className="cuex-sans" style={{ fontSize: 24, color: muted, marginTop: 14 }}>偏离关切，余光轻提醒</p>
    </At>

    <At style={{ left: 992, top: 336, width: 390 }}>
      <p className="cuex-display" style={{ fontSize: 36, color: amber }}>L2 · 优先触发</p>
      <h3 style={{ fontSize: 46, fontWeight: 650, color: amber, marginTop: 4 }}>两三字点醒</h3>
      <p className="cuex-sans" style={{ fontSize: 25, color: ink, marginTop: 14 }}>点破潜台词，递出底牌关键词</p>
    </At>

    <At style={{ left: 1442, top: 344, width: 390 }}>
      <p className="cuex-display" style={{ fontSize: 34, color: violet }}>L3</p>
      <h3 style={{ fontSize: 42, fontWeight: 600, color: violet, marginTop: 6 }}>策略短支架</h3>
      <p className="cuex-sans" style={{ fontSize: 24, color: muted, marginTop: 14 }}>持续卡壳，再给回应角度与底线</p>
    </At>

    <At className="cuex-sans" style={{ left: 820, top: 726, width: 600, textAlign: 'center', fontSize: 27, color: green, fontWeight: 600 }}>
      一旦自己开口接上，未用提示立即自动撤回
    </At>

    <At style={{ left: 92, bottom: 78, display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg aria-label="现场亲身自用与多场景演示" viewBox="0 0 64 64" style={{ width: 62, height: 62 }}>
        <circle cx="32" cy="32" r="29" fill="none" stroke={amber} strokeWidth="2" />
        <path d="M26 20 45 32 26 44Z" fill={amber} />
      </svg>
      <span style={{ fontSize: 33, color: amber, fontWeight: 550 }}>现场自证：游园会与路演亲自佩戴实战 + 多场景秒切</span>
    </At>

    <At className="cuex-sans" style={{ right: 88, bottom: 88, fontSize: 23, color: muted, textAlign: 'right' }}>
      人机边界：核心底线本人锁定　·　表达主权归人　·　一键静默接管
    </At>
  </Canvas16x9>
);

/* ============================================================================
 * P4: 并行架构（真实 WebGL 双通路粒子流）— 上下文给足，省掉的是 99% 的废话生成。
 * ========================================================================== */
function StreamsFallback16x9() {
  return (
    <svg aria-label="Jev-like 决策层与慢思考异步备货双通路静态路径" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }}>
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
        fast: new THREE.CatmullRomCurve3([point(410, 585), point(620, 395, 28), point(860, 360), point(1095, 405, -28), point(1268, 585)], false, 'centripetal'),
        slow: new THREE.CatmullRomCurve3([point(410, 585), point(620, 765, -28), point(860, 800), point(1095, 765, 28), point(1268, 585)], false, 'centripetal'),
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
      core.position.copy(point(860, 800));
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
          const x = 88 + u * 322;
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
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 74, fontWeight: 550, lineHeight: 1.18, zIndex: 2 }}>
      上下文给足，省掉的是 99% 的废话生成。
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 196, fontSize: 27, color: muted, zIndex: 2 }}>
      绝非阉割参数的小 LLM——共享完整底牌缓存，由 Jev-like 决策模型并行输出单 Token 判断。
    </At>

    <ThreeStreams16x9 />

    <At style={{ left: 92, top: 468, fontSize: 30, lineHeight: 1.38, zIndex: 2 }}>
      足量底牌<br />
      <span className="cuex-sans" style={{ fontSize: 23, color: muted }}>+ 实时对话流</span>
    </At>

    <At style={{ left: 660, top: 426, width: 400, textAlign: 'center', fontSize: 31, lineHeight: 1.38, zIndex: 2 }}>
      <span style={{ color: amber }}>System 1 · Jev-like</span><br />
      单 Token 决策 · 零思维链
    </At>

    <At style={{ left: 660, top: 615, width: 400, textAlign: 'center', fontSize: 31, lineHeight: 1.38, zIndex: 2 }}>
      <span style={{ color: violet }}>System 2 · Pi 慢思考</span><br />
      异步检索底牌 + 备好短词
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
 * P5: 商业模式（调性 A：认知眼镜式随身外挂）— 像近视眼镜一样，在每次新对话里持续护航。
 * ========================================================================== */
const P5BusinessModel: Page = () => (
  <Canvas16x9 name="business-model">
    <SmallMark />
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 72, fontWeight: 550, lineHeight: 1.18 }}>
      像近视眼镜一样，在每次新对话里持续护航。
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 196, fontSize: 27, color: muted }}>
      OPC 商业模式（待验证商业计划）：一人公司每天都在面对新客户与新底牌，个人上下文越攒越离不开
    </At>

    <svg aria-hidden viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }}>
      <line x1="92" y1="590" x2="1828" y2="590" stroke={hairline} strokeWidth="1.5" />
      <path className="cx-draw" pathLength="1200" d="M 510 742 H 720 M 1245 742 H 1365" stroke="#8C9A86" strokeWidth="2.5" fill="none" />
      <path d="M 706 734 L 722 742 L 706 750 M 1351 734 L 1367 742 L 1351 750" stroke="#8C9A86" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>

    {/* Upper Row */}
    <At style={{ left: 92, top: 312, width: 530 }}>
      <p className="cuex-sans" style={{ fontSize: 23, color: muted }}>核心首发客群</p>
      <p style={{ marginTop: 14, fontSize: 42, color: sage, fontWeight: 600, whiteSpace: 'nowrap' }}>OPC 主理人 · 销售 · 求职者</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 25, color: muted, whiteSpace: 'nowrap' }}>
        一人身兼多职、高频面对陌生高压交流的人群
      </p>
    </At>

    <At style={{ left: 696, top: 312, width: 560 }}>
      <p className="cuex-sans" style={{ fontSize: 23, color: muted }}>获客切口</p>
      <p style={{ marginTop: 14, fontSize: 42, color: ink, fontWeight: 600, whiteSpace: 'nowrap' }}>现场自证 + 场景卡包裂变</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 25, color: muted, whiteSpace: 'nowrap' }}>
        游园会与路演亲身实测 · 谈判与面试卡包即装即用
      </p>
    </At>

    <At style={{ left: 1336, top: 312, width: 510 }}>
      <p className="cuex-sans" style={{ fontSize: 23, color: muted }}>长期留存壁垒</p>
      <p style={{ marginTop: 14, fontSize: 42, color: violet, fontWeight: 600, whiteSpace: 'nowrap' }}>随身认知眼镜，越用越懂你</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 25, color: muted, whiteSpace: 'nowrap' }}>
        每次新谈判新面试沉淀专属底牌，切换成本极高
      </p>
    </At>

    {/* Lower Row */}
    <At className="cuex-sans" style={{ left: 92, top: 642, fontSize: 23, color: muted }}>
      订阅制定价假设（完整 8 要素画布见附件）
    </At>

    <At style={{ left: 92, top: 716, width: 410 }}>
      <p style={{ fontSize: 40, color: '#4E5851', fontWeight: 600 }}>免费体验　¥0</p>
      <p className="cuex-sans" style={{ marginTop: 12, fontSize: 24, color: muted }}>每月 2 场临场护航 · 公开场景卡包</p>
    </At>

    <At style={{ left: 752, top: 716, width: 480 }}>
      <p style={{ fontSize: 42, color: amber, fontWeight: 650, whiteSpace: 'nowrap' }}>个人 / OPC　¥59 / 月</p>
      <p className="cuex-sans" style={{ marginTop: 12, fontSize: 24, color: ink, whiteSpace: 'nowrap' }}>全场景无限切换 · 四级引导 · 个人底牌库</p>
    </At>

    <At style={{ left: 1390, top: 716, width: 450 }}>
      <p style={{ fontSize: 40, color: violet, fontWeight: 600, whiteSpace: 'nowrap' }}>团队与社区　¥199 / 席</p>
      <p className="cuex-sans" style={{ marginTop: 12, fontSize: 24, color: muted, whiteSpace: 'nowrap' }}>共享实战经验卡包 · 团队沟通资产库</p>
    </At>
  </Canvas16x9>
);

/* ============================================================================
 * P6: 单位经济账单 — 共享缓存加上单字决策，单场算力只要一毛二。
 * ========================================================================== */
const P6UnitEconomics: Page = () => (
  <Canvas16x9 name="unit-economics">
    <SmallMark />
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 72, fontWeight: 550, lineHeight: 1.18 }}>
      共享缓存加上单字决策，单场算力只要一毛二。
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 196, fontSize: 27, color: muted }}>
      大模型最贵最慢的是“逐字生成长文”——Jev-like 每次只读 1 个决策 Token，省去约 99% 废话算力。
    </At>

    <At style={{ left: 92, top: 320, width: 1020 }}>
      <div>
        <div className="cuex-sans" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 25, color: muted, marginBottom: 14 }}>
          <span>普通生成式实时语音 AI（每轮吐长思维链与整段回复）</span>
          <span style={{ color: amber, fontWeight: 600 }}>~150 万 Tokens　≈ ¥8 – ¥20 / 场</span>
        </div>
        <div style={{ height: 24, width: '100%', background: '#D46B3E' }} />
      </div>

      <div style={{ marginTop: 48 }}>
        <div className="cuex-sans" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: ink, fontWeight: 600, marginBottom: 14 }}>
          <span>CueX 底牌缓存 + Jev-like 单字决策（15 分钟高压对话）</span>
          <span style={{ color: green }}>~1.1 万 Tokens　≈ ¥0.12 / 场</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ height: 24, width: 18, background: green }} />
          <span className="cuex-sans" style={{ fontSize: 23, color: green }}>足量上下文命中缓存，实时输出不足 50 Tokens，彻底告别“越用越亏”</span>
        </div>
      </div>

      <div style={{ height: 1.5, background: hairline, margin: '56px 0 42px 0' }} />

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
          覆盖：多场景卡包合成 · 突发追问备货 · 游园会实测
        </p>
      </div>
    </At>
  </Canvas16x9>
);

/* ============================================================================
 * P7: 全场景视野（真实 WebGL 四端体积粒子 X）— 一套快思考引擎，接住每一个高压当下。
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
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 70, fontWeight: 550, lineHeight: 1.18, zIndex: 2 }}>
      一套快思考引擎，接住每个当下。
    </At>

    <At className="cuex-sans" style={{ right: 88, top: 86, textAlign: 'right', zIndex: 2 }}>
      <p style={{ fontSize: 22, color: muted }}>长期数据飞轮</p>
      <p style={{ marginTop: 8, fontSize: 25, color: sage }}>沉淀真实点醒轨迹 → 进化 Jev-like 决策层</p>
    </At>

    <VisionParticles16x9 />

    <At style={{ left: 660, top: 295, width: 600, height: 600, zIndex: 1, pointerEvents: 'none' }}>
      <img className="cx-x" src={dimensionalX} alt="连接全场景快思考现场的 CueX 立体 X" style={{ width: 600, height: 600, filter: 'drop-shadow(14px 22px 14px #39463722)' }} />
    </At>

    {/* Strictly focused on 1 + 2 + 3 chosen by founders */}
    <At style={{ left: 100, top: 360, width: 400, textAlign: 'right', zIndex: 2 }}>
      <p style={{ fontSize: 52, lineHeight: 1.2 }}>求职面试</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 28, color: muted }}>高压追问瞬间破冰</p>
    </At>

    <At style={{ left: 1420, top: 360, width: 430, zIndex: 2 }}>
      <p style={{ fontSize: 54, lineHeight: 1.2, fontWeight: 650, color: amber }}>路演与游园会</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 30, fontWeight: 600, color: amber }}>车轮战答疑 · 现场实测中</p>
    </At>

    <At style={{ left: 80, top: 700, width: 420, textAlign: 'right', zIndex: 2 }}>
      <p style={{ fontSize: 52, lineHeight: 1.2 }}>即兴社交与交流</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 28, color: muted }}>看清潜台词自然接话</p>
    </At>

    <At style={{ left: 1420, top: 700, width: 430, zIndex: 2 }}>
      <p style={{ fontSize: 52, lineHeight: 1.2 }}>商务谈判与销售</p>
      <p className="cuex-sans" style={{ marginTop: 14, fontSize: 28, color: muted }}>方案博弈与异议应对</p>
    </At>

    <At className="cuex-sans" style={{ left: 92, bottom: 68, fontSize: 24, color: muted, zIndex: 2 }}>
      X，代表任意需要快思考的真实对话现场（后续亦可延伸战后复盘演练）
    </At>
  </Canvas16x9>
);

/* ============================================================================
 * P8: 合规披露与团队 — 从单一行业对练，蜕变为通用快思考引擎。
 * ========================================================================== */
const P8Compliance: Page = () => (
  <Canvas16x9 name="compliance">
    <SmallMark />
    <At className="cx-enter" style={{ left: 88, top: 82, fontSize: 72, fontWeight: 550, lineHeight: 1.18 }}>
      从单一行业对练，蜕变为通用快思考引擎。
    </At>
    <At className="cuex-sans" style={{ left: 92, top: 196, fontSize: 27, color: muted }}>
      主动透明切分赛前基础与本次怀客松 48 小时全新成果
    </At>

    <svg aria-hidden viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }}>
      <line x1="836" y1="316" x2="836" y2="856" stroke={hairline} strokeWidth="1.5" />
    </svg>

    <At style={{ left: 92, top: 320, width: 680 }}>
      <p className="cuex-sans" style={{ fontSize: 24, color: muted }}>赛前已有基础（11.01 早期原型基线）</p>
      <div className="cuex-sans" style={{ marginTop: 34, display: 'grid', gap: 36, fontSize: 28, lineHeight: 1.55, color: '#4E5851' }}>
        <p>
          <strong style={{ color: ink }}>单一医药代表模拟对练原型</strong><br />
          AI 扮演对面虚拟医生提问，仅绑定单一虚构药品资料
        </p>
        <p>
          <strong style={{ color: ink }}>双流概念与 Jev-like 初步探索</strong><br />
          基础实时语音通道、边缘光效与早期单场景决策实验
        </p>
      </div>
    </At>

    <At style={{ left: 912, top: 320, width: 920 }}>
      <p className="cuex-sans" style={{ fontSize: 24, color: green, fontWeight: 600 }}>怀客松 48 小时赛中全新完成</p>
      <div className="cuex-sans" style={{ marginTop: 34, display: 'grid', gap: 28, fontSize: 28, lineHeight: 1.5, color: ink }}>
        <p>
          <strong style={{ color: amber }}>1. 升级为通用快思考引擎</strong>：剥离行业硬编码，支持装载任意底牌卡包秒切路演、谈判与面试
        </p>
        <p>
          <strong style={{ color: violet }}>2. 重构为 OPC 全天候临场参谋</strong>：从“对面考官”反转为主理人随身外挂，并在游园会与路演亲身实测
        </p>
        <p>
          <strong style={{ color: green }}>3. 足量上下文缓存 + 单字决策链路</strong>：接入赛事算力，落地四级弱引导、自动撤回与双视角透明界面
        </p>
        <p>
          <strong style={{ color: sage }}>4. 完整 OPC 商业闭环</strong>：首席临场参谋岗位说明书、8 要素商业画布与单位经济账单
        </p>
      </div>
    </At>

    <At className="cuex-sans" style={{ left: 92, bottom: 72, fontSize: 26, color: ink }}>
      <strong>记性好了一点</strong>　　路皓然 / 任逸康　　<span style={{ color: muted }}>下一步：入驻果壳 OPC 社区与 Agent 集市开放多场景卡包共创</span>
    </At>
    <At style={{ right: 88, bottom: 70, fontSize: 30, color: amber }}>
      欢迎评委老师现场出题实测
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
  title: 'CueX · 通用快思考引擎与 OPC 全天候临场参谋',
  createdAt: '2026-11-15T22:36:00.000Z',
};

export const notes: (string | undefined)[] = [
  '【P1｜25秒｜累计 0:25】各位评委老师好，我们是“记性好了一点”，路皓然和任逸康。今天几乎所有大模型都在拼命进化“慢思考”——写长报告、跑长推理；但一旦合上电脑走进真实世界，无论是谈客户、面试还是今天的路演答辩，现场往往只给你一秒钟。卡尼曼在《思考，快与慢》里说，高压下既要看懂对方潜台词，又要从脑子里调出底牌，大脑带宽瞬间就会过载。所以我们做了 CueX——通用的快思考外挂，超级个体的全天候临场参谋。',
  '【P2｜25秒｜累计 0:50】为什么现有 AI 进不了真实对话现场？慢思考大模型只能事前在书桌前写方案，上了场帮不上忙；而普通生成式语音 AI 一开口就刷出上百字长文，读完要花六七秒，眼神一旦飘向屏幕，交流气场瞬间就断了。人在现场真正缺的不是一份千字答案，而是帮你看清局势、递出两三个关键词点醒你自己的支点——像近视眼镜一样融入现场。',
  '【P3｜25秒 + 75秒现场实测演示｜累计 2:30】在 OPC 一人公司里，主理人一个人就是一家公司，上午谈客户、下午逛展游园会、晚上路演或面试。你只需要给这位参谋换上不同的场景底牌卡包，同一套引擎就能全程护航：顺畅聊时绝对安静，跑偏给微光，卡壳优先给两三字点醒，一旦你自己接上话，未用提示立刻撤回。今天的游园会和现在站在这里，我们就在亲自用它。接下来 75 秒，直接看现场实测与多场景切换。',
  '【P4｜25秒｜累计 2:55】为什么我们敢给足上下文，却依然既快又省？注意，我们用的绝不是阉割参数的小 LLM，而是把完整底牌放进共享缓存，用 Jev-like 专用快速决策模型并行评估原子问题——每次只读 1 个决策 Token 的校准概率，零思维链、不吐废话；同时慢思考层在后台异步备好短词候选，经控制器复核后再决定沉默、递词还是撤回。上下文一点不省，省掉的是 99% 的废话生成。',
  '【P5｜25秒｜累计 3:20】商业模式上，我们面向高频面对陌生高压交流的 OPC 主理人、销售顾问与求职者。大家可能会问：用户熟练了会不会退订？其实就像近视眼镜一样——超级个体每天都在见新客户、谈新项目、闯新局，底牌常换常新，个人上下文攒得越厚越懂你。我们采用 SaaS 订阅制假设：免费版裂变，个人与 OPC 每月 59 元，团队与社区每席 199 元。',
  '【P6｜25秒｜累计 3:45】这套“共享缓存 + 单字决策”架构更直接带来了极健康的单位经济账单。普通实时语音 AI 每轮生成长文，一场十五分钟烧掉上百万 Token；而我们实时决策每次只输出 1 个 Token，单场全流程仅消耗约 1.1 万 Token，直接算力成本一毛二左右。按 59 元月订阅、每月重度使用 20 场测算，算力毛利率高达 95.9%，右边是我们在赛事算力平台的真实消耗记录。',
  '【P7｜25秒｜累计 4:10】中间这个立体的 X，代表所有需要快思考的高压当下：从今天我们现场自用的路演与游园会，到商务谈判与销售，再到求职面试与高压社交，未来还可以自然延伸战后复盘陪练。当全行业都在囤积慢思考长文本数据时，我们在真实交流中沉淀“哪一个词真正点醒了人”，持续进化快思考决策层。',
  '【P8｜15秒｜累计 4:25】最后透明汇报赛前与赛中边界：早期版本只是虚拟医生考医药代表的单一模拟器；这次怀客松 48 小时，我们剥离行业硬编码，把它彻底升级为通用快思考引擎与 OPC 全天候临场参谋，跑通了单字决策省流链路与全套商业闭环，并在游园会与路演现场亲身实战。欢迎各位老师现场出题考我们！',
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
