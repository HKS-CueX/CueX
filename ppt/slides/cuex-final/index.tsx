import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import type { DesignSystem, Page, SlideMeta } from '@open-slide/core';
import * as THREE from 'three';

import instrumentSerifUrl from '@assets/fonts/InstrumentSerif-Regular.ttf?url';
import instrumentSerifItalicUrl from '@assets/fonts/InstrumentSerif-Italic.ttf?url';
import notoSansScUrl from '@assets/fonts/NotoSansSC-VF.ttf?url';
import notoSerifScUrl from '@assets/fonts/NotoSerifSC-VF.ttf?url';
import jetBrainsMonoUrl from '@assets/fonts/JetBrainsMono-VF.ttf?url';
import interUrl from '@assets/fonts/Inter-VF.ttf?url';
import cuexSymbolDimUrl from '@assets/brand/cuex-symbol-dimensional.svg?url';
import metricsData from '../../scripts/cuex-final-metrics.json';

const STYLE_ID = 'osd-styles-cuex-final';
const FONT_CSS = `
@font-face {
  font-family: 'CueXDisplay';
  src: url('${instrumentSerifUrl}') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'CueXDisplay';
  src: url('${instrumentSerifItalicUrl}') format('truetype');
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: 'CueXSans';
  src: url('${interUrl}') format('truetype');
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: 'CueXCJK';
  src: url('${notoSansScUrl}') format('truetype');
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: 'CueXCJKSerif';
  src: url('${notoSerifScUrl}') format('truetype');
  font-weight: 200 900;
  font-display: swap;
}
@font-face {
  font-family: 'CueXMono';
  src: url('${jetBrainsMonoUrl}') format('truetype');
  font-weight: 100 800;
  font-display: swap;
}
.cuex-slide-root * {
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}
.cuex-tabular {
  font-variant-numeric: tabular-nums;
}
`;

if (typeof document !== 'undefined') {
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  if (styleEl.textContent !== FONT_CSS) {
    styleEl.textContent = FONT_CSS;
  }
}

export const meta: SlideMeta = {
  title: 'CueX 统一商业计划书 · 通用快思考引擎与 CueX Presentation',
  createdAt: '2026-11-15T18:16:53.321Z',
};

export const design: DesignSystem = {
  palette: {
    bg: '#F8F7F3',
    text: '#111318',
    accent: '#E87A24',
  },
  fonts: {
    display: "'CueXDisplay', 'CueXCJKSerif', 'PingFang SC', Georgia, serif",
    body: "'CueXSans', 'CueXCJK', 'PingFang SC', 'Noto Sans SC', sans-serif",
  },
  typeScale: {
    hero: 72,
    body: 17,
  },
  radius: 14,
};

const C = {
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
  amberSoft: 'rgba(232, 122, 36, 0.12)',
  violet: '#7C3AED',
  violetSoft: 'rgba(124, 58, 237, 0.11)',
  violetLight: '#8E8CFF',
  sage: '#246A4D',
  sageSoft: 'rgba(36, 106, 77, 0.10)',
  rust: '#C94A2A',
  rustSoft: 'rgba(201, 74, 42, 0.10)',
};

const FF = {
  display: "'CueXDisplay', 'CueXCJKSerif', 'PingFang SC', serif",
  serif: "'CueXCJKSerif', 'CueXDisplay', 'PingFang SC', serif",
  sans: "'CueXSans', 'CueXCJK', 'PingFang SC', sans-serif",
  mono: "'CueXMono', monospace",
};

/* ---------------- WebGL Amber x Violet X Stream Canvas ---------------- */
function CrossStreamWebGL({
  variant = 'runtime',
  width = 820,
  height = 420,
}: {
  variant?: 'runtime' | 'horizon';
  width?: number;
  height?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer | null = null;
    let rafId = 0;

    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
      camera.position.set(0, 0, variant === 'horizon' ? 7.2 : 6.6);

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.domElement.setAttribute('data-3d-ready', 'true');
      host.innerHTML = '';
      host.appendChild(renderer.domElement);

      const group = new THREE.Group();
      scene.add(group);

      const buildRibbonPoints = (slope: number, amp: number, count: number) => {
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const t = (i / (count - 1)) * 2 - 1;
          const x = t * 3.8;
          const y = slope * t * 1.9 + Math.sin(t * Math.PI * 1.35) * amp;
          const z = Math.cos(t * Math.PI * 1.5) * 0.45 * (slope > 0 ? 1 : -1);
          positions[i * 3] = x;
          positions[i * 3 + 1] = y;
          positions[i * 3 + 2] = z;
        }
        return positions;
      };

      const createStream = (colorHex: number, slope: number, amp: number) => {
        const count = 420;
        const geom = new THREE.BufferGeometry();
        const base = buildRibbonPoints(slope, amp, count);
        const scattered = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const spread = (Math.sin(i * 12.9898) * 0.5) * 0.22;
          const spreadY = (Math.cos(i * 78.233) * 0.5) * 0.22;
          scattered[i * 3] = base[i * 3] + spread;
          scattered[i * 3 + 1] = base[i * 3 + 1] + spreadY;
          scattered[i * 3 + 2] = base[i * 3 + 2] + ((i % 5) - 2) * 0.04;
        }
        geom.setAttribute('position', new THREE.BufferAttribute(scattered, 3));
        const mat = new THREE.PointsMaterial({
          color: colorHex,
          size: variant === 'horizon' ? 0.075 : 0.065,
          transparent: true,
          opacity: 0.78,
        });
        const points = new THREE.Points(geom, mat);

        const curvePts: THREE.Vector3[] = [];
        for (let i = 0; i < 40; i++) {
          const t = (i / 39) * 2 - 1;
          curvePts.push(
            new THREE.Vector3(
              t * 3.8,
              slope * t * 1.9 + Math.sin(t * Math.PI * 1.35) * amp,
              Math.cos(t * Math.PI * 1.5) * 0.45 * (slope > 0 ? 1 : -1)
            )
          );
        }
        const curve = new THREE.CatmullRomCurve3(curvePts);
        const tubeGeom = new THREE.TubeGeometry(curve, 64, 0.032, 8, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.9,
        });
        const tube = new THREE.Mesh(tubeGeom, tubeMat);
        return { points, tube };
      };

      const amberStream = createStream(0xff7a2f, -0.78, 0.26);
      const violetStream = createStream(0x7c3aed, 0.78, 0.26);
      group.add(amberStream.points, amberStream.tube, violetStream.points, violetStream.tube);

      // Center nexus ring (Minimum Necessary Intervention intersection)
      const ringGeom = new THREE.RingGeometry(0.28, 0.36, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x111318,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      group.add(ring);

      const dotGeom = new THREE.SphereGeometry(0.11, 24, 24);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xe87a24 });
      group.add(new THREE.Mesh(dotGeom, dotMat));

      group.rotation.y = variant === 'horizon' ? 0.14 : -0.08;
      group.rotation.x = 0.06;

      renderer.render(scene, camera);
      host.setAttribute('data-3d-ready', 'true');

      // Gentle motion in interactive dev mode; static clean capture in print
      let tick = 0;
      const animate = () => {
        tick += 0.008;
        group.rotation.y = (variant === 'horizon' ? 0.14 : -0.08) + Math.sin(tick) * 0.04;
        renderer?.render(scene, camera);
        rafId = requestAnimationFrame(animate);
      };
      if (typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        rafId = requestAnimationFrame(animate);
      }
    } catch {
      host.innerHTML = `<div data-3d-ready="fallback" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 560 300" style="width:92%;height:92%;">
          <path d="M50,245 C180,195 380,105 510,55" stroke="#7C3AED" stroke-width="18" stroke-linecap="round" fill="none" opacity="0.88" />
          <path d="M50,55 C180,105 380,195 510,245" stroke="#FF7A2F" stroke-width="18" stroke-linecap="round" fill="none" opacity="0.92" />
          <circle cx="280" cy="150" r="24" fill="#F8F7F3" stroke="#111318" stroke-width="3" />
          <circle cx="280" cy="150" r="8" fill="#E87A24" />
        </svg>
      </div>`;
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (renderer) renderer.dispose();
    };
  }, [variant, width, height]);

  return (
    <div
      ref={hostRef}
      data-waitfor="[data-3d-ready]"
      className="cuex-wide"
      style={{
        width,
        height,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    />
  );
}

/* ---------------- Shared Layout Primitives ---------------- */
function SlideShell({
  pageNo,
  eyebrow,
  title,
  subtitle,
  children,
  footerNote,
}: {
  pageNo: string;
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  children: ReactNode;
  footerNote?: string;
}) {
  return (
    <div
      className="cuex-slide-root"
      style={{
        width: '100%',
        height: '100%',
        background: C.bg,
        color: C.ink,
        fontFamily: FF.sans,
        padding: '48px 72px 40px 72px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle architectural corner marks */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 5,
          background: `linear-gradient(90deg, ${C.amberBright} 0%, ${C.violet} 100%)`,
        }}
      />

      {/* Top Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span
              className="cuex-tabular"
              style={{
                fontFamily: FF.mono,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.08em',
                padding: '4px 10px',
                borderRadius: 6,
                background: C.tint,
                border: `1px solid ${C.hairline}`,
                color: C.ink,
              }}
            >
              {pageNo} / 08
            </span>
            <span
              style={{
                fontFamily: FF.mono,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.06em',
                color: C.amber,
                textTransform: 'uppercase',
              }}
            >
              {eyebrow}
            </span>
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: FF.serif,
              fontSize: 40,
              fontWeight: 700,
              lineHeight: 1.18,
              letterSpacing: '-0.02em',
              color: C.ink,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                margin: '8px 0 0 0',
                fontSize: 17,
                lineHeight: 1.45,
                color: C.muted,
                maxWidth: 1420,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4, flexShrink: 0 }}>
          <img src={cuexSymbolDimUrl} alt="CueX" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: FF.display, fontSize: 22, lineHeight: 1, color: C.ink }}>CueX</div>
            <div style={{ fontFamily: FF.mono, fontSize: 11, color: C.subtle, marginTop: 3 }}>
              OPC · 记性好了一点
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', margin: '18px 0 14px 0', minHeight: 0 }}>
        {children}
      </main>

      {/* Footer */}
      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: `1px solid ${C.hairline}`,
          paddingTop: 12,
          fontSize: 13,
          color: C.subtle,
        }}
      >
        <span>{footerNote ?? 'CueX — Universal Cognitive Runtime · 在深度思考之外，接住当下。'}</span>
        <span style={{ fontFamily: FF.mono, fontSize: 12 }}>
          HKS 2026 · OPC 模式创新赛道 · 统一最终交付版
        </span>
      </footer>
    </div>
  );
}

