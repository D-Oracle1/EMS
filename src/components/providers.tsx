'use client';

import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';

// Cache the beforeinstallprompt event globally so PWAInstallPrompt can access it
// even if it mounts after the event fires
function useGlobalInstallPromptCatcher() {
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      (window as any).__pwaInstallEvent = e;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useGlobalInstallPromptCatcher();
  return <SessionProvider>{children}</SessionProvider>;
}
