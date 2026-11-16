/**
 * Unified System 2 configuration bridge.
 * Legacy pi-ai / ~/.prime/agent/models.json loading has been replaced by central CPA routing.
 */
export {
  DEFAULT_CPA_SYSTEM2_MODEL,
  resolveCpaConfig,
  type CpaConfigOptions,
  type CpaResolvedConfig,
} from '../runtime/providers/CpaProviderAdapter';
