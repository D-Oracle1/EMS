'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { getUnreadCount } from '@/actions/notification.actions';

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Create a pleasant two-tone notification sound
    const oscillator1 = ctx.createOscillator();
    const oscillator2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(ctx.destination);

    // First tone: E5
    oscillator1.frequency.value = 659;
    oscillator1.type = 'sine';
    oscillator1.start(now);
    oscillator1.stop(now + 0.15);

    // Second tone: A5 (slightly delayed)
    oscillator2.frequency.value = 880;
    oscillator2.type = 'sine';
    oscillator2.start(now + 0.15);
    oscillator2.stop(now + 0.35);

    // Envelope
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.1, now + 0.15);
    gainNode.gain.setValueAtTime(0.3, now + 0.15);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    // Clean up after sound finishes
    setTimeout(() => ctx.close(), 500);
  } catch {
    // AudioContext not supported or blocked
  }
}

export function NotificationListener() {
  const { data: session } = useSession();
  const previousCountRef = useRef<number | null>(null);

  // Request browser notification permission after a delay
  useEffect(() => {
    if (!session?.user) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    const timer = setTimeout(() => {
      Notification.requestPermission();
    }, 10000);

    return () => clearTimeout(timer);
  }, [session]);

  const checkNotifications = useCallback(async () => {
    try {
      const count = await getUnreadCount();

      if (previousCountRef.current !== null && count > previousCountRef.current) {
        const newCount = count - previousCountRef.current;

        // Play notification sound
        playNotificationSound();

        // Show browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Hylink Finance EMS', {
            body: `You have ${newCount} new notification${newCount > 1 ? 's' : ''}`,
            icon: '/icons/icon-192x192.png',
            tag: 'ems-notification',
          });
        }
      }

      previousCountRef.current = count;
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    if (!session?.user) return;

    // Initial check after short delay
    const initialTimer = setTimeout(checkNotifications, 3000);

    // Poll every 30 seconds
    const interval = setInterval(checkNotifications, 30000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [session, checkNotifications]);

  return null;
}
