'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Bell, Home, Landmark, ListOrdered, UserRound, Wallet } from 'lucide-react';
import { BrandTile } from '@/components/brand';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/types';

/**
 * The customer app's frame, laid out like a bank app: a header with the
 * customer's greeting and a notifications bell, and the five sections as a
 * tab bar, along the bottom on a phone and under the header on a larger
 * screen. Each section is its own page under /portal.
 */
export const PORTAL_TABS = [
  { href: '/portal', label: 'Home', icon: Home },
  { href: '/portal/accounts', label: 'Accounts', icon: Wallet },
  { href: '/portal/loans', label: 'Loans', icon: Landmark },
  { href: '/portal/activity', label: 'Activity', icon: ListOrdered },
  { href: '/portal/profile', label: 'Profile', icon: UserRound },
] as const;

/** The tab a page belongs to: a savings or deposit page sits under Accounts, a loan page under Loans. */
export function activeTab(pathname: string): string {
  if (pathname === '/portal') return '/portal';
  if (pathname.startsWith('/portal/savings') || pathname.startsWith('/portal/deposits')) return '/portal/accounts';
  return PORTAL_TABS.find((t) => t.href !== '/portal' && pathname.startsWith(t.href))?.href ?? '/portal';
}

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/portal';
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const current = activeTab(pathname);
  const initials = user ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() : '';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 pt-safe backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <BrandTile className="h-9 w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-slate-500">{greeting()}</p>
            <p className="truncate text-sm font-semibold">{user ? `${user.firstName} ${user.lastName}` : 'Hy-Link Finance'}</p>
          </div>
          <Link
            href="/portal/activity#messages"
            aria-label="Messages"
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
          >
            <Bell className="h-5 w-5" />
          </Link>
          <Link
            href="/portal/profile"
            aria-label="Profile"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#002078] text-xs font-semibold text-white"
          >
            {initials || <UserRound className="h-4 w-4" />}
          </Link>
        </div>

        {/* Tabs under the header on a larger screen */}
        <nav className="mx-auto hidden max-w-5xl gap-1 px-4 md:flex" aria-label="Sections">
          {PORTAL_TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                '-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                current === t.href ? 'border-[#002078] text-[#002078]' : 'border-transparent text-slate-500 hover:text-slate-900'
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl overflow-x-clip px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 md:pb-12 print:p-0">
        {children}
      </main>

      {/* Tab bar along the bottom on a phone */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
        aria-label="Sections"
      >
        <div className="grid grid-cols-5">
          {PORTAL_TABS.map((t) => {
            const on = current === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? 'page' : undefined}
                className={cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', on ? 'text-[#002078]' : 'text-slate-500')}
              >
                <t.icon className={cn('h-5 w-5', on && 'stroke-[2.4]')} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
