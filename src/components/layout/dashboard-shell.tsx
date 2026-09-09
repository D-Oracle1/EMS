'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Sidebar } from './sidebar';
import { WorkspaceBar } from './workspace-bar';
import { GlobalSearch } from './global-search';
import { MobileTabBar } from './mobile-tab-bar';
import { WorkspaceHeader } from '@/components/workspace-header';
import type { SessionUser } from '@/types';

const PIN_KEY = 'hylink-sidebar-pinned';

/**
 * The workspace frame, built to the reference design.
 *
 * Every page opens the same way: greeting pill and icon cluster floating at the
 * top, the clock and date beneath them, then the search bar, then the page's
 * own content in frosted cards. There is no full-width header; the department
 * and branch that used to sit in one now live in the user menu.
 *
 * The sidebar is a floating icon rail that expands over the page on hover, so
 * the content only shifts when the rail is deliberately pinned.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
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
          <WorkspaceBar onMenuToggle={() => setMobileOpen((v) => !v)} />

          <WorkspaceHeader />

          <div className="mb-6 mt-1">
            <GlobalSearch />
          </div>

          {children}
        </main>
      </div>

      <MobileTabBar onMore={() => setMobileOpen(true)} />
    </div>
  );
}
