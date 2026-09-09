'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Bell, LogOut, User, Key, ChevronDown, Menu } from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getUnreadCount, getNotifications } from '@/actions/notification.actions';
import { ThemeToggle } from '@/components/theme';
import { PwaInstallPrompt } from './pwa-install';
import type { SessionUser } from '@/types';

// Deterministic gradient per user based on first initial
const avatarGradients: Record<string, string> = {
  A: 'from-rose-500 to-pink-600',
  B: 'from-orange-500 to-amber-600',
  C: 'from-yellow-500 to-orange-500',
  D: 'from-emerald-500 to-teal-600',
  E: 'from-teal-500 to-cyan-600',
  F: 'from-cyan-500 to-sky-600',
  G: 'from-sky-500 to-blue-600',
  H: 'from-blue-500 to-indigo-600',
  I: 'from-indigo-500 to-violet-600',
  J: 'from-violet-500 to-purple-600',
  K: 'from-purple-500 to-fuchsia-600',
  L: 'from-fuchsia-500 to-pink-600',
  M: 'from-pink-500 to-rose-600',
  N: 'from-red-500 to-rose-600',
  O: 'from-orange-400 to-red-500',
  P: 'from-lime-500 to-green-600',
  Q: 'from-green-500 to-emerald-600',
  R: 'from-amber-400 to-yellow-500',
  S: 'from-indigo-400 to-blue-500',
  T: 'from-sky-400 to-cyan-500',
  U: 'from-violet-400 to-indigo-500',
  V: 'from-purple-400 to-violet-500',
  W: 'from-fuchsia-400 to-purple-500',
  X: 'from-rose-400 to-fuchsia-500',
  Y: 'from-teal-400 to-emerald-500',
  Z: 'from-cyan-400 to-teal-500',
};

function getAvatarGradient(letter: string): string {
  return avatarGradients[letter?.toUpperCase()] ?? 'from-indigo-500 to-purple-600';
}

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCountRef = { current: 0 };

  useEffect(() => {
    if (!user) return;

    const showBrowserNotification = async (count: number) => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      try {
        const notifications = await getNotifications(1);
        if (notifications.length > 0) {
          const n = notifications[0];
          new Notification(n.title, {
            body: n.message,
            icon: '/icons/icon-192x192.png',
            tag: n.id,
          });
        }
      } catch {
        // Best-effort
      }
    };

    const fetchCount = async () => {
      try {
        const count = await getUnreadCount();
        if (count > prevCountRef.current && prevCountRef.current > 0) {
          showBrowserNotification(count);
        }
        prevCountRef.current = count;
        setUnreadCount(count);
      } catch {}
    };

    const requestPermission = () => {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
      document.removeEventListener('click', requestPermission);
    };
    document.addEventListener('click', requestPermission, { once: true });

    const timeout = setTimeout(fetchCount, 2000);
    const interval = setInterval(fetchCount, 60000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;

  const avatarGrad = getAvatarGradient(user.firstName?.[0] ?? 'A');

  return (
    <header className="header-rainbow-border sticky top-0 z-30 flex h-16 items-center gap-4 bg-background/80 backdrop-blur-xl border-b border-border/70 px-4 lg:px-6 shadow-sm">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden shrink-0 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
        onClick={onMenuToggle}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Left side context */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground truncate">
          <span className="font-medium text-indigo-500">{user.department}</span>
          <span className="mx-1 text-muted-foreground/50">&middot;</span>
          {user.branchName || 'Head Office'}
        </p>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <PwaInstallPrompt />
        <ThemeToggle />

        {/* Notifications bell */}
        <Link href="/notifications">
          <Button
            variant="ghost"
            size="icon"
            className="relative hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4.5 h-[18px] w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-pink-600 text-[9px] font-bold text-white shadow-md animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
        </Link>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 px-2 hover:bg-indigo-50 transition-colors rounded-xl"
            >
              <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${avatarGrad} flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm`}>
                {user.firstName?.[0]}{user.lastName?.[0]}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold leading-none">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{user.role}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 shadow-xl border-slate-200/80">
            <DropdownMenuLabel>
              <div className="flex items-center gap-3 py-1">
                <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${avatarGrad} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md`}>
                  {user.firstName?.[0]}{user.lastName?.[0]}
                </div>
                <div>
                  <p className="font-semibold">{user.firstName} {user.lastName}</p>
                  <p className="text-xs text-muted-foreground font-normal">{user.email}</p>
                  <Badge variant="secondary" className="mt-1 text-[10px] bg-indigo-100 text-indigo-700 border-indigo-200">
                    {user.employeeId}
                  </Badge>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/hr/my-profile" className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 focus:text-indigo-600">
                <User className="h-4 w-4 text-indigo-500" />
                My Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/change-password" className="flex items-center gap-2 cursor-pointer hover:text-violet-600 focus:text-violet-600">
                <Key className="h-4 w-4 text-violet-500" />
                Change Password
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-2 cursor-pointer text-rose-600 hover:text-rose-700 focus:text-rose-700 hover:bg-rose-50 focus:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
