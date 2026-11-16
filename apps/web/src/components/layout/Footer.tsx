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
              <span className="text-ink font-medium">你的临场演讲搭档</span>
            </div>
            <p className="text-xs text-ink-3 max-w-sm leading-relaxed">
              在深度思考之外，接住当下。顺畅表达时保持安静，只在卡顿、漏讲或追问瞬间给出余光可读的简短提示。
            </p>
          </div>

          <div className="md:col-span-4 space-y-1.5">
            <strong className="block text-ink font-semibold text-xs">克制而可靠的提词体验</strong>
            <p className="text-xs text-ink-3 leading-relaxed">
              不用低头逐行读稿，不打断现场眼神交流；所有数字与要点均来自你准备的讲稿材料，接回主线后提示自动收起。
            </p>
          </div>

          <div className="md:col-span-4 space-y-1.5">
            <strong className="block text-ink font-semibold text-xs">隐私由你掌控</strong>
            <p className="text-xs text-ink-3 leading-relaxed">
              仅在演讲期间倾听语流，个人演讲习惯经你确认后才会保存，支持随时导出讲稿复盘或一键清空记录。
            </p>
          </div>
        </div>

        <div className="pt-5 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-ink-3 text-xs">
          <span translate="no">CueX Presentation</span>
          <div className="flex flex-wrap items-center gap-2 sm:gap-5">
            {(
              [
                ['home', '首页'],
                ['compiler', '准备讲稿'],
                ['stage', '上台演讲'],
                ['reflection', '复盘提升'],
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
