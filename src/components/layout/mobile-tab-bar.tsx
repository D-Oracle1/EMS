'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { LayoutDashboard, PiggyBank, Landmark, Users, LayoutGrid, type LucideIcon } from 'lucide-react';
import type { SessionUser } from '@/types';

interface TabItem {
  label: string;
  href: string;
  icon: LucideIcon;
  match: string; // active when pathname starts with this
  anyPerm?: string[];
}

const CANDIDATES: TabItem[] = [
  { label: 'Home', href: '/dashboard', icon: LayoutDashboard, match: '/dashboard' },
  { label: 'Savings', href: '/savings/dashboard', icon: PiggyBank, match: '/savings', anyPerm: ['SAVINGS:READ', 'SAVINGS:CREATE'] },
  { label: 'Loans', href: '/loans', icon: Landmark, match: '/loans', anyPerm: ['LOANS:READ', 'LOANS:CREATE'] },
  { label: 'Clients', href: '/customers', icon: Users, match: '/customers', anyPerm: ['CUSTOMERS:READ'] },
];

export function MobileTabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  const perms = user?.permissions ?? [];
  const can = (anyPerm?: string[]) => !anyPerm || anyPerm.some((p) => perms.includes(p));

  // Always keep Home; fill up to 4 tabs with permitted destinations.
  const tabs = CANDIDATES.filter((t) => t.href === '/dashboard' || can(t.anyPerm)).slice(0, 4);

  const isActive = (match: string) =>
    match === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(match);

  return (
    <nav className="mobile-tabbar">
      <div className="mobile-tabbar-inner">
        {tabs.map((tab) => {
          const active = isActive(tab.match);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-1.5 rounded-2xl transition-colors"
            >
              {/* Inactive icons and labels were slate-400, which sits near
                  2.8:1 on the bar and disappears entirely in dark mode. The
                  muted token clears 4.5:1 in both themes. */}
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-2xl transition-all ${
                  active
                    ? 'bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/30'
                    : 'text-muted-foreground'
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span
                className={`text-[10px] font-medium ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}

        {/* Opens the full-screen icon grid. A grid icon rather than a burger,
            because a grid is what it opens. */}
        <button
          type="button"
          onClick={onMore}
          className="flex flex-1 flex-col items-center gap-0.5 py-1.5 rounded-2xl"
          aria-label="Open navigation"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl text-muted-foreground">
            <LayoutGrid className="h-5 w-5" />
          </span>
          <span className="text-[10px] font-medium text-muted-foreground">Menu</span>
        </button>
      </div>
    </nav>
  );
}
