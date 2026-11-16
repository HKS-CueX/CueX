import React from 'react';
import type { AuthSessionResponse, HealthStatusResponse } from '@cuex/protocol';
import { SlidersHorizontal, UserCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewKey = 'home' | 'compiler' | 'stage' | 'reflection';

interface NavbarProps {
  currentView: ViewKey;
  onSelectView: (view: ViewKey) => void;
  health: HealthStatusResponse | null;
  authSession?: AuthSessionResponse | null;
  onOpenMemory: () => void;
  onOpenAccount: () => void;
  sessionActive?: boolean;
}

const PLAN_BADGE_LABELS: Record<string, string> = {
  free: '免费版',
  event: '单场包',
  pro: '专业版',
  team: '团队版',
};

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onSelectView,
  authSession = null,
  onOpenMemory,
  onOpenAccount,
  sessionActive = false,
}) => {
  const navItems: { key: ViewKey; label: string }[] = [
    { key: 'home', label: '首页' },
    { key: 'compiler', label: '准备讲稿' },
    { key: 'stage', label: '上台演讲' },
    { key: 'reflection', label: '复盘提升' },
  ];

  const rawName = authSession?.user.displayName;
  const accountLabel =
    !rawName || rawName === 'CueX 演示演讲者' ? '我的账户' : rawName;
  const planId = authSession?.usageSummary?.activePlanId ?? 'free';
  const activePlanLabel = PLAN_BADGE_LABELS[planId] ?? planId.toUpperCase();

  return (
    <header className="w-full border-b border-line bg-surface sticky top-0 z-40">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 flex flex-wrap md:flex-nowrap items-center justify-between gap-x-2 lg:gap-x-4 md:h-14">
        {/* Left: Official Wordmark */}
        <div className="order-1 h-12 md:h-auto flex items-center gap-3 min-w-0 shrink-0">
          <button
            type="button"
            onClick={() => onSelectView('home')}
            className="inline-flex items-center gap-2 min-h-[40px] sm:min-h-[36px] text-ink focus-visible:outline-none"
            aria-label="CueX 首页"
          >
            <img
              src="/brand/cuex-wordmark.svg"
              alt="CueX"
              width="64"
              height="29"
              className="cuex-nav-mark h-7 w-auto block shrink-0"
            />
            <span className="sr-only">CueX</span>
          </button>
          <span className="hidden xl:inline-block h-4 w-px bg-line shrink-0" aria-hidden="true" />
          <span className="hidden xl:inline text-xs text-ink-3 whitespace-nowrap">
            你的临场演讲搭档
          </span>
        </div>

        {/* Center: Unified Primary Navigation */}
        <nav
          className="order-3 md:order-2 w-full md:w-auto grid grid-cols-4 md:flex items-center justify-center gap-1 border-t border-line md:border-t-0 py-1 md:py-0"
          aria-label="主导航"
        >
          {navItems.map((item) => {
            const isActive = currentView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                data-testid={`nav-${item.key}`}
                onClick={() => onSelectView(item.key)}
                className={cn(
                  'transition-transform duration-100 relative inline-flex items-center justify-center gap-1 md:gap-1.5 min-h-[44px] md:min-h-0 px-1 md:px-3 lg:px-4 md:h-8 rounded text-xs lg:text-sm whitespace-nowrap active:scale-[0.97]',
                  isActive
                    ? 'bg-ink text-ground font-medium'
                    : 'text-ink-2 hover:bg-ground-2 hover:text-ink'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <span>{item.label}</span>
                {item.key === 'stage' && sessionActive && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-amber shrink-0"
                    title="演讲进行中"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Preferences & Personal Center */}
        <div className="order-2 md:order-3 h-12 md:h-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenMemory}
            data-testid="open-memory-drawer"
            className="cuex-btn inline-flex items-center gap-1.5 px-2.5 min-h-[40px] sm:min-h-0 sm:h-8 rounded border border-line-strong bg-surface hover:bg-ground-2 text-xs text-ink-2 hover:text-ink whitespace-nowrap active:scale-[0.97]"
            title="演讲偏好"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-violet shrink-0" />
            <span className="hidden sm:inline">演讲偏好</span>
          </button>

          <button
            type="button"
            onClick={onOpenAccount}
            data-testid="open-account-drawer"
            className="cuex-btn inline-flex items-center gap-1.5 px-2.5 min-h-[40px] sm:min-h-0 sm:h-8 rounded border border-line-strong bg-surface hover:bg-ground-2 text-xs text-ink-2 hover:text-ink active:scale-[0.97] max-w-[148px] sm:max-w-[192px]"
            title="个人中心与会员方案"
          >
            <UserCircle2 className="w-3.5 h-3.5 text-amber shrink-0" />
            <span className="truncate">{accountLabel}</span>
            <span className="hidden sm:inline px-1.5 py-0.5 rounded-sm bg-ground-2 text-xs text-ink-3 shrink-0 leading-none">
              {activePlanLabel}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
