'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

/**
 * Hide balances, as bank apps do, for when someone is looking over a
 * customer's shoulder. The choice is remembered on this device only; if the
 * browser blocks storage, balances simply show.
 */
const KEY = 'hl-hide-balances';
const Ctx = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: false, toggle: () => {} });

// The choice lives in localStorage; when storage is blocked it lives here for
// this page's life instead.
let memory = false;
const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return memory;
  }
};
const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
};

export function BalancePrivacy({ children }: { children: React.ReactNode }) {
  // Shown on the server and the first paint; the saved choice applies straight after.
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  const toggle = () => {
    const next = !read();
    memory = next;
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* not remembered: the in-memory choice still applies */
    }
    listeners.forEach((l) => l());
  };
  return <Ctx.Provider value={{ hidden, toggle }}>{children}</Ctx.Provider>;
}

export const useBalancePrivacy = () => useContext(Ctx);

/** An amount that hides with the balance toggle. */
export function Amount({ value, className, sign }: { value: number; className?: string; sign?: '+' | '-' }) {
  const { hidden } = useBalancePrivacy();
  return (
    <span className={cn('tabular-nums', className)}>
      {hidden ? 'NGN ••••••' : `${sign === '+' ? '+' : sign === '-' ? '−' : ''}${formatCurrency(value)}`}
    </span>
  );
}

export function PrivacyToggle({ className }: { className?: string }) {
  const { hidden, toggle } = useBalancePrivacy();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={hidden ? 'Show balances' : 'Hide balances'}
      aria-pressed={hidden}
      className={cn('inline-flex h-8 w-8 items-center justify-center rounded-full', className)}
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}
