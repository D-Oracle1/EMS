'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Sidebar } from './sidebar';
import { MobileNavGrid } from './mobile-nav-grid';
import { AttendanceChip } from './attendance-chip';
import { WorkspaceBar } from './workspace-bar';
import { GlobalSearch } from './global-search';
import { MobileTabBar } from './mobile-tab-bar';
import { WorkspaceHeader } from '@/components/workspace-header';
import type { SessionUser } from '@/types';

const PIN_KEY = 'hylink-sidebar-pinned';
/** Fired when this tab changes the pin, since `storage` only fires in others. */
const PIN_EVENT = 'hylink-sidebar-pinned-change';

/**
 * localStorage is an external store, so it is subscribed to rather than copied
 * into state from an effect — reading it in an effect and calling setState
 * costs a second render on every mount, which is what
 * react-hooks/set-state-in-effect is warning about.
 */
function subscribeToPin(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(PIN_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(PIN_EVENT, onChange);
  };
}

function getPinSnapshot(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === '1';
  } catch {
    // Storage unavailable; the rail simply starts unpinned.
    return false;
  }
}

/** The server cannot know; it renders unpinned and hydration corrects it. */
const getPinServerSnapshot = (): boolean => false;

/**
 * The dashboards, and only the dashboards, open with the greeting and the full
 * centred clock. Everywhere else is a working page — a table, a form, a report —
 * which opens straight into the work rather than spending the top of the screen
 * on a welcome.
 *
 * The small clock chip in the icon cluster is on every page, dashboards
 * included, so the time is always in the same corner wherever you are.
 */
const DASHBOARD_PATHS = ['/dashboard', '/savings/dashboard'];

/**
 * The workspace frame, built to the reference design.
 *
 * Every page opens the same way: a floating icon cluster at the top, then the
 * search bar, then the page's own content in frosted cards. There is no
 * full-width header; the department and branch that used to sit in one now live
 * in the user menu.
 *
 * Every page carries a small clock-iconned chip at the head of the icon
 * cluster. A dashboard adds the greeting pill and the big centred clock above
 * the search bar as well; a working page drops both, so the work itself is not
 * pushed below the fold.
 *
 * The sidebar is a floating icon rail that expands over the page on hover, so
 * the content only shifts when the rail is deliberately pinned.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pinned = useSyncExternalStore(subscribeToPin, getPinSnapshot, getPinServerSnapshot);
  const pathname = usePathname();
  const isDashboard = DASHBOARD_PATHS.includes(pathname);
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  const changePinned = useCallback((next: boolean) => {
    try {
      localStorage.setItem(PIN_KEY, next ? '1' : '0');
    } catch {
      // Not remembering the choice is acceptable; ignoring it is not.
    }
    // Tell the store; `storage` does not fire in the tab that wrote it.
    window.dispatchEvent(new Event(PIN_EVENT));
  }, []);

  // Someone who has not set their password yet gets no navigation at all.
  if (user?.mustChangePassword) {
    return (
      <div className="min-h-screen">
        <div className="flex h-16 items-center px-6">
          <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-lg font-bold text-transparent">
            Hylink Finance
          </span>
          <span className="ml-2 text-sm text-muted-foreground">EMS</span>
        </div>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Sidebar pinned={pinned} onPinnedChange={changePinned} />

      {/* The phone's navigation. Opened from the bottom bar, never from a
          corner button. */}
      <MobileNavGrid open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div
        className={`min-w-0 transition-[margin] duration-300 ease-out ${
          pinned ? 'lg:ml-[17.5rem]' : 'lg:ml-[6.25rem]'
        }`}
      >
        <main className="mx-auto max-w-[110rem] px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-6">
          <WorkspaceBar
            // A dashboard already has the big clock on it, so the slot in the
            // icon cluster carries today's attendance instead. Working pages,
            // which have no clock of their own, keep the small one.
            clock={isDashboard ? <AttendanceChip /> : <WorkspaceHeader variant="mini" />}
            showGreeting={isDashboard}
          />

          {isDashboard && <WorkspaceHeader />}

          <div className={isDashboard ? 'mb-6 mt-1' : 'mb-5 mt-4'}>
            <GlobalSearch />
          </div>

          {children}
        </main>
      </div>

      <MobileTabBar onMore={() => setMobileOpen(true)} />
    </div>
  );
}
