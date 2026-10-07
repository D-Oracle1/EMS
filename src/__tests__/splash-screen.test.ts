/**
 * The opening splash plays only when the installed app is opened: never in a
 * browser tab, and once per app session, not on every page load.
 */
import { describe, it, expect } from 'vitest';
import { SHOW_SCRIPT } from '@/components/splash-screen';

/** Runs the inline script against a pretend page; returns whether the splash shows. */
function run(opts: { displayMode?: string; iosStandalone?: boolean; seen?: boolean; storageThrows?: boolean }) {
  const attrs: Record<string, string> = {};
  const store = new Map<string, string>(opts.seen ? [['hl-splash', '1']] : []);
  const window = {
    matchMedia: (q: string) => ({ matches: !!opts.displayMode && q.includes(`display-mode: ${opts.displayMode}`) }),
  };
  const navigator = { standalone: opts.iosStandalone };
  const sessionStorage = {
    getItem: (k: string) => { if (opts.storageThrows) throw new Error('blocked'); return store.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (opts.storageThrows) throw new Error('blocked'); store.set(k, v); },
  };
  const document = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
  new Function('window', 'navigator', 'sessionStorage', 'document', SHOW_SCRIPT)(window, navigator, sessionStorage, document);
  return { shown: attrs['data-splash'] === 'show', store };
}

describe('when the splash plays', () => {
  it('plays when the installed app opens', () => {
    expect(run({ displayMode: 'standalone' }).shown).toBe(true);
    expect(run({ displayMode: 'fullscreen' }).shown).toBe(true);
    expect(run({ iosStandalone: true }).shown).toBe(true);
  });

  it('never plays in a browser tab', () => {
    expect(run({ displayMode: 'browser' }).shown).toBe(false);
    expect(run({}).shown).toBe(false);
  });

  it('plays once per app session, not on every page', () => {
    const first = run({ displayMode: 'standalone' });
    expect(first.store.get('hl-splash')).toBe('1');
    expect(run({ displayMode: 'standalone', seen: true }).shown).toBe(false);
  });

  it('stays hidden if storage is blocked', () => {
    expect(run({ displayMode: 'standalone', storageThrows: true }).shown).toBe(false);
  });
});
