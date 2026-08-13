import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// On custom host storefront domains, don't send the auth token. The storefront
// is a public page — a stale/expired token from a previous login on this domain
// causes 401s on every API call, which blocks rendering (white screen). Public
// entity queries work without auth. User state is resolved separately by
// AuthContext (which also skips me() on custom domains).
const _hostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
const _isCustomDomain = !["localhost", "127.0.0.1", "uridehub.com", "www.uridehub.com"].includes(_hostname)
  && !_hostname.includes("base44");

export const base44 = createClient({
  appId,
  token: _isCustomDomain ? null : token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});