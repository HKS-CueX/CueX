export { ScenarioRegistry, ScenarioNotImplementedError } from './ScenarioRegistry';
export { extractPresentationDocument } from './presentation/DocumentExtractor';
export { compilePresentationPack } from './presentation/PresentationCompiler';
export {
  PresentationPackStore,
  toPackSummary,
  toUniversalContextPack,
} from './presentation/PresentationPackStore';
export { PresentationRuntimePlugin } from './presentation/PresentationRuntime';
export { computeUtilitySummary, buildPresentationReflection } from './presentation/PresentationReflection';
export {
  SAMPLE_PACK_ID,
  SAMPLE_PRESENTATION_PACK,
  SAMPLE_ASR_CORRECTIONS,
} from './presentation/samplePack';
