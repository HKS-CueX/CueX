import React from 'react';

export type EdgeLightPhase =
  | 'quiet'
  | 'l1_amber'
  | 'l1_violet'
  | 'l2_active'
  | 'withdrawn';

const PHASE_DESCRIPTIONS: Record<EdgeLightPhase, string> = {
  quiet: '',
  l1_amber: 'L1 轻提示：留意当前演讲节奏或关键要点覆盖。',
  l1_violet: 'L1 轻提示：检测到现场问题或已准备事实兜底提示。',
  l2_active: 'L2 关键词提示已触发。',
  withdrawn: '已根据你的表达自动撤回提示。',
};

export function CueEdgeLight({
  phase,
  paused = false,
}: {
  phase: EdgeLightPhase;
  paused?: boolean;
}) {
  return (
    <>
      <div
        className="cue-edge-light"
        data-testid="cue-edge-light"
        data-phase={phase}
        data-paused={paused || undefined}
        aria-hidden="true"
      >
        <div className="cue-edge-light__halo" />
        <div className="cue-edge-light__rim" />
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {PHASE_DESCRIPTIONS[phase]}
      </span>
    </>
  );
}
