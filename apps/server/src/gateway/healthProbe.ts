import { loadServerConfig } from '../config';
import { createFastDecisionProvider, createSlowReasoningProvider } from '../runtime';
import { createAsrEngine, describeAsrCapability } from '../voice';

const config = loadServerConfig();
const fast = createFastDecisionProvider(config.system1Mode);
const slow = createSlowReasoningProvider(config.system2Mode);
const asr = createAsrEngine();

const [s1, s2, asrStatus] = await Promise.all([
  fast.health(),
  slow.health(),
  describeAsrCapability(asr),
]);

console.log('[healthProbe] System 1:', fast.backend, fast.mode, s1);
console.log('[healthProbe] System 2:', slow.backend, slow.mode, s2);
console.log('[healthProbe] ASR:', asrStatus.backend, asrStatus.mode, asrStatus.detail);

if (!s1.ok || !s2.ok) {
  process.exitCode = 1;
}
