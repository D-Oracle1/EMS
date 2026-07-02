'use client';

import { useEffect } from 'react';

/**
 * Forces the PWA to pick up new deployments instead of getting stuck on the
 * old cached app. The service worker uses skipWaiting + clientsClaim, so a new
 * build activates immediately; here we reload the page once when that happens
 * and proactively check for updates when the app regains focus.
 */
export function ServiceWorkerUpdater() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // Only auto-reload if a SW was already controlling this page (i.e. a genuine
    // update, not the very first install) — avoids a reload on first visit.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;

    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // Ask the browser to re-check for a new service worker when the user comes
    // back to the app (installed PWAs otherwise only check occasionally).
    const checkForUpdate = () => {
      navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', onVisible);
    // One check shortly after load too.
    const t = setTimeout(checkForUpdate, 3000);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('focus', checkForUpdate);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(t);
    };
  }, []);

  return null;
}
