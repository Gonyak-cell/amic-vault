'use client';

import { useEffect, useState } from 'react';
import { OfflineStatus } from '@/components/pwa/offline-status';
import { shouldReloadSensitiveBfcache } from '@/lib/pwa/cache-policy';

export function PwaRegistration() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const refreshOnlineState = () => setOffline(!window.navigator.onLine);
    const refreshSensitiveBfcache = (event: PageTransitionEvent) => {
      if (shouldReloadSensitiveBfcache(event.persisted, window.location.pathname)) {
        window.location.reload();
      }
    };
    refreshOnlineState();

    window.addEventListener('online', refreshOnlineState);
    window.addEventListener('offline', refreshOnlineState);
    window.addEventListener('pageshow', refreshSensitiveBfcache);

    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    }

    return () => {
      window.removeEventListener('online', refreshOnlineState);
      window.removeEventListener('offline', refreshOnlineState);
      window.removeEventListener('pageshow', refreshSensitiveBfcache);
    };
  }, []);

  return <OfflineStatus offline={offline} />;
}