function Card({
  children,
  style,
  accent,
}: {
  children: ReactNode;
  style?: CSSProperties;
  accent?: 'amber' | 'violet' | 'sage' | 'rust' | 'none';
}) {
  const borderLeft =
    accent === 'amber'
      ? `4px solid ${C.amberBright}`
      : accent === 'violet'
      ? `4px solid ${C.violet}`
      : accent === 'sage'
      ? `4px solid ${C.sage}`
      : accent === 'rust'
      ? `4px solid ${C.rust}`
      : undefined;

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.hairline}`,
        borderLeft: borderLeft ?? `1px solid ${C.hairline}`,
        borderRadius: 14,
        padding: '20px 24px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Tag({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'amber' | 'violet' | 'sage' | 'rust' | 'neutral';
}) {
  const map = {
    amber: { bg: C.amberSoft, fg: '#B8540A', bd: 'rgba(232,122,36,0.28)' },
    violet: { bg: C.violetSoft, fg: '#5B21B6', bd: 'rgba(124,58,237,0.28)' },
    sage: { bg: C.sageSoft, fg: C.sage, bd: 'rgba(36,106,77,0.28)' },
    rust: { bg: C.rustSoft, fg: C.rust, bd: 'rgba(201,74,42,0.28)' },
    neutral: { bg: C.tint, fg: C.muted, bd: C.hairline },
  }[tone];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        background: map.bg,
        color: map.fg,
        border: `1px solid ${map.bd}`,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/* ==========================================================================
   P1: 品牌与定位（Brand & Positioning）
   ========================================================================== */
const Page1Brand: Page = () => (
  <div
    className="cuex-slide-root"
    style={{
      width: '100%',
      height: '100%',
      background: C.bg,
      color: C.ink,
      fontFamily: FF.sans,
      padding: '56px 80px 44px 80px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    {/* Top subtle gradient hairline */}
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 6,
        background: `linear-gradient(90deg, ${C.amberBright} 0%, ${C.violet} 100%)`,
      }}
    />

    {/* Top Bar */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          className="cuex-tabular"
          style={{
            fontFamily: FF.mono,
            fontSize: 14,
            fontWeight: 700,
            padding: '5px 12px',
            borderRadius: 6,
            background: C.ink,
            color: C.bg,
          }}
        >
          01 / 08
        </span>
        <span style={{ fontFamily: FF.mono, fontSize: 14, color: C.muted, letterSpacing: '0.06em' }}>
          HKS 2026 · OPC 模式创新赛道 · 商业计划书
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Tag label="团队：记性好了一点" tone="neutral" />
        <Tag label="首切 MVP：CueX Presentation" tone="amber" />
      </div>
    </div>

    {/* Center Split Hero */}
    <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 60, alignItems: 'center', margin: '12px 0' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <img src={cuexSymbolDimUrl} alt="CueX Symbol" style={{ width: 52, height: 52 }} />
          <span
            style={{
              fontFamily: FF.mono,
              fontSize: 15,
              fontWeight: 700,
              color: C.violet,
              letterSpacing: '0.1em',
            }}
          >
            UNIVERSAL COGNITIVE RUNTIME
          </span>
        </div>

        <div style={{ fontFamily: FF.display, fontSize: 122, lineHeight: 0.94, letterSpacing: '-0.03em', color: C.ink }}>
          Cue<span style={{ color: C.amberBright }}>X</span>
        </div>

        <h2
          style={{
            margin: '16px 0 0 0',
            fontFamily: FF.serif,
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1.2,
            color: C.ink,
          }}
        >
          你的快思考外挂
        </h2>

        <p
          style={{
            margin: '12px 0 28px 0',
            fontFamily: FF.serif,
            fontSize: 28,
            color: C.muted,
            lineHeight: 1.35,
          }}
        >
          在深度思考之外，接住当下。
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Card style={{ padding: '16px 18px', background: C.card }} accent="amber">
            <div style={{ fontFamily: FF.mono, fontSize: 12, color: C.amber, fontWeight: 700 }}>CORE PRINCIPLE</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>最小必要干预</div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 4, lineHeight: 1.45 }}>
              平时 L0 克制静默；只在分叉点给出 L1–L3 轻锚点
            </div>
          </Card>

          <Card style={{ padding: '16px 18px', background: C.card }} accent="violet">
            <div style={{ fontFamily: FF.mono, fontSize: 12, color: C.violet, fontWeight: 700 }}>FIRST WEDGE MVP</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>演讲与答辩引导师</div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 4, lineHeight: 1.45 }}>
              基于讲稿编译 Evidence 溯源，已端到端落地可演示
            </div>
          </Card>

          <Card style={{ padding: '16px 18px', background: C.card }} accent="sage">
            <div style={{ fontFamily: FF.mono, fontSize: 12, color: C.sage, fontWeight: 700 }}>NET UTILITY</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>V = H − λI 可量化</div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 4, lineHeight: 1.45 }}>
              打扰惩罚系数 λ=2，接回正轨即自动撤回不挡视线
            </div>
          </Card>
        </div>
      </div>

      {/* Right Visual: Warm Light Crossed X Radiation Diagram matching Rollup Banner */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.hairline}`,
          borderRadius: 24,
          padding: 36,
          position: 'relative',
          height: 620,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              background: C.tintWarm,
              border: `1px solid rgba(232,122,36,0.35)`,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: '#B8540A' }}>演讲与答辩 Presentation</div>
            <div style={{ fontFamily: FF.mono, fontSize: 11, color: C.amber, marginTop: 2 }}>IMPLEMENTED MVP · 首切商业楔子</div>
          </div>
          <div
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              background: C.tint,
              border: `1px solid ${C.hairline}`,
              textAlign: 'right',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: C.muted }}>社交 Social</div>
            <div style={{ fontFamily: FF.mono, fontSize: 11, color: C.subtle, marginTop: 2 }}>ROADMAP ADAPTER</div>
          </div>
        </div>

        {/* Central Crossed X Graphic */}
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 420 320" style={{ width: '100%', maxHeight: 330 }}>
            <defs>
              <linearGradient id="amberRibbon" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FF9B42" />
                <stop offset="100%" stopColor="#E87A24" />
              </linearGradient>
              <linearGradient id="violetRibbon" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8E8CFF" />
                <stop offset="100%" stopColor="#7C3AED" />
              </linearGradient>
            </defs>
            {/* Subtle corner rays */}
            <path d="M210,160 Q110,100 50,36" stroke="#E87A24" strokeWidth="1.5" strokeDasharray="5 5" fill="none" opacity="0.45" />
            <path d="M210,160 Q310,100 370,36" stroke="#7C3AED" strokeWidth="1.5" strokeDasharray="5 5" fill="none" opacity="0.35" />
            <path d="M210,160 Q110,220 50,284" stroke="#7C3AED" strokeWidth="1.5" strokeDasharray="5 5" fill="none" opacity="0.35" />
            <path d="M210,160 Q310,220 370,284" stroke="#E87A24" strokeWidth="1.5" strokeDasharray="5 5" fill="none" opacity="0.35" />

            {/* Violet Stream */}
            <path
              d="M90,260 C150,210 270,110 330,60"
              stroke="url(#violetRibbon)"
              strokeWidth="22"
              strokeLinecap="round"
              fill="none"
              opacity="0.88"
            />
            {/* Amber Stream */}
            <path
              d="M90,60 C150,110 270,210 330,260"
              stroke="url(#amberRibbon)"
              strokeWidth="22"
              strokeLinecap="round"
              fill="none"
              opacity="0.92"
            />
            {/* Nexus Intersection */}
            <circle cx="210" cy="160" r="24" fill="#F8F7F3" stroke="#111318" strokeWidth="2.5" />
            <circle cx="210" cy="160" r="8" fill="#E87A24" />
            <text x="152" y="42" fontSize="13" fill="#B8540A" fontWeight="700" fontFamily="sans-serif">人类当下表达流</text>
            <text x="234" y="294" fontSize="13" fill="#5B21B6" fontWeight="700" fontFamily="sans-serif">Runtime 持续理解流</text>
          </svg>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              background: C.tint,
              border: `1px solid ${C.hairline}`,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: C.muted }}>讲课 Teaching</div>
            <div style={{ fontFamily: FF.mono, fontSize: 11, color: C.subtle, marginTop: 2 }}>ROADMAP ADAPTER</div>
          </div>
          <div style={{ textAlign: 'center', fontFamily: FF.mono, fontSize: 12, color: C.ink, fontWeight: 600 }}>
            X = 任意实时高认知密度场景
          </div>
          <div
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              background: C.tint,
              border: `1px solid ${C.hairline}`,
              textAlign: 'right',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: C.muted }}>销售与自定义 Sales/Custom</div>
            <div style={{ fontFamily: FF.mono, fontSize: 11, color: C.subtle, marginTop: 2 }}>ROADMAP ADAPTER</div>
          </div>
        </div>
      </div>
    </div>

    {/* Bottom Strip */}
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: `1px solid ${C.hairline}`,
        paddingTop: 14,
        fontSize: 14,
        color: C.muted,
      }}
    >
      <span>统一品牌视觉 · 温润浅色低刺激界面（#F8F7F3）× 琥珀紫罗兰交汇信号</span>
      <span style={{ fontFamily: FF.mono, fontSize: 13, color: C.subtle }}>
        github.com/HKS-CueX/CueX · refactor/universal-runtime-presentation
      </span>
    </div>
  </div>
);

