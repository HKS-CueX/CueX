import React from 'react';
import type { ViewKey } from './Navbar';

interface FooterProps {
  onSelectView: (view: ViewKey) => void;
}

export const Footer: React.FC<FooterProps> = ({ onSelectView }) => {
  return (
    <footer className="w-full border-t border-line mt-16 pt-10 pb-10 bg-ground-2/70 text-ink-2 text-xs">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-8 text-ink-2 leading-relaxed">
          <div className="md:col-span-4 space-y-2.5">
            <div className="flex items-center gap-3">
              <img
                src="/brand/cuex-wordmark.svg"
                alt="CueX"
                width="68"
                height="31"
                className="h-7 w-auto block"
              />
              <span className="text-ink font-medium">你的快思考外挂</span>
            </div>
            <p className="text-xs text-ink-3 max-w-sm leading-relaxed">
              在深度思考之外，接住当下。双层并行认知内核与独立干预控制器，服务高压实时沟通。
            </p>
          </div>

          <div className="md:col-span-4 space-y-1.5">
            <strong className="block text-ink font-semibold text-xs">四大核心干预原则</strong>
            <p className="text-xs text-ink-3 leading-relaxed">
              持续理解 · 适时提示 · 最小必要干预 · 主动退出。仅在确认事实依据支撑下分级提示，演讲者自行修正后自动撤回。
            </p>
          </div>

          <div className="md:col-span-4 space-y-1.5">
            <strong className="block text-ink font-semibold text-xs">隐私与透明承诺</strong>
            <p className="text-xs text-ink-3 leading-relaxed">
              所有实机 ASR、本地规则兜底、模型 Token 计量与个人记忆落盘均遵循显式知情同意、真实计数展示与一键会话清除。
            </p>
          </div>
        </div>

        <div className="pt-5 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-ink-3 text-xs">
          <span translate="no">CueX Universal Cognitive Copilot · CueX Presentation</span>
          <div className="flex flex-wrap items-center gap-2 sm:gap-5">
            {(
              [
                ['home', '首页概览'],
                ['compiler', '场前编译'],
                ['stage', '场中协同'],
                ['reflection', '场后复盘'],
              ] as Array<[ViewKey, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onSelectView(key)}
                className="min-h-[36px] px-1.5 inline-flex items-center hover:text-ink hover:underline underline-offset-4"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};
