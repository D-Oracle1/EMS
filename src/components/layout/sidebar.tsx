'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  LayoutDashboard, Users, Landmark, PiggyBank, Wallet, BookOpen,
  BarChart3, UserCog, Clock, CalendarOff, Star, ClipboardCheck,
  FileText, Shield, Settings, Bell, ChevronLeft, ChevronRight, X, UserCircle,
  Briefcase, GraduationCap, Laptop, Megaphone, Network, ArrowRightLeft,
  ClipboardList, Receipt, ChevronDown, HeartHandshake,
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
  color: string;
  /** When present the item renders as a collapsible group rather than a link. */
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard',      href: '/dashboard',      icon: LayoutDashboard, color: 'blue' },
  { label: 'Customers',      href: '/customers',      icon: Users,           color: 'cyan',    permission: 'CUSTOMERS:READ' },
  { label: 'Loans',          href: '/loans',          icon: Landmark,        color: 'orange',  permissions: ['LOANS:READ', 'LOANS:CREATE'] },
  { label: 'Savings',        href: '/savings',        icon: PiggyBank,       color: 'emerald', permissions: ['SAVINGS:READ', 'SAVINGS:CREATE'] },
  { label: 'Fixed Deposits', href: '/fixed-deposits', icon: Wallet,          color: 'purple',  permissions: ['FIXED_DEPOSITS:READ', 'FIXED_DEPOSITS:CREATE'] },
  { label: 'Verification',   href: '/verification',   icon: ClipboardCheck,  color: 'yellow',  permissions: ['LOANS:VERIFY', 'VERIFICATION:READ', 'VERIFICATION:PROCESS'] },
  { label: 'Accounting',     href: '/accounting',     icon: BookOpen,        color: 'sky',     permissions: ['ACCOUNTS:COA_MANAGE', 'ACCOUNTS:JOURNAL_CREATE', 'ACCOUNTS:REPORTS_VIEW'] },
  { label: 'Reports',        href: '/reports',        icon: BarChart3,       color: 'pink',    permission: 'ACCOUNTS:REPORTS_VIEW' },

  // ── Human Resources ──────────────────────────────────────────────────────
  // A world of its own, but still inside the system: everything HR hangs off
  // this one group so the top-level nav stays readable as the module grows.
  {
    label: 'Human Resources',
    href: '/hr',
    icon: HeartHandshake,
    color: 'violet',
    children: [
      { label: 'HR Overview',    href: '/hr',                icon: BarChart3,      color: 'violet' },
      { label: 'My Profile',     href: '/hr/my-profile',     icon: UserCircle,     color: 'violet' },
      { label: 'My Payslips',    href: '/hr/my-payslips',    icon: Receipt,        color: 'emerald' },
      { label: 'People',         href: '/hr/staff',          icon: UserCog,        color: 'indigo',  permission: 'HR:STAFF_READ' },
      { label: 'Attendance',     href: '/hr/attendance',     icon: Clock,          color: 'teal' },
      { label: 'Leave',          href: '/hr/leave',          icon: CalendarOff,    color: 'amber' },
      { label: 'Payroll',        href: '/hr/payroll',        icon: Wallet,         color: 'emerald', permissions: ['HR:PAYROLL_READ', 'HR:PAYROLL_MANAGE', 'HR:PAYROLL_APPROVE'] },
      { label: 'Recruitment',    href: '/hr/recruitment',    icon: Briefcase,      color: 'cyan',    permission: 'HR:RECRUITMENT_MANAGE' },
      { label: 'Onboarding',     href: '/hr/onboarding',     icon: ClipboardList,  color: 'sky',     permissions: ['HR:STAFF_READ', 'HR:STAFF_UPDATE'] },
      { label: 'Movements',      href: '/hr/lifecycle',      icon: ArrowRightLeft, color: 'orange',  permissions: ['HR:STAFF_READ', 'HR:STAFF_UPDATE'] },
      { label: 'Performance',    href: '/hr/performance',    icon: Star,           color: 'gold',    permission: 'HR:PERFORMANCE_MANAGE' },
      { label: 'Learning',       href: '/hr/training',       icon: GraduationCap,  color: 'purple',  permissions: ['HR:TRAINING_MANAGE', 'HR:STAFF_READ'] },
      { label: 'Assets',         href: '/hr/assets',         icon: Laptop,         color: 'slate',   permissions: ['HR:ASSET_MANAGE', 'HR:STAFF_READ'] },
      { label: 'Announcements',  href: '/hr/announcements',  icon: Megaphone,      color: 'fuchsia' },
      { label: 'Org Chart',      href: '/hr/org-chart',      icon: Network,        color: 'blue',    permission: 'HR:STAFF_READ' },
      { label: 'HR Settings',    href: '/hr/settings',       icon: Settings,       color: 'gray',    permissions: ['HR:CONFIG_MANAGE', 'SYSTEM:CONFIG_MANAGE'] },
    ],
  },

  { label: 'Documents',      href: '/documents',      icon: FileText,        color: 'rose',    permission: 'DOCUMENTS:READ' },
  { label: 'Notifications',  href: '/notifications',  icon: Bell,            color: 'fuchsia' },
  { label: 'Audit Logs',     href: '/audit-logs',     icon: Shield,          color: 'slate',   permission: 'AUDIT:READ' },
  { label: 'Settings',       href: '/settings',       icon: Settings,        color: 'gray',    permission: 'SYSTEM:CONFIG_MANAGE' },
];

