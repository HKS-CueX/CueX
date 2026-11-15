import React from 'react';
import type { HealthStatusResponse } from '@cuex/protocol';
import { Database, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewKey = 'home' | 'compiler' | 'stage' | 'reflection';

interface NavbarProps {
  currentView: ViewKey;
  onSelectView: (view: ViewKey) => void;
  health: HealthStatusResponse | null;
  onOpenMemory: () => void;
  sessionActive?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onSelectView,
  health,
  onOpenMemory,
  sessionActive = false,
}) => {
  const navItems: { key: ViewKey; label: string; sub?: string }[] = [
    { key: 'home', label: '首页概览' },
    { key: 'compiler', label: '场前编译' },
    { key: 'stage', label: '场中协同' },
    { key: 'reflection', label: '场后复盘' },
  ];

  const runtimeLabel = health
    ? health.system1.mode === 'real' || health.system2.mode === 'real'
      ? '实时 LLM 引擎'
      : '本地规则引擎'
    : '后端检测中';

  return (
    <header className="w-full border-b border-line bg-surface/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onSelectView('home')}
            className="flex items-center gap-2.5 text-ink hover:opacity-85 transition-opacity"
            aria-label="CueX 首页"
          >
            <img
              src="/brand/cuex-symbol-dimensional.svg"
              width="26"
              height="26"
              alt=""
              className="cuex-nav-mark shrink-0"
            />
            <span
              className="font-display text-2xl tracking-tight text-ink leading-none"
              translate="no"
            >
              Cue<span className="text-amber font-serif not-italic font-semibold">X</span>
            </span>
          </button>
          <span className="hidden md:inline-block h-4 w-px bg-line" aria-hidden="true" />
          <span className="hidden md:inline text-xs text-ink-3 truncate">
            你的快思考外挂 · CueX Presentation
          </span>
        </div>

        <nav className="flex items-center gap-1" aria-label="主导航">
          {navItems.map((item) => {
            const isActive = currentView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                data-testid={`nav-${item.key}`}
                onClick={() => onSelectView(item.key)}
                className={cn(
                  'relative px-3 py-1.5 text-xs sm:text-sm rounded transition-colors whitespace-nowrap flex items-center gap-1.5',
                  isActive
                    ? 'bg-ink text-ground font-medium'
                    : 'text-ink-2 hover:bg-ground-2 hover:text-ink'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <span>{item.label}</span>
                {item.key === 'stage' && sessionActive && (
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      isActive ? 'bg-amber' : 'bg-amber animate-pulse'
                    )}
                    title="场中会话进行中"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-line bg-ground text-[11px] text-ink-2"
            title={health ? `ASR: ${health.asr.detail}` : '等待健康检查'}
            data-testid="nav-health-badge"
          >
            <Activity
              className={cn(
                'w-3 h-3',
                health?.ok ? 'text-resolved' : 'text-ink-3'
              )}
            />
            <span>{runtimeLabel}</span>
          </div>

          <button
            type="button"
            onClick={onOpenMemory}
            data-testid="open-memory-drawer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-line bg-surface hover:bg-ground-2 text-[11px] text-ink-2 hover:text-ink transition-colors"
          >
            <Database className="w-3 h-3 text-violet" />
            <span>个人记忆治理</span>
          </button>
        </div>
      </div>
    </header>
  );
};
