'use client';

import { useEffect, useState } from 'react';
import { OfflineStatus } from '@/components/pwa/offline-status';

export function PwaRegistration() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const refreshOnlineState = () => setOffline(!window.navigator.onLine);
    refreshOnlineState();

    window.addEventListener('online', refreshOnlineState);
    window.addEventListener('offline', refreshOnlineState);

    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    }

    return () => {
      window.removeEventListener('online', refreshOnlineState);
      window.removeEventListener('offline', refreshOnlineState);
    };
  }, []);

  return <OfflineStatus offline={offline} />;
}
