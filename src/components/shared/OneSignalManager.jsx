import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function OneSignalManager() {
  const { user } = useAuth();

  // OneSignal.init() is called from index.html with the appId.
  // This component only tags the logged-in user's email for targeted push.

  useEffect(() => {
    if (!user?.email) return;
    // OneSignal is only initialized on canonical (uridehub.com) domains —
    // skip tagging on custom host storefront domains.
    const host = window.location.hostname.toLowerCase();
    const isCanonical = host === "uridehub.com" || host === "www.uridehub.com" ||
                        host === "localhost" || host === "127.0.0.1";
    if (!isCanonical) return;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(function () {
      window.OneSignal.login(user.email);
    });
  }, [user?.email]);

  return null;
}