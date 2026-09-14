'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Sidebar } from './sidebar';
import { WorkspaceBar } from './workspace-bar';
import { GlobalSearch } from './global-search';
import { MobileTabBar } from './mobile-tab-bar';
import { WorkspaceHeader } from '@/components/workspace-header';
import type { SessionUser } from '@/types';

const PIN_KEY = 'hylink-sidebar-pinned';

/**
 * The dashboards, and only the dashboards, open with the greeting and the full
 * clock. Everywhere else is a working page — a table, a form, a report — where
 * both give way to a clock chip in the icon cluster rather than spending the
 * top of the screen on a welcome and pushing the work below the fold.
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
 * A dashboard adds the greeting pill and the big clock above the search bar. On
 * every other page the greeting is dropped and the clock becomes a small
 * clock-iconned chip at the head of the icon cluster, so the work itself is not
 * pushed below the fold.
 *
 * The sidebar is a floating icon rail that expands over the page on hover, so
 * the content only shifts when the rail is deliberately pinned.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const pathname = usePathname();
  const isDashboard = DASHBOARD_PATHS.includes(pathname);
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  useEffect(() => {
    try {
      setPinned(localStorage.getItem(PIN_KEY) === '1');
    } catch {
      // Storage unavailable; the rail simply starts unpinned.
    }
  }, []);

  function changePinned(next: boolean) {
    setPinned(next);
    try {
      localStorage.setItem(PIN_KEY, next ? '1' : '0');
    } catch {
      // Not remembering the choice is acceptable; ignoring it is not.
    }
  }

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
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        pinned={pinned}
        onPinnedChange={changePinned}
      />

      <div
        className={`min-w-0 transition-[margin] duration-300 ease-out ${
          pinned ? 'lg:ml-[17.5rem]' : 'lg:ml-[6.25rem]'
        }`}
      >
        <main className="mx-auto max-w-[110rem] px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-6">
          <WorkspaceBar
            onMenuToggle={() => setMobileOpen((v) => !v)}
            clock={isDashboard ? undefined : <WorkspaceHeader variant="mini" />}
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
