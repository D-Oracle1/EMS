'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import type { SessionUser } from '@/types';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  // When user must change password, show a minimal layout without navigation
  if (user?.mustChangePassword) {
    return (
      <div className="min-h-screen bg-muted/30">
        <div className="flex h-16 items-center border-b bg-background px-6">
          <span className="text-lg font-bold">Hylink Finance</span>
          <span className="ml-2 text-sm text-muted-foreground">EMS</span>
        </div>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 lg:ml-64 transition-all duration-300">
        <Header onMenuToggle={() => setMobileOpen((v) => !v)} />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
