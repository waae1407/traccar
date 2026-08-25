import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Pass the auth token through on all domains, including custom host storefront
// domains. Without it, auth.me() cannot resolve the logged-in user, so
// authenticated pages (Account, Bookings, Activity) never work on custom
// domains — the user sees a permanent "Sign in" prompt even after logging in.
// requiresAuth: false ensures public entity queries still render without auth,
// and AuthContext.checkUserAuth() clears stale tokens on 401 so a bad token
// doesn't persist across page loads.
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});