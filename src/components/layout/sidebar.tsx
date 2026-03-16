'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  LayoutDashboard,
  Users,
  Landmark,
  PiggyBank,
  Wallet,
  BookOpen,
  BarChart3,
  UserCog,
  Clock,
  CalendarOff,
  Star,
  ClipboardCheck,
  FileText,
  Shield,
  Settings,
  Bell,
  ChevronLeft,
  ChevronRight,
  X,
  UserCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/types';
import { useState, useEffect } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  permissions?: string[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Customers', href: '/customers', icon: Users, permission: 'CUSTOMERS:READ' },
  { label: 'Loans', href: '/loans', icon: Landmark, permissions: ['LOANS:READ', 'LOANS:CREATE'] },
  { label: 'Savings', href: '/savings', icon: PiggyBank, permissions: ['SAVINGS:READ', 'SAVINGS:CREATE'] },
  { label: 'Fixed Deposits', href: '/fixed-deposits', icon: Wallet, permissions: ['FIXED_DEPOSITS:READ', 'FIXED_DEPOSITS:CREATE'] },
  { label: 'Verification', href: '/verification', icon: ClipboardCheck, permissions: ['LOANS:VERIFY', 'VERIFICATION:READ', 'VERIFICATION:PROCESS'] },
  { label: 'Accounting', href: '/accounting', icon: BookOpen, permissions: ['ACCOUNTS:COA_MANAGE', 'ACCOUNTS:JOURNAL_CREATE', 'ACCOUNTS:REPORTS_VIEW'] },
  { label: 'Reports', href: '/reports', icon: BarChart3, permission: 'ACCOUNTS:REPORTS_VIEW' },
  { label: 'My Profile', href: '/hr/my-profile', icon: UserCircle },
  { label: 'Staff', href: '/hr/staff', icon: UserCog, permission: 'HR:STAFF_READ' },
  { label: 'Attendance', href: '/hr/attendance', icon: Clock },
  { label: 'Leave', href: '/hr/leave', icon: CalendarOff },
  { label: 'Performance', href: '/hr/performance', icon: Star, permission: 'HR:PERFORMANCE_MANAGE' },
  { label: 'Documents', href: '/documents', icon: FileText, permission: 'DOCUMENTS:READ' },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Audit Logs', href: '/audit-logs', icon: Shield, permission: 'AUDIT:READ' },
  { label: 'Settings', href: '/settings', icon: Settings, permission: 'SYSTEM:CONFIG_MANAGE' },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [collapsed, setCollapsed] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    onClose?.();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const hasAccess = (item: NavItem) => {
    if (!item.permission && !item.permissions) return true;
    if (item.permission) return user.permissions.includes(item.permission);
    if (item.permissions) return item.permissions.some((p) => user.permissions.includes(p));
    return false;
  };

  const filteredNav = navItems.filter(hasAccess);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-700">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <Landmark className="h-8 w-8 text-blue-400" />
            <div>
              <span className="text-lg font-bold">Hylink</span>
              <span className="text-xs block text-slate-400">Finance EMS</span>
            </div>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard">
            <Landmark className="h-8 w-8 text-blue-400 mx-auto" />
          </Link>
        )}
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="lg:hidden p-1 text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-1">
          {filteredNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse Toggle — desktop only */}
      <div className="hidden lg:block border-t border-slate-700 p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen bg-slate-900 text-white transition-transform duration-300 flex flex-col',
          // Desktop: always visible, respects collapsed state
          'lg:translate-x-0 lg:transition-[width] lg:duration-300',
          collapsed ? 'lg:w-16' : 'lg:w-64',
          // Mobile: slide in/out, always full width
          'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