/* ==========================================================================
   P2: 痛点洞察（Why Existing Tools Fail On Stage）
   ========================================================================== */
const Page2PainPoints: Page = () => (
  <SlideShell
    pageNo="02"
    eyebrow="PROBLEM & COGNITIVE LOAD INSIGHT"
    title="演讲与答辩现场，缺的不是信息，而是“刚刚好的克制”"
    subtitle="高风险临场场景下，人脑工作记忆极易过载。传统工具要么一提问就卡死，要么靠狂吐文字把演讲者彻底带偏。"
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.15fr', gap: 24, height: '100%' }}>
      {/* Col 1: Teleprompters */}
      <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} accent="rust">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Tag label="传统路线 A" tone="rust" />
            <span style={{ fontFamily: FF.mono, fontSize: 13, color: C.subtle }}>PromptSmart / 滚动提词器</span>
          </div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: 24, fontWeight: 700 }}>逐字稿跟随与强行背诵</h3>
          <p style={{ margin: '0 0 18px 0', fontSize: 16, lineHeight: 1.55, color: C.muted }}>
            依赖说话人按既定顺序顺读；遇评委打断追问、临时跳页或嘈杂环境识别漂移时即刻停摆。
          </p>
          <div style={{ background: C.tint, borderRadius: 10, padding: '14px 16px', fontSize: 14, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>典型失灵瞬间：</div>
            <div>• 被评委打断：“请直接讲第 4 页商业成本？” → 滚动错位找不到行</div>
            <div>• 低头念逐字稿 → 眼神失去现场连接，表达机械僵硬</div>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 12, marginTop: 16, fontSize: 13, color: C.subtle }}>
          已核查事实：PromptSmart Pro（$9.99/mo 起）按声轨滚动，无法处理开放式临场 Q&amp;A。
        </div>
      </Card>

      {/* Col 2: Chatty AI Copilots */}
      <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} accent="rust">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Tag label="传统路线 B" tone="rust" />
            <span style={{ fontFamily: FF.mono, fontSize: 13, color: C.subtle }}>聊天式 Copilot / 复盘工具</span>
          </div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: 24, fontWeight: 700 }}>大段答案轰炸，反噬注意力</h3>
          <p style={{ margin: '0 0 18px 0', fontSize: 16, lineHeight: 1.55, color: C.muted }}>
            每听见一句话就流式输出 100–200 字长回答，或强制按热键召唤大浮窗，迫使讲者在说话间隙停下来“阅读理解”。
          </p>
          <div style={{ background: C.tint, borderRadius: 10, padding: '14px 16px', fontSize: 14, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>为什么“帮太多”效用为负？</div>
            <div>• 若帮助增益 H = +3，但打断眼神与语流带来 I = 2 惩罚：</div>
            <div style={{ fontFamily: FF.mono, fontWeight: 700, color: C.rust, marginTop: 4 }}>
              净效用 V = H − 2×I = 3 − 4 = −1（负收益！）
            </div>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 12, marginTop: 16, fontSize: 13, color: C.subtle }}>
          已核查竞品：Poised 已于 2026-10 关停；Yoodli 专注赛后练习非实时隐身；Final Round AI 月费达 $150 且文字阅读负担大。
        </div>
      </Card>

      {/* Col 3: CueX Solution */}
      <Card
        style={{
          background: C.tintWarm,
          border: `1px solid rgba(232,122,36,0.35)`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
        accent="amber"
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Tag label="CueX 破局范式" tone="amber" />
            <span style={{ fontFamily: FF.mono, fontSize: 13, fontWeight: 700, color: C.amber }}>
              MINIMUM NECESSARY INTERVENTION
            </span>
          </div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: 26, fontWeight: 700 }}>用“是否必须开口”的门槛替代盲目生成</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: 16, lineHeight: 1.55, color: C.ink }}>
            CueX 首先是一名克制的“旁听守门员”，而非抢麦助手：
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { lv: 'L0 静默持有', desc: '讲者表达流畅且在轨道内 → 零文字干扰，保留 100% 现场眼神。', color: C.sage },
              { lv: 'L1 边缘轻信号', desc: '节奏偏离或接近关键过渡点 → 屏幕边缘柔和琥珀呼吸提示。', color: C.amber },
              { lv: 'L2 锚点词卡', desc: '停顿卡壳或遗漏关键数据 → 仅推 1 行短锚点 + 原文 Evidence 编号。', color: C.violet },
              { lv: 'L3 纠偏 / 自动撤回', desc: '关键数据冲突给强校验；讲者一旦接回或切章 → 立即自动撤回！', color: C.ink },
            ].map((item) => (
              <div
                key={item.lv}
                style={{
                  background: C.card,
                  border: `1px solid ${C.hairline}`,
                  borderRadius: 10,
                  padding: '10px 14px',
                }}
              >
                <div style={{ fontFamily: FF.mono, fontSize: 13, fontWeight: 700, color: item.color }}>{item.lv}</div>
                <div style={{ fontSize: 14, color: C.muted, marginTop: 3 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            padding: '10px 14px',
            background: C.ink,
            color: C.bg,
            borderRadius: 10,
            fontFamily: FF.mono,
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>核心控制目标：MAX V = H − λI</span>
          <span style={{ color: '#FF9B42' }}>λ = 2.0 惩罚基准</span>
        </div>
      </Card>
    </div>
  </SlideShell>
);

/* ==========================================================================
   P3: 首切商业场景 CueX Presentation（演讲与答辩临场引导师）
   ========================================================================== */
const Page3Presentation: Page = () => (
  <SlideShell
    pageNo="03"
    eyebrow="FIRST COMMERCIAL WEDGE · CUEX PRESENTATION"
    title="首切场景落地：CueX Presentation（演讲与答辩临场引导师）"
    subtitle="完整打通「上台前讲稿编译溯源 → 台上 Focus/Inspector 双视图与单点彩排 → 散场后 V = H − λI 复盘与审批记忆」端到端闭环。"
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 22, height: '100%' }}>
      {/* Stage 1: Pre-stage Compiler */}
      <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} accent="violet">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Tag label="阶段 1 · 上台前" tone="violet" />
            <span style={{ fontFamily: FF.mono, fontSize: 12, color: C.subtle }}>DocumentExtractor + Compiler</span>
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 22, fontWeight: 700 }}>多格式编译为结构化证据库</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: 15, color: C.muted, lineHeight: 1.5 }}>
            上传讲者自己的 <code>.pptx</code> / <code>.pdf</code> / <code>.md</code> / <code>.txt</code>，一键抽出章节图谱、必讲锚点与防幻觉原文依据 <code>Evidence[]</code>。
          </p>

          <div style={{ background: C.tint, borderRadius: 10, padding: 14, border: `1px solid ${C.hairline}` }}>
            <div style={{ fontFamily: FF.mono, fontSize: 12, color: C.violet, fontWeight: 700, marginBottom: 8 }}>
              PresentationContextPack 结构示例
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, fontFamily: FF.mono, color: C.ink }}>
              <div>• Scene: pitch | defense | keynote</div>
              <div>• Chapter 03: Unit Economics</div>
              <div style={{ color: C.amber }}>  └ Anchor: 10 项全成本与毛利校验</div>
              <div style={{ color: C.muted }}>  └ Evidence#E07: "ASR ¥0.80/h..."</div>
              <div style={{ color: C.rust }}>  └ Forbidden: 勿把理论假设当实测营收</div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.sage, fontWeight: 600, marginTop: 12 }}>
          ✓ 工程现状：已实现 4 格式抽取编译，零单领域硬编码
        </div>
      </Card>

      {/* Stage 2: Live Stage Focus & Inspector */}
      <Card
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: C.tintWarm,
          border: `1px solid rgba(232,122,36,0.38)`,
        }}
        accent="amber"
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Tag label="阶段 2 · 彩排与临场" tone="amber" />
            <span style={{ fontFamily: FF.mono, fontSize: 12, color: C.amber }}>Focus / Inspector 双视图</span>
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 22, fontWeight: 700 }}>实时低分心引导与自动撤回</h3>
          <p style={{ margin: '0 0 14px 0', fontSize: 15, color: C.muted, lineHeight: 1.5 }}>
            支持单点快速彩排与实时临场模式：<code>Focus</code> 给讲者纯净低干扰提示；<code>Inspector</code> 完整透视门控状态、TTL 与原文依据。
          </p>

          {/* Mini UI Mock */}
          <div style={{ background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: FF.mono, color: C.subtle, marginBottom: 10 }}>
              <span>[Focus Mode] ASR: Local/Remote/Text</span>
              <span style={{ color: C.amber, fontWeight: 700 }}>L2 ANCHOR · TTL 8s</span>
            </div>
            <div
              style={{
                borderLeft: `4px solid ${C.amberBright}`,
                background: C.tintWarm,
                padding: '10px 12px',
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>补齐：10 项全成本中的 ASR 占大头</div>
              <div style={{ fontFamily: FF.mono, fontSize: 12, color: C.muted, marginTop: 4 }}>
                依据 [E07] · 检测到你切回本章 → 状态转为 Auto-Withdraw
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, fontFamily: FF.mono, fontSize: 11 }}>
              <Tag label="user_recovered 自动撤回" tone="sage" />
              <Tag label="contextVersion 校验" tone="neutral" />
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.sage, fontWeight: 600, marginTop: 12 }}>
          ✓ 工程现状：Focus/Inspector + 7 类自动撤回已实装
        </div>
      </Card>

      {/* Stage 3: Reflection & Memory */}
      <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} accent="sage">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Tag label="阶段 3 · 散场后" tone="sage" />
            <span style={{ fontFamily: FF.mono, fontSize: 12, color: C.subtle }}>Reflection + MemoryStore</span>
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 22, fontWeight: 700 }}>效用复盘与人工审批记忆</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: 15, color: C.muted, lineHeight: 1.5 }}>
            不搞无意义好评打分，用严格控制论指标复盘每一次出手；同时把用户个人记忆权限彻底交还本人。
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: C.tint, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontFamily: FF.mono, fontSize: 12, fontWeight: 700, color: C.sage }}>
                PRESENTATION REFLECTION
              </div>
              <div style={{ fontSize: 14, color: C.ink, marginTop: 4 }}>
                输出净效用 <code>V = H − λI</code>、章节覆盖率、遗漏锚点、<code>False Intervention Rate</code> 及逐条干预生命轨迹。
              </div>
            </div>

            <div style={{ background: C.tint, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontFamily: FF.mono, fontSize: 12, fontWeight: 700, color: C.violet }}>
                OPT-IN MEMORY GOVERNANCE
              </div>
              <div style={{ fontSize: 14, color: C.ink, marginTop: 4 }}>
                禁止静默写入隐私：候选记忆须人工勾选确认，且支持 <code>/api/sessions/:id/wipe</code> 一键彻底擦除。
              </div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.sage, fontWeight: 600, marginTop: 12 }}>
          ✓ 工程现状：V = H − λI 复盘与审批 API 已实装
        </div>
      </Card>
    </div>
  </SlideShell>
);

