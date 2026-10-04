'use client';

import { useEffect } from 'react';

/**
 * Keeps the installed app fullscreen on Android phones.
 *
 * The manifest asks for `display: fullscreen`, which hides the status and
 * navigation bars, and a swipe shows them only for a moment. But a phone that
 * installed the app before that setting (or whose launcher ignores it) opens
 * it with the bars showing, and leaving fullscreen with the back gesture
 * keeps them showing. In either case the next tap anywhere asks for
 * fullscreen again. Browsers only grant fullscreen in answer to a tap, so
 * this is as automatic as the web allows.
 *
 * Only in the installed app, only on touch screens (a desktop window must
 * never jump to fullscreen on a click), and not on iPhone or iPad, where
 * Apple gives home-screen apps no way to hide the status bar at all.
 */
export function PwaFullscreen() {
  useEffect(() => {
    const installed = ['fullscreen', 'standalone', 'minimal-ui'].some(
      (mode) => window.matchMedia(`(display-mode: ${mode})`).matches
    );
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const apple =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const root = document.documentElement;
    if (!installed || !touch || apple || typeof root.requestFullscreen !== 'function') return;

    const needsFullscreen = () =>
      !document.fullscreenElement && !window.matchMedia('(display-mode: fullscreen)').matches;

    const enter = () => {
      if (!needsFullscreen()) return;
      root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        // Refused (no gesture credit, or the browser declines): try on the next tap.
      });
    };

    window.addEventListener('pointerup', enter, { passive: true });
    return () => window.removeEventListener('pointerup', enter);
  }, []);

  return null;
}
