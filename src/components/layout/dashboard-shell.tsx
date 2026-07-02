'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { MobileTabBar } from './mobile-tab-bar';
import type { SessionUser } from '@/types';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  if (user?.mustChangePassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
        <div className="flex h-16 items-center border-b bg-white/90 backdrop-blur-md px-6 shadow-sm">
          <span className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Hylink Finance
          </span>
          <span className="ml-2 text-sm text-muted-foreground">EMS</span>
        </div>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50/80 via-white to-indigo-50/30">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 lg:ml-64 transition-all duration-300 min-w-0">
        <Header onMenuToggle={() => setMobileOpen((v) => !v)} />
        <main className="p-4 lg:p-6 pb-28 lg:pb-6">{children}</main>
      </div>
      <MobileTabBar onMore={() => setMobileOpen(true)} />
    </div>
  );
}
