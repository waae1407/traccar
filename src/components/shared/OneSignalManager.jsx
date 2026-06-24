import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

export default function OneSignalManager() {
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const res = await base44.functions.invoke('getOneSignalAppId');
        const appId = res.data?.app_id;
        if (!appId || cancelled) return;
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(function () {
          window.OneSignal.init({ appId, allowLocalhostAsSecureOrigin: true });
        });
      } catch (e) {
        // OneSignal not configured — silently skip
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(function () {
      window.OneSignal.login(user.email);
    });
  }, [user?.email]);

  return null;
}