/* ==========================================================================
   P4: 通用认知运行时（Universal Cognitive Runtime Architecture）
   ========================================================================== */
const Page4Runtime: Page = () => (
  <SlideShell
    pageNo="04"
    eyebrow="SYSTEM ARCHITECTURE · UNIVERSAL COGNITIVE RUNTIME"
    title="不是“硬编码话术外壳”，而是场景解耦的通用实时认知运行时"
    subtitle="底座与具体场景完全分离：同一套 EventBus、ContextStore 与独立门控 InterventionController，通过标准契约驱动不同场景插件。"
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 28, alignItems: 'center', height: '100%' }}>
      {/* Left: Clean Architecture Stack */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Layer 1 */}
        <Card style={{ padding: '16px 22px' }} accent="amber">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: FF.mono, fontSize: 13, fontWeight: 700, color: C.amber }}>
              01 · PERCEPTION &amp; CONTEXT BUS
            </span>
            <Tag label="WebAudio PCM16LE + 诚实 ASR 三态" tone="amber" />
          </div>
          <div style={{ fontSize: 15, color: C.ink, lineHeight: 1.5 }}>
            浏览器 AudioWorklet 采集 16kHz 流式语音，显式区分 <strong>Local Sherpa / Remote Cloud / Text Eval</strong> 三种真实状态，推送至 <code>EventBus</code> 与单调递增版本号的 <code>ContextStore</code>。
          </div>
        </Card>

        {/* Layer 2 */}
        <Card style={{ padding: '16px 22px', background: C.tintWarm }} accent="amber">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: FF.mono, fontSize: 13, fontWeight: 700, color: C.ink }}>
              02 · INDEPENDENT INTERVENTION CONTROLLER（核心护城河）
            </span>
            <Tag label="L0–L3 + Auto-Withdraw" tone="neutral" />
          </div>
          <div style={{ fontSize: 15, color: C.ink, lineHeight: 1.5 }}>
            推理生成 ≠ 屏幕弹窗。所有候选提示必须经过独立门控：校验 <code>contextVersion</code> 鲜活度、冷却时间、风险阈值与 <code>TTL</code>；一旦命中 <code>user_recovered</code> / <code>chapter_changed</code> / <code>superseded</code> 等 7 类状态，立即自动撤回。
          </div>
        </Card>

        {/* Layer 3 */}
        <Card style={{ padding: '16px 22px' }} accent="violet">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: FF.mono, fontSize: 13, fontWeight: 700, color: C.violet }}>
              03 · DUAL-SYSTEM REASONING &amp; EVIDENCE GUARD
            </span>
            <Tag label="System 1 快评估 × System 2 锚定生成" tone="violet" />
          </div>
          <div style={{ fontSize: 15, color: C.ink, lineHeight: 1.5 }}>
            <strong>System 1</strong>（确定性规则 + 可选本地 llama.cpp / 快模型）先挡掉绝大多数无须打扰窗；仅高价值窗口唤醒 <strong>System 2</strong> 检索 <code>Evidence[]</code> 并执行 <code>numbersIn()</code> 数值校验与可选单会话前缀缓存。
          </div>
        </Card>

        {/* Layer 4 */}
        <Card style={{ padding: '14px 22px' }} accent="sage">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontFamily: FF.mono, fontSize: 13, fontWeight: 700, color: C.sage }}>
              04 · PLUGGABLE SCENARIO ADAPTER CONTRACT (@cuex/protocol)
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            <Tag label="presentation（已全面落地 MVP）" tone="amber" />
            <Tag label="social（协议注册 · 路线图）" tone="neutral" />
            <Tag label="teaching（协议注册 · 路线图）" tone="neutral" />
            <Tag label="sales（协议注册 · 路线图）" tone="neutral" />
            <Tag label="custom（协议注册 · 路线图）" tone="neutral" />
          </div>
        </Card>
      </div>

      {/* Right: WebGL Cross-Stream + Honest Technical Boundaries */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.hairline}`,
          borderRadius: 18,
          padding: '22px 26px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '100%',
        }}
      >
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FF.mono, fontSize: 13, fontWeight: 700, color: C.ink }}>
            DUAL-STREAM INTERSECTION MODEL
          </span>
          <Tag label="WebGL Realtime Visualization" tone="violet" />
        </div>

        <CrossStreamWebGL variant="runtime" width={680} height={350} />

        <div
          style={{
            width: '100%',
            background: C.tint,
            borderRadius: 12,
            padding: '14px 18px',
            border: `1px solid ${C.hairline}`,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
            工程诚实声明（主动纠偏早期口径）：
          </div>
          <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>
            1. <strong>不夸大跨场景 KV Cache 共享</strong>：当前通用 <code>/completion</code> 插槽与跨系统 API 不共享统一物理 KV 前缀；缓存收益严格限定于同会话上下文前缀命中（详见第 6 页）。<br />
            2. <strong>真实遥测标注</strong>：每次评估严格标注 <code>provider_reported</code> / <code>local_rule_zero</code> / <code>estimated</code>，绝不把模拟数值伪装为云端账单。
          </div>
        </div>
      </div>
    </div>
  </SlideShell>
);

/* ==========================================================================
   P5: 商业模式与客户阶梯（Business Model & 8-Element BMC）
   ========================================================================== */
const Page5BusinessModel: Page = () => (
  <SlideShell
    pageNo="05"
    eyebrow="BUSINESS MODEL & 8-ELEMENT BMC"
    title="商业闭环：高痛点单场破冰，再以长期记忆与订阅放大留存"
    subtitle="所有定价与转化档位均明确标注为 [商业假设 — 尚无已验证付费营收]；精准避开低频强推月卡的高流失陷阱。"
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, height: '100%', justifyContent: 'space-between' }}>
      {/* Row 1: P1->P2->P3 + 4 Pricing Hypotheses */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.08fr 1.32fr', gap: 22, flex: 1 }}>
        {/* Left: Target Customers */}
        <Card style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} accent="amber">
          <div>
            <div style={{ fontFamily: FF.mono, fontSize: 12.5, fontWeight: 700, color: C.amber, marginBottom: 14 }}>
              PRIORITIZED SEGMENTS · 优先级客户递进
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { p: 'P1 首批破冰', who: 'OPC 一人公司主理人 / 创业者 / 独立顾问', why: '融资路演、关键提案容错极低，一人身兼数职决策极短，愿为高风险临场保驾护航付费' },
                { p: 'P2 刚需扩散', who: '高校硕博研究生 / 科研汇报人 / 竞赛队员', why: '开题与毕业答辩学术术语密集、最怕评委交叉追问与数值出错，答辩季传播效应强' },
                { p: 'P3 生态复购', who: '企业讲师 / 技术布道者 / 解决方案团队', why: '月度多场次高频汇报，最看重长期审批记忆沉淀与跨团队口径一致' },
              ].map((row) => (
                <div key={row.p} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14.5 }}>
                  <Tag label={row.p} tone="amber" />
                  <div>
                    <div style={{ fontWeight: 700, color: C.ink }}>{row.who}</div>
                    <div style={{ color: C.muted, fontSize: 13.5, marginTop: 2, lineHeight: 1.45 }}>{row.why}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: C.tint, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.muted }}>
            切入原则：先抓决策最快、单场痛点最重的 P1/P2，靠 <strong>Event 单场包</strong> 破冰后再向 Pro 订阅转换。
          </div>
        </Card>

        {/* Right: Pricing Hypotheses */}
        <Card style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} accent="violet">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontFamily: FF.mono, fontSize: 12.5, fontWeight: 700, color: C.violet }}>
                PRICING HYPOTHESES · 分层商业定价假设
              </span>
              <Tag label="商业假设 · 沙盒契约尚未收单" tone="violet" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                {
                  tier: metricsData.pricing.free.name,
                  price: metricsData.pricing.free.price,
                  sub: '体验验证护栏',
                  desc: '每月限 2 场×10m 云端 ASR；完整体验 Focus/Inspector 与 L0–L3 机制，防止免费刷爆算力',
                  highlight: false,
                },
                {
                  tier: metricsData.pricing.event.name,
                  price: metricsData.pricing.event.price,
                  sub: `锚点 ¥${metricsData.pricing.event.anchor} · 单场包`,
                  desc: '14 天单事件有效期：120m 云端 ASR 彩排 + 正式临场高精度引导 + 复盘报告',
                  highlight: true,
                },
                {
                  tier: metricsData.pricing.pro.name,
                  price: metricsData.pricing.pro.price,
                  sub: `年付 ${metricsData.pricing.pro.annual}`,
                  desc: '每月 240m 云端 ASR + 无限次讲稿编译 + 审批个人记忆库长期沉淀与跨场对比',
                  highlight: true,
                },
                {
                  tier: metricsData.pricing.team.name,
                  price: metricsData.pricing.team.price,
                  sub: metricsData.pricing.team.tag,
                  desc: '共享产品/学术口径包 + 团队管理员复盘统计 + 多场景适配器（Teaching/Sales）',
                  highlight: false,
                },
              ].map((p) => (
                <div
                  key={p.tier}
                  style={{
                    background: p.highlight ? C.tintWarm : C.tint,
                    border: `1px solid ${p.highlight ? 'rgba(232,122,36,0.35)' : C.hairline}`,
                    borderRadius: 12,
                    padding: '14px 13px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 225,
                  }}
                >
                  <div>
                    <div style={{ fontFamily: FF.mono, fontSize: 12.5, fontWeight: 700, color: p.highlight ? C.amber : C.muted }}>
                      {p.tier}
                    </div>
                    <div className="cuex-tabular" style={{ fontSize: 22, fontWeight: 800, marginTop: 8, color: C.ink }}>
                      {p.price}
                    </div>
                    <div style={{ fontSize: 12.5, color: C.violet, fontWeight: 700, marginTop: 4 }}>{p.sub}</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10, lineHeight: 1.48 }}>{p.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: C.tintViolet, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.ink }}>
            <strong>转化与沙盒边界：</strong>月购 2 次 <code>Event</code> 即可平滑升级 <code>Pro</code>；服务端已建 <code>UsageLedger / Entitlement</code> 沙盒契约，暂未接入实单支付。
          </div>
        </Card>
      </div>

      {/* Row 2: Compact 8-Element BMC Grid */}
      <Card style={{ padding: '18px 24px' }}>
        <div style={{ fontFamily: FF.mono, fontSize: 12.5, fontWeight: 700, color: C.ink, marginBottom: 12 }}>
          8-ELEMENT BUSINESS MODEL CANVAS · 八要素商业闭环总览（完整明细见独立 A4 商业画布 PDF）
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[
            { k: '1. 目标客户', v: 'P1 OPC 主理人/创业者 → P2 硕博答辩生 → P3 专业讲师团队' },
            { k: '2. 客户痛点', v: '背死稿僵硬、传统提词器遇问答失灵、聊天 AI 长文本强打断注意力' },
            { k: '3. 价值主张', v: '最小必要干预（L0–L3）+ 原文 Evidence 防幻觉 + 接回即自动撤回' },
            { k: '4. 交付成果', v: '讲前文档编译包 + 台上 Focus/Inspector 视图 + 赛后 V=H−λI 复盘与审批记忆' },
            { k: '5. 定价假设', v: 'Free ¥0 限额体验 → Event ¥19–39 单场破冰 → Pro ¥59/月主力 → Team 规划' },
            { k: '6. 成本结构', v: '完整计入文档/ASR/S1/S2/Cache/检索/复盘/基建/微信支付宝分渠道与退款/活跃免费补贴 10 项' },
            { k: '7. 获客渠道', v: '路演与黑客松现场实机传播切片 + 答辩季高校与 OPC 社群模板包分发' },
            { k: '8. 竞争壁垒', v: '抑制型认知门控 + 讲前原文绑定闭环 + 人工审批个人表达记忆飞轮' },
          ].map((item) => (
            <div key={item.k} style={{ background: C.tint, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.hairline}` }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.amber }}>{item.k}</div>
              <div style={{ fontSize: 13.5, color: C.ink, marginTop: 5, lineHeight: 1.45 }}>{item.v}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </SlideShell>
);

