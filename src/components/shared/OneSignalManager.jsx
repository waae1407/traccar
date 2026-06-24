import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function OneSignalManager() {
  const { user } = useAuth();

  // OneSignal.init() is called from index.html with the appId.
  // This component only tags the logged-in user's email for targeted push.

  useEffect(() => {
    if (!user?.email) return;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(function () {
      window.OneSignal.login(user.email);
    });
  }, [user?.email]);

  return null;
}