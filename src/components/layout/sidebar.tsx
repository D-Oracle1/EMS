'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { X, Landmark, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveNav } from '@/lib/navigation';
import { isHrFocused } from '@/lib/landing';
import type { SessionUser } from '@/types';
import { useEffect } from 'react';

// All class names written out statically for Tailwind JIT
const colorConfig: Record<string, { icon: string; activeBg: string; activeRing: string; hoverBg: string }> = {
  blue:    { icon: 'text-blue-400',    activeBg: 'bg-blue-500/20',    activeRing: 'ring-blue-400/50',    hoverBg: 'hover:bg-blue-500/10' },
  cyan:    { icon: 'text-cyan-400',    activeBg: 'bg-cyan-500/20',    activeRing: 'ring-cyan-400/50',    hoverBg: 'hover:bg-cyan-500/10' },
  orange:  { icon: 'text-orange-400',  activeBg: 'bg-orange-500/20',  activeRing: 'ring-orange-400/50',  hoverBg: 'hover:bg-orange-500/10' },
  emerald: { icon: 'text-emerald-400', activeBg: 'bg-emerald-500/20', activeRing: 'ring-emerald-400/50', hoverBg: 'hover:bg-emerald-500/10' },
  purple:  { icon: 'text-purple-400',  activeBg: 'bg-purple-500/20',  activeRing: 'ring-purple-400/50',  hoverBg: 'hover:bg-purple-500/10' },
  yellow:  { icon: 'text-yellow-400',  activeBg: 'bg-yellow-500/20',  activeRing: 'ring-yellow-400/50',  hoverBg: 'hover:bg-yellow-500/10' },
  sky:     { icon: 'text-sky-400',     activeBg: 'bg-sky-500/20',     activeRing: 'ring-sky-400/50',     hoverBg: 'hover:bg-sky-500/10' },
  pink:    { icon: 'text-pink-400',    activeBg: 'bg-pink-500/20',    activeRing: 'ring-pink-400/50',    hoverBg: 'hover:bg-pink-500/10' },
  violet:  { icon: 'text-violet-400',  activeBg: 'bg-violet-500/20',  activeRing: 'ring-violet-400/50',  hoverBg: 'hover:bg-violet-500/10' },
  indigo:  { icon: 'text-indigo-400',  activeBg: 'bg-indigo-500/20',  activeRing: 'ring-indigo-400/50',  hoverBg: 'hover:bg-indigo-500/10' },
  teal:    { icon: 'text-teal-400',    activeBg: 'bg-teal-500/20',    activeRing: 'ring-teal-400/50',    hoverBg: 'hover:bg-teal-500/10' },
  amber:   { icon: 'text-amber-400',   activeBg: 'bg-amber-500/20',   activeRing: 'ring-amber-400/50',   hoverBg: 'hover:bg-amber-500/10' },
  gold:    { icon: 'text-yellow-300',  activeBg: 'bg-yellow-500/20',  activeRing: 'ring-yellow-300/50',  hoverBg: 'hover:bg-yellow-500/10' },
  rose:    { icon: 'text-rose-400',    activeBg: 'bg-rose-500/20',    activeRing: 'ring-rose-400/50',    hoverBg: 'hover:bg-rose-500/10' },
  fuchsia: { icon: 'text-fuchsia-400', activeBg: 'bg-fuchsia-500/20', activeRing: 'ring-fuchsia-400/50', hoverBg: 'hover:bg-fuchsia-500/10' },
  slate:   { icon: 'text-slate-400',   activeBg: 'bg-slate-500/20',   activeRing: 'ring-slate-400/50',   hoverBg: 'hover:bg-slate-500/10' },
  gray:    { icon: 'text-gray-400',    activeBg: 'bg-gray-500/20',    activeRing: 'ring-gray-400/50',    hoverBg: 'hover:bg-gray-500/10' },
};

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
  /** Held open, rather than expanding only while hovered. */
  pinned?: boolean;
  onPinnedChange?: (pinned: boolean) => void;
}

