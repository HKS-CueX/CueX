import type { PresentationProgressNode } from '@cuex/protocol';
import { computeTermOverlap } from '../../runtime/RetrievalProvider';

const NEXT_CHAPTER_CUE_RE = /(?:下面(?:我们)?进入|接下来(?:讲|看)|第二部分|第三部分|第四部分|下一章|另一方面)/;

export interface PaceAssessment {
  paceStatus: 'on_pace' | 'slightly_fast' | 'slightly_behind' | 'overtime';
  chapterActualSec: number;
  chapterTargetSec: number;
  overtimeSec: number;
}

export function evaluateChapterPace(
  node: PresentationProgressNode,
  chapterStartedAtMs: number,
  now: number,
): PaceAssessment {
  const chapterActualSec = Math.max(0, Math.round((now - chapterStartedAtMs) / 1000));
  const chapterTargetSec = Math.max(15, node.targetDurationSec || 60);
  const ratio = chapterActualSec / chapterTargetSec;

  let paceStatus: PaceAssessment['paceStatus'] = 'on_pace';
  if (chapterActualSec > chapterTargetSec + 10) {
    paceStatus = 'overtime';
  } else if (ratio > 0.92) {
    paceStatus = 'slightly_behind';
  } else if (chapterActualSec < chapterTargetSec * 0.35 && node.keyPoints.every((kp) => kp.covered)) {
    paceStatus = 'slightly_fast';
  }

  return {
    paceStatus,
    chapterActualSec,
    chapterTargetSec,
    overtimeSec: Math.max(0, chapterActualSec - chapterTargetSec),
  };
}

export function matchChapterKeyPoints(
  text: string,
  node: PresentationProgressNode,
  now: number,
): string[] {
  const newlyCovered: string[] = [];
  for (const kp of node.keyPoints) {
    if (kp.covered) continue;
    const overlap = computeTermOverlap(text, kp.label);
    if (overlap.matchedDistinct >= 2 || overlap.ratio >= 0.34) {
      kp.covered = true;
      kp.coveredAtMs = now;
      newlyCovered.push(kp.id);
    }
  }
  return newlyCovered;
}

export function detectNextChapterTransition(
  text: string,
  nodes: readonly PresentationProgressNode[],
  activeIndex: number,
): number | undefined {
  if (activeIndex < 0 || activeIndex >= nodes.length - 1) return undefined;
  const nextNode = nodes[activeIndex + 1];
  const explicitCue = NEXT_CHAPTER_CUE_RE.test(text);
  const titleMatch = computeTermOverlap(text, nextNode.title);
  const kpMatch = nextNode.keyPoints.some(
    (kp) => computeTermOverlap(text, kp.label).matchedDistinct >= 2,
  );

  if ((explicitCue && (titleMatch.matchedDistinct >= 1 || kpMatch)) || (titleMatch.matchedDistinct >= 2 && kpMatch)) {
    return activeIndex + 1;
  }
  return undefined;
}
