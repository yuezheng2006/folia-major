import { createUpstreamProxy } from './upstream-proxy.js';

export default createUpstreamProxy({
  primaryEnv: 'QQ_UPSTREAM_BASE',
  fallbackEnv: 'QQ_FALLBACK_BASE',
  primaryDefault: '',
  fallbackDefault: '',
  label: 'qq',
});
