'use client';

import { useState, useEffect } from 'react';
import { Download, X, Share, Smartphone, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function getIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

function getIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

export function PWAInstallPrompt() {
  // All of this is decided by the device and by what is already in storage —
  // none of it changes while the component is alive. Working it out once, as
  // the initial state, keeps it out of the effect: reading it there and calling
  // setState costs an extra render on every mount, which is what
  // react-hooks/set-state-in-effect objects to.
  //
  // The initialiser only runs on the client. On the server it returns the
  // "show nothing" shape, and hydration replaces it with the real answer.
  const [initial] = useState(() => {
    if (typeof window === 'undefined') {
      return { installed: false, ios: false, firstVisit: false, eligible: false };
    }
    if (getIsStandalone()) {
      return { installed: true, ios: false, firstVisit: false, eligible: false };
    }

    const dismissCount = parseInt(localStorage.getItem('pwa-install-dismiss-count') || '0', 10);
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    const recentlyDismissed =
      Boolean(dismissed) && Date.now() - parseInt(dismissed as string, 10) < 24 * 60 * 60 * 1000;

    return {
      installed: false,
      ios: getIsIOS(),
      firstVisit: !localStorage.getItem('pwa-install-first-visit'),
      eligible: dismissCount < 5 && !recentlyDismissed,
    };
  });

  // The event can fire before this component mounts; Providers stashes it on
  // window. Read it here rather than in the effect — reading is idempotent, so
  // StrictMode's double-invoked initialiser is harmless. The effect below is
  // what clears it, since clearing is a write to an external system.
  const [cachedPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window === 'undefined'
      ? null
      : (((window as any).__pwaInstallEvent as BeforeInstallPromptEvent | undefined) ?? null)
  );

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(cachedPrompt);
  // iOS never fires beforeinstallprompt, so for iOS the instructions are the
  // prompt, and they can be shown straight away.
  const [showPrompt, setShowPrompt] = useState(
    initial.eligible && (initial.ios || Boolean(cachedPrompt))
  );
  const [isInstalled, setIsInstalled] = useState(initial.installed);
  const isIOS = initial.ios;
  const isFirstVisit = initial.firstVisit;

  useEffect(() => {
    // What is left here is genuinely a subscription: setState inside these
    // callbacks is fine, because it answers an outside event rather than
    // cascading off this render.
    if (!initial.eligible || initial.ios) return;

    // Consume the stash: the initial state above already read it.
    (window as any).__pwaInstallEvent = null;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [initial.eligible, initial.ios]);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setShowPrompt(false);
    setDeferredPrompt(null);
    localStorage.setItem('pwa-install-first-visit', 'true');
  }

  function handleDismiss() {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    localStorage.setItem('pwa-install-first-visit', 'true');
    const count = parseInt(localStorage.getItem('pwa-install-dismiss-count') || '0', 10);
    localStorage.setItem('pwa-install-dismiss-count', (count + 1).toString());
  }

  if (!showPrompt || isInstalled) return null;

  // iOS instructions content
  const iosContent = (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Install Hylink EMS</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Add this app to your home screen for the best experience.
          </p>
        </div>
      </div>
      <div className="space-y-3 pl-1">
        <div className="flex items-center gap-3 text-sm">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <Share className="h-4 w-4 text-blue-600" />
          </div>
          <span>Tap the <strong>Share</strong> button in Safari</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <Plus className="h-4 w-4 text-blue-600" />
          </div>
          <span>Scroll down and tap <strong>Add to Home Screen</strong></span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <Download className="h-4 w-4 text-green-600" />
          </div>
          <span>Tap <strong>Add</strong> to install</span>
        </div>
      </div>
      <Button variant="ghost" onClick={handleDismiss} className="w-full text-slate-500">
        Got it
      </Button>
    </div>
  );

  // Android/Desktop install content
  const installContent = (
    <div className="flex items-start gap-3">
      <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
        <Download className="h-5 w-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-slate-900">Install Hylink EMS</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Install the app for faster access, offline support, and push notifications.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" onClick={handleInstall} className="h-8 text-xs">
            Install App
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-8 text-xs text-slate-500">
            Not now
          </Button>
        </div>
      </div>
      <button onClick={handleDismiss} className="text-slate-400 hover:text-slate-600 shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  // First visit: show as a centered dialog
  if (isFirstVisit) {
    return (
      <Dialog open={showPrompt} onOpenChange={(open) => !open && handleDismiss()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <Download className="h-4 w-4 text-white" />
              </div>
              Install Hylink Finance EMS
            </DialogTitle>
            <DialogDescription>
              Get the full app experience with offline support, push notifications, and quick access from your home screen.
            </DialogDescription>
          </DialogHeader>
          {isIOS ? (
            <div className="space-y-3 mt-2">
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Share className="h-4 w-4 text-blue-600" />
                  </div>
                  <span>Tap the <strong>Share</strong> button in Safari</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Plus className="h-4 w-4 text-blue-600" />
                  </div>
                  <span>Scroll down and tap <strong>Add to Home Screen</strong></span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <Download className="h-4 w-4 text-green-600" />
                  </div>
                  <span>Tap <strong>Add</strong> to confirm</span>
                </div>
              </div>
              <Button variant="outline" onClick={handleDismiss} className="w-full">
                Got it
              </Button>
            </div>
          ) : (
            <div className="flex gap-3 mt-2">
              <Button onClick={handleInstall} className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Install App
              </Button>
              <Button variant="outline" onClick={handleDismiss}>
                Not now
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // Subsequent visits: show as a bottom banner
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-xl border bg-white shadow-lg p-4">
        {isIOS ? iosContent : installContent}
      </div>
    </div>
  );
}
