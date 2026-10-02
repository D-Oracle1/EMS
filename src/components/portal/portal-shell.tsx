'use client';

import { BrandTile } from '@/components/brand';
import { useSession, signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionUser } from '@/types';

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40">
      <header className="hero-card rounded-none pt-safe">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandTile className="h-9 w-9" />
            <div className="min-w-0">
              <p className="truncate text-white font-semibold leading-tight">Hylink Finance</p>
              <p className="truncate text-blue-100/80 text-xs">
                {user ? `${user.firstName} ${user.lastName}` : 'Customer Portal'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-white hover:bg-white/15 rounded-full"
          >
            <LogOut className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl overflow-x-clip px-4 py-5 pb-16">{children}</main>
    </div>
  );
}
