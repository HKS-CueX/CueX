import React from 'react';
import type { ViewKey } from './Navbar';

interface FooterProps {
  onSelectView: (view: ViewKey) => void;
}

export const Footer: React.FC<FooterProps> = ({ onSelectView }) => {
  return (
    <footer className="w-full border-t border-line mt-16 pt-8 pb-10 bg-ground-2/60 text-ink-2 text-xs">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 text-ink-3 leading-relaxed">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-ink font-semibold">
              <img src="/brand/cuex-symbol-dimensional.svg" width="16" height="16" alt="" />
              <span>CueX · 你的快思考外挂</span>
            </div>
            <p className="text-[11px]">
              在深度思考之外，接住当下。双层并行认知内核与独立干预控制器，服务高压实时沟通。
            </p>
          </div>

          <div className="space-y-1">
            <strong className="block text-ink font-semibold">四大核心干预原则</strong>
            <p className="text-[11px]">
              持续理解 · 适时提示 · 最小必要干预 · 主动退出。仅在确认事实依据支撑下分级提示，演讲者自行修正后自动撤回。
            </p>
          </div>

          <div className="space-y-1">
            <strong className="block text-ink font-semibold">隐私与透明承诺</strong>
            <p className="text-[11px]">
              所有实机 ASR、本地/远端模型用量与个人记忆落盘均遵循显式知情同意、真实计数展示与一键会话清除。
            </p>
          </div>
        </div>

        <div className="pt-5 border-t border-line flex flex-wrap items-center justify-between gap-4 text-ink-3 text-[11px]">
          <span translate="no">CueX Universal Cognitive Copilot · CueX Presentation</span>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => onSelectView('home')} className="hover:text-ink hover:underline">
              首页概览
            </button>
            <button type="button" onClick={() => onSelectView('compiler')} className="hover:text-ink hover:underline">
              场前编译
            </button>
            <button type="button" onClick={() => onSelectView('stage')} className="hover:text-ink hover:underline">
              场中协同
            </button>
            <button type="button" onClick={() => onSelectView('reflection')} className="hover:text-ink hover:underline">
              场后复盘
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
