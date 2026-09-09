'use client';

/**
 * The floating bar that replaces the old full-width header.
 *
 * Follows the reference design: a greeting pill on the left, a rounded cluster
 * of round icon buttons on the right, and nothing spanning the width of the
 * page. Department and branch move into the user menu — they are reference
 * information, not something worth a permanent strip across every screen.
 */

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { Bell, LogOut, User, Key, Menu, Building2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { getUnreadCount, getNotifications } from '@/actions/notification.actions';
import { ThemeToggle } from '@/components/theme';
import { PwaInstallPrompt } from './pwa-install';
import type { SessionUser } from '@/types';

const avatarGradients: Record<string, string> = {
  A: 'from-rose-500 to-pink-600', B: 'from-orange-500 to-amber-600',
  C: 'from-yellow-500 to-orange-500', D: 'from-emerald-500 to-teal-600',
  E: 'from-teal-500 to-cyan-600', F: 'from-cyan-500 to-sky-600',
  G: 'from-sky-500 to-blue-600', H: 'from-blue-500 to-indigo-600',
  I: 'from-indigo-500 to-violet-600', J: 'from-violet-500 to-purple-600',
  K: 'from-purple-500 to-fuchsia-600', L: 'from-fuchsia-500 to-pink-600',
  M: 'from-pink-500 to-rose-600', N: 'from-red-500 to-rose-600',
  O: 'from-orange-400 to-red-500', P: 'from-lime-500 to-green-600',
  Q: 'from-green-500 to-emerald-600', R: 'from-amber-400 to-yellow-500',
  S: 'from-indigo-400 to-blue-500', T: 'from-sky-400 to-cyan-500',
  U: 'from-violet-400 to-indigo-500', V: 'from-purple-400 to-violet-500',
  W: 'from-fuchsia-400 to-purple-500', X: 'from-rose-400 to-fuchsia-500',
  Y: 'from-teal-400 to-emerald-500', Z: 'from-cyan-400 to-teal-500',
};

function avatarFor(letter: string): string {
  return avatarGradients[letter?.toUpperCase()] ?? 'from-indigo-500 to-purple-600';
}

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function WorkspaceBar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [unread, setUnread] = useState(0);
  const [greeting, setGreeting] = useState<string | null>(null);

  // The greeting depends on the viewer's clock, which the server does not have.
  useEffect(() => {
    const set = () => setGreeting(greetingFor(new Date().getHours()));
    set();
    const id = setInterval(set, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const count = await getUnreadCount();
        if (cancelled) return;
        setUnread((previous) => {
          if (count > previous) void notifyInBrowser();
          return count;
        });
      } catch {
        // A failed poll must never take the bar down with it.
      }
    };

    const notifyInBrowser = async () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      try {
        const latest = await getNotifications(1);
        const n = latest?.[0];
        if (n) new Notification(n.title, { body: n.message, icon: '/icons/icon-192x192.png' });
      } catch {
        // Best effort only.
      }
    };

    void poll();
    const id = setInterval(poll, 60_000);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  if (!user) return null;

  const gradient = avatarFor(user.firstName?.[0] ?? 'A');
  const pill =
    'inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground';

  return (
    <div className="flex items-start justify-between gap-3">
      {/* Greeting */}
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuToggle}
          className="greeting-pill lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <p className="greeting-pill">
          <span aria-hidden>👋</span>
          <span suppressHydrationWarning>
            {greeting ?? 'Welcome'}, {user.firstName}
          </span>
        </p>
      </div>

      {/* Icon cluster */}
      <div className="glass-panel flex items-center gap-0.5 rounded-full p-1">
        <PwaInstallPrompt />

        <Link href="/notifications" className={`relative ${pill}`} aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-pink-600 px-1 text-[9px] font-bold text-white shadow-md">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>

        <ThemeToggle className="h-10 w-10 border-0 bg-transparent hover:bg-foreground/5" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={pill} aria-label="Account menu">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-xs font-bold text-white shadow-sm`}
              >
                {user.firstName?.[0]}
                {user.lastName?.[0]}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <div className="flex items-center gap-3 py-1">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-sm font-bold text-white shadow-md`}
                >
                  {user.firstName?.[0]}
                  {user.lastName?.[0]}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                  <Badge variant="secondary" className="mt-1 text-[10px]">
                    {user.employeeId}
                  </Badge>
                </div>
              </div>
            </DropdownMenuLabel>

            {/* Where the old header's "Department · Head Office" strip went. */}
            <DropdownMenuSeparator />
            <div className="flex items-start gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
              <span>
                <span className="font-medium text-foreground">{user.role}</span>
                <br />
                {user.department}
                {user.branchName ? ` · ${user.branchName}` : ' · Head Office'}
              </span>
            </div>

            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/hr/my-profile" className="flex cursor-pointer items-center gap-2">
                <User className="h-4 w-4 text-indigo-500" />
                My Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/change-password" className="flex cursor-pointer items-center gap-2">
                <Key className="h-4 w-4 text-violet-500" />
                Change Password
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex cursor-pointer items-center gap-2 text-rose-600 focus:bg-rose-50 focus:text-rose-700"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