// All class names written out statically for Tailwind JIT
const colorConfig: Record<string, { icon: string; activeBg: string; activeBorder: string; hoverBg: string }> = {
  blue:    { icon: 'text-blue-400',    activeBg: 'bg-blue-500/20',    activeBorder: 'border-l-blue-400',    hoverBg: 'hover:bg-blue-500/10' },
  cyan:    { icon: 'text-cyan-400',    activeBg: 'bg-cyan-500/20',    activeBorder: 'border-l-cyan-400',    hoverBg: 'hover:bg-cyan-500/10' },
  orange:  { icon: 'text-orange-400',  activeBg: 'bg-orange-500/20',  activeBorder: 'border-l-orange-400',  hoverBg: 'hover:bg-orange-500/10' },
  emerald: { icon: 'text-emerald-400', activeBg: 'bg-emerald-500/20', activeBorder: 'border-l-emerald-400', hoverBg: 'hover:bg-emerald-500/10' },
  purple:  { icon: 'text-purple-400',  activeBg: 'bg-purple-500/20',  activeBorder: 'border-l-purple-400',  hoverBg: 'hover:bg-purple-500/10' },
  yellow:  { icon: 'text-yellow-400',  activeBg: 'bg-yellow-500/20',  activeBorder: 'border-l-yellow-400',  hoverBg: 'hover:bg-yellow-500/10' },
  sky:     { icon: 'text-sky-400',     activeBg: 'bg-sky-500/20',     activeBorder: 'border-l-sky-400',     hoverBg: 'hover:bg-sky-500/10' },
  pink:    { icon: 'text-pink-400',    activeBg: 'bg-pink-500/20',    activeBorder: 'border-l-pink-400',    hoverBg: 'hover:bg-pink-500/10' },
  violet:  { icon: 'text-violet-400',  activeBg: 'bg-violet-500/20',  activeBorder: 'border-l-violet-400',  hoverBg: 'hover:bg-violet-500/10' },
  indigo:  { icon: 'text-indigo-400',  activeBg: 'bg-indigo-500/20',  activeBorder: 'border-l-indigo-400',  hoverBg: 'hover:bg-indigo-500/10' },
  teal:    { icon: 'text-teal-400',    activeBg: 'bg-teal-500/20',    activeBorder: 'border-l-teal-400',    hoverBg: 'hover:bg-teal-500/10' },
  amber:   { icon: 'text-amber-400',   activeBg: 'bg-amber-500/20',   activeBorder: 'border-l-amber-400',   hoverBg: 'hover:bg-amber-500/10' },
  gold:    { icon: 'text-yellow-300',  activeBg: 'bg-yellow-500/20',  activeBorder: 'border-l-yellow-300',  hoverBg: 'hover:bg-yellow-500/10' },
  rose:    { icon: 'text-rose-400',    activeBg: 'bg-rose-500/20',    activeBorder: 'border-l-rose-400',    hoverBg: 'hover:bg-rose-500/10' },
  fuchsia: { icon: 'text-fuchsia-400', activeBg: 'bg-fuchsia-500/20', activeBorder: 'border-l-fuchsia-400', hoverBg: 'hover:bg-fuchsia-500/10' },
  slate:   { icon: 'text-slate-400',   activeBg: 'bg-slate-500/20',   activeBorder: 'border-l-slate-400',   hoverBg: 'hover:bg-slate-500/10' },
  gray:    { icon: 'text-gray-400',    activeBg: 'bg-gray-500/20',    activeBorder: 'border-l-gray-400',    hoverBg: 'hover:bg-gray-500/10' },
};

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    onClose?.();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open the group containing the current route so the active item is visible.
  useEffect(() => {
    const active = navItems.find(
      (item) => item.children && pathname.startsWith(item.href)
    );
    if (active) setOpenGroups((prev) => ({ ...prev, [active.href]: true }));
  }, [pathname]);

  if (!user) return null;

  const hasAccess = (item: NavItem) => {
    if (!item.permission && !item.permissions) return true;
    if (item.permission) return user.permissions.includes(item.permission);
    if (item.permissions) return item.permissions.some((p) => user.permissions.includes(p));
    return false;
  };

  // A group survives filtering when at least one of its children does.
  const filteredNav = navItems
    .map((item) =>
      item.children
        ? { ...item, children: item.children.filter(hasAccess) }
        : item
    )
    .filter((item) => (item.children ? item.children.length > 0 : hasAccess(item)));

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="relative shrink-0">
              <Landmark className="h-8 w-8 text-indigo-400 group-hover:text-indigo-300 transition-colors duration-200" />
              <div className="absolute inset-0 bg-indigo-400/20 blur-lg rounded-full group-hover:bg-indigo-300/30 transition-all duration-200" />
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
                Hylink
              </span>
              <span className="text-[10px] block text-slate-500 font-medium tracking-widest uppercase">
                Finance EMS
              </span>
            </div>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" className="mx-auto group relative">
            <Landmark className="h-8 w-8 text-indigo-400 group-hover:text-indigo-300 transition-colors duration-200" />
            <div className="absolute inset-0 bg-indigo-400/20 blur-lg rounded-full group-hover:bg-indigo-300/30 transition-all duration-200" />
          </Link>
        )}
        <button
          onClick={onClose}
          className="lg:hidden p-1 text-slate-500 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <ul className="space-y-0.5">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const colors = colorConfig[item.color] ?? colorConfig.blue;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

            // ── Collapsible group ──
            if (item.children) {
              const isOpen = openGroups[item.href] ?? false;

              // When the rail is collapsed there is no room for a sub-list, so
              // the group behaves as a plain link to its landing page.
              if (collapsed) {
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 border-l-2',
                        isActive
                          ? `${colors.activeBg} ${colors.activeBorder} text-white shadow-sm`
                          : `border-transparent text-slate-400 hover:text-white ${colors.hoverBg}`
                      )}
                      title={item.label}
                    >
                      <Icon className={cn('h-5 w-5 shrink-0', colors.icon)} />
                    </Link>
                  </li>
                );
              }

              return (
                <li key={item.href}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenGroups((prev) => ({ ...prev, [item.href]: !isOpen }))
                    }
                    aria-expanded={isOpen}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 border-l-2',
                      isActive
                        ? `${colors.activeBg} ${colors.activeBorder} text-white shadow-sm`
                        : `border-transparent text-slate-400 hover:text-white ${colors.hoverBg}`
                    )}
                  >
                    <Icon className={cn('h-5 w-5 shrink-0', colors.icon)} />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 transition-transform duration-200',
                        isOpen && 'rotate-180'
                      )}
                    />
                  </button>

                  {isOpen && (
                    <ul className="mt-0.5 space-y-0.5 border-l border-white/10 pl-3 ml-4">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon;
                        const childColors = colorConfig[child.color] ?? colorConfig.blue;
                        // Exact match for the group landing page, prefix match otherwise,
                        // so /hr does not light up while sitting on /hr/payroll.
                        const childActive =
                          child.href === item.href
                            ? pathname === child.href
                            : pathname === child.href || pathname.startsWith(child.href + '/');

                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              className={cn(
                                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200 border-l-2',
                                childActive
                                  ? `${childColors.activeBg} ${childColors.activeBorder} text-white`
                                  : `border-transparent text-slate-400 hover:text-white ${childColors.hoverBg}`
                              )}
                            >
                              <ChildIcon className={cn('h-4 w-4 shrink-0', childColors.icon)} />
                              <span>{child.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            }

            // ── Plain link ──
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 border-l-2',
                    isActive
                      ? `${colors.activeBg} ${colors.activeBorder} text-white shadow-sm`
                      : `border-transparent text-slate-400 hover:text-white ${colors.hoverBg}`
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className={cn('h-5 w-5 shrink-0', colors.icon)} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User info pill */}
      {!collapsed && (
        <div className="mx-3 mb-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
          <p className="text-xs font-medium text-slate-300 truncate">{user.firstName} {user.lastName}</p>
          <p className="text-[10px] text-slate-500 truncate">{user.role}</p>
        </div>
      )}

      {/* Collapse Toggle */}
      <div className="hidden lg:block border-t border-white/10 p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-white/10 hover:text-white transition-all duration-200"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </>
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen text-white flex flex-col',
          'bg-gradient-to-b from-slate-950 via-[#0f0c29] to-slate-950',
          'border-r border-white/[0.06]',
          'transition-[width,transform] duration-300',
          'lg:translate-x-0',
          collapsed ? 'lg:w-16' : 'lg:w-64',
          'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
