'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { ResolvedNav } from '@/lib/navigation';

export type NavGroup = {
  /** Null for the entries above the first heading, which never collapse. */
  heading: string | null;
  items: ResolvedNav['items'];
};

/** Exact match for a section's landing page, prefix match otherwise. */
export function isNavActive(href: string, pathname: string): boolean {
  return href === '/hr' || href === '/dashboard'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** Splits the resolved menu into its sections, in menu order. */
export function groupNav({ items, headings }: ResolvedNav): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of items) {
    const heading = headings.get(item.href);
    if (heading || groups.length === 0) {
      groups.push({ heading: heading ?? null, items: [item] });
    } else {
      groups[groups.length - 1].items.push(item);
    }
  }
  return groups;
}

/**
 * Whether a section is open. An explicit choice wins; without one, only the
 * section holding the current page starts open, so the menu shows what is
 * needed and the rest folds down to its heading.
 */
export function isSectionOpen(
  group: NavGroup,
  pathname: string,
  choices: Record<string, boolean>
): boolean {
  if (group.heading === null) return true;
  const choice = choices[group.heading];
  if (choice !== undefined) return choice;
  return group.items.some((item) => isNavActive(item.href, pathname));
}

const KEY = 'hylink-nav-sections';
/** Fired when this tab changes a section, since `storage` only fires in others. */
const EVENT = 'hylink-nav-sections-change';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

// The raw string is the snapshot: it is stable between reads, which
// useSyncExternalStore needs, where a freshly parsed object never is.
function getSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

// Where choices live when storage is blocked, so a toggle still works for the visit.
let memory = '{}';

const getServerSnapshot = (): string => '{}';

function parse(raw: string): Record<string, boolean> {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/**
 * The remembered open/closed sections, shared by the desktop rail and the
 * phone menu so folding a section in one folds it in the other.
 */
export function useNavSections() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const choices = parse(raw);

  const setOpen = useCallback((heading: string, open: boolean) => {
    const next = { ...parse(getSnapshot()), [heading]: open };
    memory = JSON.stringify(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable; `memory` carries the choice for this visit.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { choices, setOpen };
}
