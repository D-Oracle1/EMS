'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChevronLeft, ChevronRight, X, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItems, resolveNav, type NavItem } from '@/lib/navigation';
import { isHrFocused } from '@/lib/landing';
import type { SessionUser } from '@/types';
import { useState, useEffect } from 'react';



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

  useEffect(() => {
    onClose?.();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  // For HR-only staff the HR overview is their dashboard, so the generic one
  // would just be a thinner copy of the same numbers.
  const { items: filteredNav, headings: headingFor } = resolveNav(user, {
    hideDashboard: isHrFocused(user),
  });

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
            // Exact match for a section's landing page, prefix match otherwise,
            // so /hr does not stay lit while sitting on /hr/payroll.
            const isActive =
              item.href === '/hr' || item.href === '/dashboard'
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + '/');
            const heading = headingFor.get(item.href);

            return (
              <li key={item.href}>
                {heading && !collapsed && (
                  <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    {heading}
                  </p>
                )}
                {heading && collapsed && <div className="my-2 border-t border-white/10" />}
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
