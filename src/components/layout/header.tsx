'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import {
  Bell,
  LogOut,
  User,
  Key,
  ChevronDown,
  Menu,
} from 'lucide-react';
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
import { PwaInstallPrompt } from './pwa-install';
import type { SessionUser } from '@/types';

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
        // Best-effort — don't break if this fails
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

    // Request notification permission once user is active (on first interaction)
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

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-white px-4 lg:px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden shrink-0"
        onClick={onMenuToggle}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Page context - left side */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground truncate">
          {user.department} &middot; {user.branchName || 'Head Office'}
        </p>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* PWA Install Prompt */}
        <PwaInstallPrompt />

        {/* Notifications */}
        <Link href="/notifications">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
        </Link>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium shrink-0">
                {user.firstName[0]}{user.lastName[0]}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-muted-foreground">{user.role}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div>
                <p className="font-medium">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <Badge variant="secondary" className="mt-1 text-xs">
                  {user.employeeId}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/hr/my-profile" className="flex items-center gap-2 cursor-pointer">
                <User className="h-4 w-4" />
                My Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/change-password" className="flex items-center gap-2 cursor-pointer">
                <Key className="h-4 w-4" />
                Change Password
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-2 cursor-pointer text-destructive"
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
