'use client';

/**
 * The widget row from the reference design: Quick Access, To Do and Recent
 * Activity, in frosted cards.
 *
 * Quick Access is built from the same navigation model as the sidebar, so a
 * savings officer's tiles are savings tiles — the grid can never offer a way
 * into a module the sidebar refuses to show.
 */

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Grid3x3, CheckCircle2, Circle, History, ChevronRight, Loader2,
} from 'lucide-react';
import { resolveNav } from '@/lib/navigation';
import { isHrFocused } from '@/lib/landing';
import { getMyWorkspace, type WorkspaceData, type WorkspaceTask } from '@/actions/workspace.actions';
import type { SessionUser } from '@/types';

const TASK_TINT: Record<WorkspaceTask['kind'], string> = {
  loan: 'icon-tile-orange',
  savings: 'icon-tile-emerald',
  leave: 'icon-tile-violet',
  verification: 'icon-tile-amber',
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString('en-NG');
}

export function WorkspaceWidgets() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!user) return;
    startTransition(async () => {
      try {
        setData(await getMyWorkspace());
      } catch {
        // The widgets are secondary; a failure here must not take the
        // dashboard's own figures down with it.
        setData({ tasks: [], doneToday: 0, activity: [] });
      }
    });
  }, [user]);

  if (!user) return null;

  const { items } = resolveNav(user, { hideDashboard: isHrFocused(user) });
  // The reference shows a compact grid, not the whole menu.
  const quick = items.filter((i) => i.href !== '/dashboard').slice(0, 8);

  const total = (data?.tasks.length ?? 0) + (data?.doneToday ?? 0);
  const done = data?.doneToday ?? 0;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Quick Access */}
      <section className="premium-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="icon-tile icon-tile-sm icon-tile-indigo">
            <Grid3x3 className="h-4 w-4" />
          </span>
          <h2 className="font-semibold">Quick Access</h2>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {quick.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="glass-inset flex flex-col items-center gap-1.5 p-2.5 text-center transition-transform hover:-translate-y-0.5"
                title={item.label}
              >
                <span className={`icon-tile icon-tile-sm icon-tile-${item.color}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="w-full truncate text-[10px] text-muted-foreground">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* To Do */}
      <section className="premium-card flex flex-col p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="icon-tile icon-tile-sm icon-tile-emerald">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <h2 className="font-semibold">Waiting on you</h2>
        </div>

        <div className="flex-1 space-y-1">
          {isPending && !data && (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          )}
          {data && data.tasks.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing waiting on you. All clear.
            </p>
          )}
          {data?.tasks.slice(0, 5).map((task) => (
            <Link
              key={task.id}
              href={task.href}
              className="flex items-center gap-2.5 rounded-2xl px-1.5 py-2 transition-colors hover:bg-foreground/5"
            >
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{task.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{task.detail}</span>
              </span>
              <span className={`icon-tile icon-tile-sm ${TASK_TINT[task.kind]} h-7 w-7 shrink-0`} />
            </Link>
          ))}
        </div>

        {total > 0 && (
          <div className="mt-3 border-t border-border/50 pt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Completed {done} / {total}</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section className="premium-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="icon-tile icon-tile-sm icon-tile-sky">
            <History className="h-4 w-4" />
          </span>
          <h2 className="font-semibold">Recent Activity</h2>
        </div>

        <div className="space-y-1">
          {isPending && !data && (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          )}
          {data && data.activity.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing recorded yet.
            </p>
          )}
          {data?.activity.slice(0, 6).map((entry) => (
            <div key={entry.id} className="flex items-start gap-2.5 rounded-2xl px-1.5 py-1.5">
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{entry.description}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {entry.module} · {timeAgo(entry.at)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
