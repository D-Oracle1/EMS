'use client';

/**
 * Light and dark mode.
 *
 * Small enough not to be worth a dependency. The theme lives on the <html>
 * element as a class, which is what Tailwind's `darkMode: ['class']` reads, and
 * is mirrored into localStorage so it survives a reload.
 *
 * `themeScript` below runs before React hydrates, so the page never paints in
 * the wrong theme and then snaps to the right one.
 */

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'hylink-theme';

/**
 * Inlined into <head>. Kept as a string, deliberately terse, because it blocks
 * the first paint. Falls back to the operating system preference.
 */
export const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'light' || stored === 'dark' ? stored : (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
`;

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The class on <html> is the single source of truth for the theme — the
 * blocking script above sets it before first paint, and Tailwind reads it.
 *
 * So rather than keeping a second copy in React state and syncing it from an
 * effect (which pushes a cascading render on every mount), the provider
 * subscribes to the DOM and reads it. There is only one source of truth, and
 * React re-reads it after hydration, which is exactly what
 * useSyncExternalStore exists for.
 */
function subscribeToThemeClass(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const getThemeSnapshot = (): Theme =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light';

// The server has no way to know the viewer's theme. It renders light; the
// blocking script has already corrected the DOM by the time React hydrates.
const getThemeServerSnapshot = (): Theme => 'light';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToThemeClass,
    getThemeSnapshot,
    getThemeServerSnapshot
  );

  const setTheme = useCallback((next: Theme) => {
    // Writing the class is all that is needed: the observer above turns that
    // into a re-render, so there is no second copy of the state to update.
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing, or storage disabled. The theme still applies for
      // this visit; it simply will not be remembered.
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/** Sun/moon switch for the top bar. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      // No "mounted" flag is needed: the theme comes from a subscribed store,
      // so it is the server's guess during SSR and the real value immediately
      // after hydration, and the label follows it.
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground backdrop-blur transition-colors hover:text-foreground ${className}`}
    >
      {/* Both icons are rendered and cross-faded, so nothing shifts on toggle
          and the server and client markup match before hydration. */}
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </button>
  );
}