/**
 * A floating icon rail that expands on hover.
 *
 * At rest it shows icons only, matching the reference design. Hovering — or
 * pinning — slides the labels in. The expansion overlays the page rather than
 * pushing it, so passing the pointer over the rail never reflows what the user
 * is reading; pinning is the deliberate act that moves the content across.
 *
 * The width is driven by `group-hover` in CSS rather than React state, so the
 * open and close are frame-perfect and survive rapid pointer movement.
 */
export function Sidebar({ mobileOpen = false, onClose, pinned = false, onPinnedChange }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  useEffect(() => {
    onClose?.();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  // For HR-only staff the HR overview is their dashboard, so the generic one
  // would just be a thinner copy of the same numbers.
  const { items: filteredNav, headings: headingFor } = resolveNav(user, {
    hideDashboard: isHrFocused(user),
  });

  // Labels and headings fade in together with the width.
  const reveal = pinned
    ? 'opacity-100'
    : 'opacity-0 group-hover/rail:opacity-100 lg:delay-75';

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
          'group/rail fixed z-50 flex flex-col text-white',
          // Floating and rounded, like the reference, rather than flush to the edge.
          'lg:left-3 lg:top-3 lg:bottom-3 lg:rounded-[1.75rem]',
          'left-0 top-0 h-screen lg:h-auto',
          'bg-gradient-to-b from-slate-950 via-[#0f0c29] to-slate-950',
          'border border-white/[0.08] shadow-2xl shadow-black/40',
          'transition-[width,transform] duration-300 ease-out',
          'overflow-hidden',
          'w-64',
          pinned ? 'lg:w-64' : 'lg:w-[76px] lg:hover:w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-2.5 px-[1.15rem]">
          <Link href="/dashboard" className="group/logo relative flex items-center gap-2.5">
            <span className="relative shrink-0">
              <Landmark className="h-7 w-7 text-indigo-400 transition-colors duration-200 group-hover/logo:text-indigo-300" />
              <span className="absolute inset-0 rounded-full bg-indigo-400/20 blur-lg transition-all duration-200 group-hover/logo:bg-indigo-300/30" />
            </span>
            <span className={cn('whitespace-nowrap transition-opacity duration-200', reveal)}>
              <span className="block bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-lg font-bold leading-tight text-transparent">
                Hylink
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-widest text-slate-500">
                Finance EMS
              </span>
            </span>
          </Link>
          <button
            onClick={onClose}
            className="ml-auto p-1 text-slate-500 transition-colors hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 no-scrollbar">
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
                  {heading && (
                    <p
                      className={cn(
                        'overflow-hidden whitespace-nowrap px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-slate-500 transition-opacity duration-200',
                        reveal
                      )}
                    >
                      {heading}
                    </p>
                  )}
                  <Link
                    href={item.href}
                    // The icon never moves as the rail opens: it sits in a fixed
                    // 44px box at the same offset in both states.
                    className={cn(
                      'flex items-center gap-3 rounded-2xl py-2 pl-[0.35rem] pr-3 text-sm font-medium transition-colors duration-200',
                      isActive
                        ? `${colors.activeBg} text-white ring-1 ${colors.activeRing}`
                        : `text-slate-400 hover:text-white ${colors.hoverBg}`
                    )}
                    title={item.label}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                      <Icon className={cn('h-5 w-5', colors.icon)} />
                    </span>
                    <span
                      className={cn(
                        'overflow-hidden whitespace-nowrap transition-opacity duration-200',
                        reveal
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Who is signed in, and the pin */}
        <div className="shrink-0 border-t border-white/10 p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold">
              {user.firstName?.[0]}
              {user.lastName?.[0]}
            </span>
            <div className={cn('min-w-0 flex-1 transition-opacity duration-200', reveal)}>
              <p className="truncate text-xs font-medium text-slate-200">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-[10px] text-slate-500">{user.role}</p>
            </div>
            <button
              onClick={() => onPinnedChange?.(!pinned)}
              className={cn(
                'hidden shrink-0 rounded-lg p-1.5 text-slate-500 transition-all duration-200 hover:bg-white/10 hover:text-white lg:block',
                reveal
              )}
              aria-label={pinned ? 'Unpin the menu' : 'Keep the menu open'}
              title={pinned ? 'Unpin the menu' : 'Keep the menu open'}
            >
              {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
