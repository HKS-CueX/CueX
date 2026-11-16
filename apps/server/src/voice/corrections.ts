import type { AsrCorrection } from './types';

interface Rule {
  regex: RegExp;
  replacement: string;
}

const compiled = new WeakMap<readonly AsrCorrection[], Rule[]>();

function compile(corrections: readonly AsrCorrection[]): Rule[] {
  const rules: Rule[] = [];
  for (const { pattern, replacement } of corrections) {
    try {
      rules.push({ regex: new RegExp(pattern, 'g'), replacement });
    } catch (error) {
      console.warn(`[voice] ignoring invalid ASR correction ${JSON.stringify(pattern)}: ${(error as Error).message}`);
    }
  }
  return rules;
}

/**
 * Rewrite known technical/term misrecognitions in live speech transcripts, e.g. Q系/kill x -> CueX.
 * Rules run in table order on partials and finals alike without blocking the event loop.
 */
export function correctAsrText(text: string, corrections?: readonly AsrCorrection[]): string {
  if (!text || !corrections?.length) return text;
  let rules = compiled.get(corrections);
  if (!rules) {
    rules = compile(corrections);
    compiled.set(corrections, rules);
  }
  let out = text;
  for (const { regex, replacement } of rules) out = out.replace(regex, replacement);
  return out;
}