/* ==========================================================================
   P6: 单位经济与 10 项全成本透明模型（Unit Economics）
   ========================================================================== */
const Page6UnitEconomics: Page = () => {
  const { conservative, base, optimistic } = metricsData.scenarios;
  const ev = metricsData.eval;

  return (
    <SlideShell
      pageNo="06"
      eyebrow="HONEST UNIT ECONOMICS · 10-COMPONENT COST MODEL"
      title="推翻“95.9% 虚高毛利”旧口径：十项全链路成本模型"
      subtitle={`诚实区分 [本地离线规则 Eval：${ev.tokensPerSession} tokens · ${ev.s1EvaluationsPerSession} 次确定性规则拦截] 与 [云端生产 25m/场建模：约 ${(ev.modeledCloudTokensPerSession / 1000).toFixed(1)}K tokens + 全量流式 ASR]。`}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1.15fr', gap: 22, height: '100%' }}>
        {/* Left: 10 Cost Components */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} accent="amber">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontFamily: FF.mono, fontSize: 12, fontWeight: 700, color: C.amber }}>
                BASE SCENARIO · 基准情景 10 项成本拆分（¥/场 或 ¥/月）
              </span>
              <Tag label="已纠偏：不隐藏非 Token 成本" tone="sage" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {metricsData.costComponents10.map((c) => {
                const val =
                  typeof (c as { baseSession?: number }).baseSession === 'number'
                    ? `¥${(c as { baseSession: number }).baseSession.toFixed(3)}/场`
                    : `¥${(c as { baseMonthly?: number }).baseMonthly?.toFixed(2)}/月`;
                return (
                  <div
                    key={c.id}
                    style={{
                      background: C.tint,
                      borderRadius: 8,
                      padding: '8px 11px',
                      border: `1px solid ${C.hairline}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: C.muted }}>{c.shareNote}</div>
                    </div>
                    <div
                      className="cuex-tabular"
                      style={{
                        fontFamily: FF.mono,
                        fontSize: 13,
                        fontWeight: 700,
                        color: c.id === 5 ? C.sage : c.id === 2 || c.id === 10 ? C.rust : C.ink,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {val}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              marginTop: 10,
              background: C.tintWarm,
              borderRadius: 10,
              padding: '12px 16px',
              border: `1px solid rgba(232,122,36,0.3)`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              fontSize: 13.5,
            }}
          >
            <div>
              <strong>核心成本真相：</strong>纯 LLM 费用仅占单场全变动成本{' '}
              <span className="cuex-tabular" style={{ fontFamily: FF.mono, fontWeight: 700, color: C.amber }}>
                {((base.llmCostPerSession / base.fullVarCostPerSession) * 100).toFixed(1)}%
              </span>
              ，流式 ASR 与云基建/免费补贴才是主要支出。
            </div>
            <span className="cuex-tabular" style={{ fontFamily: FF.mono, fontWeight: 800, color: C.ink, whiteSpace: 'nowrap' }}>
              全变动成本 ¥{base.fullVarCostPerSession.toFixed(3)}/场
            </span>
          </div>
        </Card>

        {/* Right: 3 Scenarios Comparison + KPI Metrics */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} accent="violet">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontFamily: FF.mono, fontSize: 12, fontWeight: 700, color: C.violet }}>
                CONSERVATIVE / BASE / OPTIMISTIC · 三情景盈利校验
              </span>
              <span style={{ fontFamily: FF.mono, fontSize: 12, color: C.subtle }}>
                Pro 月订 ¥59 · Event 锚点 ¥29
              </span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.ink}`, textAlign: 'left', color: C.muted }}>
                  <th style={{ padding: '7px 6px' }}>会计口径指标</th>
                  <th style={{ padding: '7px 6px' }}>保守</th>
                  <th style={{ padding: '7px 6px', color: C.amber }}>基准 (Base)</th>
                  <th style={{ padding: '7px 6px' }}>乐观</th>
                </tr>
              </thead>
              <tbody className="cuex-tabular" style={{ fontFamily: FF.mono }}>
                {[
                  ['月频次 × 时长 / ASR单价', `${conservative.sessionsPerMo}×${conservative.durationMin}m / ¥${conservative.asrRatePerHr}`, `${base.sessionsPerMo}×${base.durationMin}m / ¥${base.asrRatePerHr}`, `${optimistic.sessionsPerMo}×${optimistic.durationMin}m / ¥${optimistic.asrRatePerHr}`],
                  ['单场纯 LLM 成本 (LLM Cost)', `¥${conservative.llmCostPerSession.toFixed(3)}`, `¥${base.llmCostPerSession.toFixed(3)}`, `¥${optimistic.llmCostPerSession.toFixed(3)}`],
                  ['单场全变动成本 (Full Var)', `¥${conservative.fullVarCostPerSession.toFixed(3)}`, `¥${base.fullVarCostPerSession.toFixed(3)}`, `¥${optimistic.fullVarCostPerSession.toFixed(3)}`],
                  ['Pro 月变动总成本 (含补贴)', `¥${conservative.proMonthlyVarCost.toFixed(2)}`, `¥${base.proMonthlyVarCost.toFixed(2)}`, `¥${optimistic.proMonthlyVarCost.toFixed(2)}`],
                  ['Pro 月直接贡献 (Direct Contrib)', `¥${conservative.proDirectContrib.toFixed(2)}`, `¥${base.proDirectContrib.toFixed(2)}`, `¥${optimistic.proDirectContrib.toFixed(2)}`],
                  ['Pro 直接贡献率 (含免费摊销)', `${conservative.proDirectMarginPct.toFixed(1)}%`, `${base.proDirectMarginPct.toFixed(1)}%`, `${optimistic.proDirectMarginPct.toFixed(1)}%`],
                  ['Pro SaaS 毛利率 (不含CAC补贴)', `${conservative.proSaasMarginPct.toFixed(1)}%`, `${base.proSaasMarginPct.toFixed(1)}%`, `${optimistic.proSaasMarginPct.toFixed(1)}%`],
                  ['Event ¥29 单场直接毛利率', `${conservative.eventMarginPct.toFixed(1)}%`, `${base.eventMarginPct.toFixed(1)}%`, `${optimistic.eventMarginPct.toFixed(1)}%`],
                  ['LTV / CAC 与月可承受上限', `${conservative.ltvCac.toFixed(2)}x / ${conservative.maxAffordableSessionsPerProMonth}场`, `${base.ltvCac.toFixed(2)}x / ${base.maxAffordableSessionsPerProMonth}场`, `${optimistic.ltvCac.toFixed(2)}x / ${optimistic.maxAffordableSessionsPerProMonth}场`],
                ].map((r, i) => (
                  <tr
                    key={r[0]}
                    style={{
                      borderBottom: `1px solid ${C.hairline}`,
                      background: i === 5 || i === 6 ? C.tintWarm : undefined,
                    }}
                  >
                    <td style={{ padding: '7px 6px', fontFamily: FF.sans, fontWeight: 600, color: C.ink }}>{r[0]}</td>
                    <td style={{ padding: '7px 6px', color: C.muted }}>{r[1]}</td>
                    <td style={{ padding: '7px 6px', fontWeight: 700, color: C.amber }}>{r[2]}</td>
                    <td style={{ padding: '7px 6px', color: C.sage }}>{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: '保守 直接贡献率', pct: conservative.proDirectMarginPct, color: C.muted },
                { label: '基准 直接贡献率', pct: base.proDirectMarginPct, color: C.amberBright },
                { label: '乐观 直接贡献率', pct: optimistic.proDirectMarginPct, color: C.sage },
              ].map((m) => (
                <div key={m.label} style={{ background: C.tint, borderRadius: 8, padding: '8px 10px', border: `1px solid ${C.hairline}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.muted }}>
                    <span>{m.label}</span>
                    <strong className="cuex-tabular" style={{ fontFamily: FF.mono, color: m.color }}>{m.pct.toFixed(1)}%</strong>
                  </div>
                  <div style={{ height: 6, background: C.card, borderRadius: 4, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, m.pct)}%`, height: '100%', background: m.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                background: C.tint,
                borderRadius: 10,
                padding: '10px 14px',
                border: `1px solid ${C.hairline}`,
                fontSize: 13,
                lineHeight: 1.45,
                color: C.muted,
              }}
            >
              <strong>护栏与未测算声明：</strong><code>Pro</code> 月限 240m 云 ASR（远低于单户月可承受上限 {base.maxAffordableSessionsPerProMonth} 场）+ 超额切本地 Sherpa 兜底；{metricsData.companyBreakeven.statement}，全 {metricsData.sensitivities.length} 项压测见 <code>UNIT_ECONOMICS.md</code>。
            </div>
          </div>
        </Card>
      </div>
    </SlideShell>
  );
};

/* ==========================================================================
   P7: 长期愿景 X（From Presentation Wedge to Universal Moment Copilot）
   ========================================================================== */
const Page7Vision: Page = () => (
  <SlideShell
    pageNo="07"
    eyebrow="LONG-TERM HORIZON · X REPRESENTS ANY MOMENT"
    title="长期愿景 X：演讲只是起点，通用快思考伴随每一次当下对话"
    subtitle="复用同一颗抑制门控与证据记忆内核，向多类高认知密度人际互动场景横向延展，并顺应端侧低打扰介质演进。"
  >
    <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 28, alignItems: 'center', height: '100%' }}>
      {/* Left: Atmospheric WebGL Horizon */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.hairline}`,
          borderRadius: 20,
          padding: 28,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FF.display, fontSize: 32, color: C.ink }}>
            Beyond <span style={{ color: C.amberBright }}>Deep</span> Thinking
          </span>
          <Tag label="Scenario Registry 协议已就绪" tone="violet" />
        </div>

        <CrossStreamWebGL variant="horizon" width={640} height={360} />

        <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { t: '当前 · 阶段一', d: 'Web Focus / Inspector\n旁观极简提示', tone: 'amber' as const },
            { t: '中期 · 阶段二', d: '桌面常驻轻量浮窗\n零切屏全局响应', tone: 'violet' as const },
            { t: '远期 · 阶段三', d: '轻量智能眼镜 / AR HUD\n视线零偏转低扰提示', tone: 'neutral' as const },
          ].map((m) => (
            <div
              key={m.t}
              style={{
                background: C.tint,
                borderRadius: 10,
                padding: '10px 12px',
                border: `1px solid ${C.hairline}`,
              }}
            >
              <Tag label={m.t} tone={m.tone} />
              <div style={{ fontSize: 13, color: C.ink, marginTop: 6, whiteSpace: 'pre-line', lineHeight: 1.4 }}>
                {m.d}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: 4 Scenario Expansion Cards along X */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, height: '100%' }}>
        {[
          {
            badge: '已全面落地 MVP',
            tone: 'amber' as const,
            accent: 'amber' as const,
            title: '01 · Presentation 演讲与答辩',
            desc: '商业路演、学术答辩、产品发布会的文档溯源编译与 L0–L3 自动撤回实机引导。',
            bullets: ['材料抽取：.pptx/.pdf/.md → Evidence[]', '实时双视：Focus 低扰引导 + Inspector 溯源'],
            edge: '商业先发楔子 · 当前唯一可演示落地场景',
          },
          {
            badge: '协议已注册 · 路线图',
            tone: 'violet' as const,
            accent: 'violet' as const,
            title: '02 · Teaching 讲课与教学',
            desc: '面向教师与公开课讲者：监测学生卡点、板书进度偏移与高频易混淆概念微提示。',
            bullets: ['教学结构：教案知识点锚点 + 课堂节奏窗', '防打扰规则：板书连贯讲授期保持 L0 静默'],
            edge: '复用相同 EventBus 与 L0–L3 干预控制内核',
          },
          {
            badge: '协议已注册 · 路线图',
            tone: 'neutral' as const,
            accent: 'none' as const,
            title: '03 · Sales 复杂方案沟通',
            desc: 'B2B 技术售前与顾问对谈：实时核验产品参数边界、承诺口径合规与案例卡片召回。',
            bullets: ['口径防护：禁止超配承诺 · 参数边界强校验', '异议响应：识别客户疑虑并自动拉取依据卡片'],
            edge: '待完成 Presentation 种子验证后开启试点',
          },
          {
            badge: '协议已注册 · 路线图',
            tone: 'neutral' as const,
            accent: 'none' as const,
            title: '04 · Social & Custom 自定义',
            desc: '高压力跨文化会谈、技术面试与个人自定义场景包：沉淀用户审批后的个人表达记忆。',
            bullets: ['社交语境：关键背景人物要点轻量备忘提示', '自定义包：基于 ScenarioAdapter 标准契约扩展'],
            edge: '开放 ScenarioAdapter 插件接口共建',
          },
        ].map((card) => (
          <Card key={card.title} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} accent={card.accent}>
            <div>
              <div style={{ marginBottom: 10 }}>
                <Tag label={card.badge} tone={card.tone} />
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 21, fontWeight: 700, color: C.ink }}>{card.title}</h3>
              <p style={{ margin: '0 0 12px 0', fontSize: 15, lineHeight: 1.5, color: C.muted }}>{card.desc}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {card.bullets.map((b) => (
                  <div key={b} style={{ background: C.tint, borderRadius: 7, padding: '6px 10px', fontSize: 13, color: C.ink }}>
                    • {b}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 10, marginTop: 12, fontSize: 12.5, color: C.subtle }}>
              {card.edge}
            </div>
          </Card>
        ))}
      </div>
    </div>
  </SlideShell>
);

/* ==========================================================================
   P8: 团队、真实当前完成度与计划（Team, Honest Status & Plan）
   ========================================================================== */
const Page8TeamAndStatus: Page = () => {
  const ev = metricsData.eval;
  return (
    <SlideShell
      pageNo="08"
      eyebrow="HONEST DELIVERY STATUS & 90-DAY PLAN"
      title="团队「记性好了一点」· 工程真实完成度与下一步路径"
      subtitle="严格遵守学术与竞赛诚实边界：明确区分赛前原型基础、本次重构交付的已验证系统以及未完成的商业化路线图。"
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 22, height: '100%' }}>
        {/* Left: Honest Implemented vs Planned Split */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} accent="sage">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontFamily: FF.mono, fontSize: 12, fontWeight: 700, color: C.sage }}>
                DELIVERED IN REFACTOR · 本次实机可验证增量
              </span>
              <Tag label="零虚假功能演示" tone="sage" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {[
                ['@cuex/protocol & Universal Runtime', '彻底剥离历史窄领域代码；实现 ContextStore 版本管理、EventBus、SharedCognitiveStateStore 与独立门控 InterventionController。'],
                ['CueX Presentation 编译器与双视图', '打通 .pptx/.pdf/.md/.txt 提取 -> Evidence[] 编译 -> Focus（极简）/ Inspector（透视）双视图与单点彩排闭环。'],
                ['L0–L3 自动撤回 + 探索性复盘与审批记忆', '实装 7 类触发与自动撤回状态机、探索性效用指标 V = H − λI（λ=2 待实测校准）及人工审批/一键擦除 MemoryStore。'],
                ['自动化评测与沙盒计费契约', `eval-presentation.ts 跑通 ${ev.datasetCases}/${ev.datasetCases} 组用例（${ev.precision} 精度 / ${ev.avgLatencyMs}ms）；已落 UsageLedger / Entitlement / PaymentAdapter 沙盒。`],
                ['统一商业源、8要素画布与 10 项审计', `由 cuex-final-metrics.json 单一来源驱动 8 页 BP、A4 说明书、5 态 ASR / 分渠道支付与 ${metricsData.sensitivities.length} 项敏感性验证。`],
              ].map(([k, v]) => (
                <div key={k} style={{ background: C.tint, borderRadius: 10, padding: '12px 15px', border: `1px solid ${C.hairline}` }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>✓ {k}</div>
                  <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12, background: C.tintWarm, border: '1px solid rgba(232,122,36,0.28)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
            <strong>赛前基础透明说明：</strong>团队于 2026-11-01 积累过单领域早期语音对练与底层音频/双系统骨架；本次黑客松期间已完成领域清零重构、通用内核与全部 Presentation 及商业交付升级。
          </div>
        </Card>

        {/* Right: Team, Remaining Boundaries & 90-day Plan */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
          <Card style={{ padding: '18px 22px' }} accent="amber">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: FF.mono, fontSize: 12, fontWeight: 700, color: C.amber }}>
                TEAM · 记性好了一点（OPC 双核工程小组）
              </span>
              <Tag label={metricsData.team.members} tone="neutral" />
            </div>
            <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.55 }}>
              以全栈架构工程 + 认知交互设计为核心能力，独立完成实时协议设计、双系统推理控制、Web 前端渲染与全链路单位经济建模闭环。
            </div>
          </Card>

          <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} accent="violet">
            <div>
              <div style={{ fontFamily: FF.mono, fontSize: 12, fontWeight: 700, color: C.violet, marginBottom: 10 }}>
                EXPLICIT BOUNDARIES &amp; 90-DAY PLAN · 未完成边界与后续计划
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13.5, lineHeight: 1.45 }}>
                <div style={{ background: C.tint, borderRadius: 8, padding: '9px 12px' }}>
                  <strong style={{ color: C.ink }}>1. 当前明确未完成边界：</strong>
                  <span style={{ color: C.muted }}>
                    {metricsData.phase2Boundaries.meteringAndBilling} 多场景（Social/Teaching/Sales/Custom）仅协议注册尚未开发上线。
                  </span>
                </div>
                <div style={{ background: C.tint, borderRadius: 8, padding: '9px 12px' }}>
                  <strong style={{ color: C.ink }}>2. D1–D30（两轮种子验证）：</strong>
                  <span style={{ color: C.muted }}>
                    按 {metricsData.seedCohort.shortLabel} 递进招募 OPC 创始人与答辩生，实测打扰率、V = H − λI 校准与 Event 支付意愿。
                  </span>
                </div>
                <div style={{ background: C.tint, borderRadius: 8, padding: '9px 12px' }}>
                  <strong style={{ color: C.ink }}>3. D31–D90（商业化与浮窗）：</strong>
                  <span style={{ color: C.muted }}>
                    上线 Event / Pro 计费限额与桌面轻量常驻浮窗，启动第二个 ScenarioAdapter（Teaching/Sales）验证。
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 10,
                padding: '10px 14px',
                background: C.ink,
                color: C.bg,
                borderRadius: 10,
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: FF.mono,
                fontSize: 13,
              }}
            >
              <span>CueX — 在深度思考之外，接住当下</span>
              <span style={{ color: '#FF9B42' }}>Thank You · Q&amp;A</span>
            </div>
          </Card>
        </div>
      </div>
    </SlideShell>
  );
};

export const notes: (string | undefined)[] = [
  '【0:00-0:35 P1 品牌定位】介绍「记性好了一点」与 CueX：做在深度思考之外、当下这一秒接住表达者的快思考外挂。首切场景 CueX Presentation 已实机落地。',
  '【0:35-1:10 P2 痛点洞察】点出传统提词器遇问答失灵、聊天式 AI Copilot 盲目铺大段文字导致认知过载与净效用 V = H - 2I 为负，引出 L0-L3 最小必要干预。',
  '【1:10-2:15 P3 首切场景演示】切入 CueX Presentation 三段式：讲前多格式提取 Evidence[] 防幻觉 -> 临场 Focus/Inspector 双视图（平时静默、卡壳锚点、接回即撤回）-> 散场 V = H - λI 复盘与审批记忆。',
  '【2:15-3:00 P4 运行时底座】解释底层 Universal Cognitive Runtime：EventBus + ContextStore + 独立门控 InterventionController，诚实交代不虚构跨槽 KV 共享与三态 ASR 识别标注。',
  '【3:00-3:40 P5 商业模式】P1 OPC 创业者 -> P2 硕博答辩 -> P3 专业团队；说明 Event（¥19-39/场）消除低频包月抗拒、Pro（¥59/月）锁住高频用户及 8 要素画布闭环。',
  '【3:40-4:15 P6 单位经济】主动纠偏过去只算 token 的 95.9% 虚高毛利，展示包含 ASR、基建、微信/支付宝分渠道与退款损耗、活跃免费摊销的 10 项全成本三情景及单户月承受上限（不虚报公司盈亏点）。',
  '【4:15-4:40 P7 长期愿景】说明 X 代表从演讲台向教学、销售、社交扩展，交互从 Web 演进向桌面浮窗与轻量智能眼镜低分心 HUD。',
  '【4:40-5:00 P8 完成度与致谢】坦诚区分 11.01 单领域语音对练基础与本次通用+演讲全链条重构交付，明确未上线营收与计费边界，欢迎评委提问。',
];

export default [
  Page1Brand,
  Page2PainPoints,
  Page3Presentation,
  Page4Runtime,
  Page5BusinessModel,
  Page6UnitEconomics,
  Page7Vision,
  Page8TeamAndStatus,
] satisfies Page[];
