import type { DecisionAnswer, DecisionQuestion } from './types';

export function labelsFor(question: DecisionQuestion): string[] {
  if (question.kind === 'noul') return ['false', 'true'];
  if (question.kind === 'score') return ['0', '1', '2', '3', '4', '5'];
  if (
    question.options.length < 2 ||
    question.options.length > 26 ||
    new Set(question.options).size !== question.options.length ||
    question.options.some((x) => !x.trim())
  ) {
    throw new Error('choice requires 2-26 distinct non-empty options');
  }
  return question.options;
}

export function answerFromWeights(question: DecisionQuestion, weights: number[]): DecisionAnswer {
  const labels = labelsFor(question);
  if (weights.length !== labels.length || weights.some((x) => !Number.isFinite(x) || x < 0)) {
    throw new Error('Invalid decision probabilities');
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error('Decision probabilities have zero mass');
  const probabilities = Object.fromEntries(labels.map((label, i) => [label, weights[i] / sum]));
  const sortedProbs = labels.map((label) => probabilities[label]).sort((a, b) => b - a);
  const margin = Number(
    Math.max(0, (sortedProbs[0] ?? 0) - (sortedProbs[1] ?? 0)).toFixed(6),
  );
  const entropy = Number(
    Math.max(
      0,
      sortedProbs.reduce((acc, p) => (p > 1e-12 ? acc - p * Math.log2(p) : acc), 0),
    ).toFixed(6),
  );
  const topIndex = labels.reduce(
    (bestIdx, label, idx) => (probabilities[label] > probabilities[labels[bestIdx]] ? idx : bestIdx),
    0,
  );
  const top = labels[topIndex];
  const value =
    question.kind === 'noul'
      ? probabilities.true
      : question.kind === 'score'
        ? labels.reduce((acc, label) => acc + Number(label) * probabilities[label], 0)
        : probabilities[top];
  return {
    kind: question.kind,
    probabilities,
    value,
    top,
    margin,
    entropy,
    selectedSlot: topIndex,
  };
}
