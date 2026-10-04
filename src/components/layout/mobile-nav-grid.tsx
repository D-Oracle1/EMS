'use client';

import { iconTileClass } from '@/components/icon-tile';
/**
 * The phone's navigation: a full-screen grid of icons.
 *
 * It replaces the sliding drawer the sidebar used to show on mobile. A drawer
 * is a desktop idea shrunk down — a long scrolling list, opened from a small
 * target in the corner. On a phone the whole screen is available and the thumb
 * is already at the bottom, so navigation opens from the tab bar and fills the
 * screen with targets big enough to hit.
 *
 * Entries come from the same `resolveNav` model as the sidebar, so a savings
 * officer sees savings tiles here and nothing the sidebar would refuse them.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { X, LogOut, ChevronDown } from 'lucide-react';
import { resolveNav } from '@/lib/navigation';
import { hidesGenericDashboard } from '@/lib/landing';
import { groupNav, isNavActive, isSectionOpen, useNavSections } from '@/lib/nav-sections';
import type { SessionUser } from '@/types';

export function MobileNavGrid({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const { choices, setOpen } = useNavSections();

  // Navigating away closes the sheet. Subscribing to the path rather than
  // setting state keeps this a single effect with no cascading render.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // A full-screen sheet behind the page's scroll would let the page move under
  // it, so the body is held still while it is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!user || !open) return null;

  // Grouped under the section headings, so a long menu still reads as a set of
  // places rather than forty identical squares. Sections fold like the rail's.
  const groups = groupNav(resolveNav(user, { hideDashboard: hidesGenericDashboard(user) }));

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background lg:hidden">
      {/* Who you are, and the way out */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 pb-3 pt-safe">
        <span className="mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white">
          {user.firstName?.[0]}
          {user.lastName?.[0]}
        </span>
        <div className="mt-3 min-w-0 flex-1">
          <p className="truncate font-semibold">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {user.role} · {user.department}
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-3 rounded-full p-2 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-28">
        {groups.map((group, index) => {
          const heading = group.heading;
          const expanded = isSectionOpen(group, pathname, choices);
          return (
            <section key={`${heading}-${index}`} className="mb-4 last:mb-0">
              {heading === null ? (
                <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Workspace
                </h2>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(heading, !expanded)}
                  aria-expanded={expanded}
                  className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl py-2 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  <span className="min-w-0 truncate">{heading}</span>
                  <span className="flex shrink-0 items-center gap-1.5 normal-case tracking-normal">
                    {!expanded && <span className="text-[11px] font-medium">{group.items.length}</span>}
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`} />
                  </span>
                </button>
              )}
              {expanded && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isNavActive(item.href, pathname);
  
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        // A generous tap target: the whole tile, not just the icon.
                        className={`flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-3xl border p-3 text-center transition-colors ${
                          active
                            ? 'border-primary/40 bg-primary/10'
                            : 'border-border/60 bg-card hover:bg-foreground/5'
                        }`}
                      >
                        <span className={`icon-tile icon-tile-sm ${iconTileClass(item.color)}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span
                          className={`w-full text-[11px] leading-tight ${
                            active ? 'font-semibold text-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 py-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-500/10"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
