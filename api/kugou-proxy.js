import { createUpstreamProxy } from './upstream-proxy.js';

export default createUpstreamProxy({
  primaryEnv: 'KUGOU_UPSTREAM_BASE',
  fallbackEnv: 'KUGOU_FALLBACK_BASE',
  primaryDefault: '',
  fallbackDefault: '',
  label: 'kugou',
});
