'use client';

/**
 * The workspace widget cards: Quick Access, To Do and Recent Activity.
 *
 * Quick Access is built from the same navigation model as the sidebar, so a
 * savings officer's tiles are savings tiles — the grid can never offer a way
 * into a module the sidebar refuses to show.
 *
 * To Do is exported separately as `WorkspaceTodo` because it sits in a
 * different row from the other two on the dashboard, beside the savings cards.
 * It therefore loads its own workspace data rather than receiving it — one
 * extra light read, in exchange for a card that can be placed anywhere.
 */

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Grid3x3, CheckCircle2, Circle, History, ChevronRight, Loader2, CalendarClock, Maximize2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { resolveNav } from '@/lib/navigation';
import { isHrFocused } from '@/lib/landing';
import { getMyWorkspace, type WorkspaceData, type WorkspaceTask } from '@/actions/workspace.actions';
import {
  getMyTasks, completeStaffTask, type StaffTaskView,
} from '@/actions/staff-tasks.actions';
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

/** How long is left on a task, in words. Derived from the deadline, never stored. */
function deadlineLabel(task: StaffTaskView): { text: string; className: string } {
  const midnightToday = new Date();
  midnightToday.setHours(0, 0, 0, 0);
  const dueDay = new Date(task.dueDate);
  dueDay.setHours(0, 0, 0, 0);

  const days = Math.round((dueDay.getTime() - midnightToday.getTime()) / 86_400_000);
  if (days < 0) {
    return {
      text: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`,
      className: 'text-rose-600 font-medium',
    };
  }
  if (days === 0) return { text: 'Due today', className: 'text-amber-600' };
  if (days === 1) return { text: '1 day left', className: 'text-amber-600' };
  return { text: `${days} days left`, className: 'text-muted-foreground' };
}

// ============================================================================
// TO DO
// ============================================================================

/**
 * What is waiting on you: tasks HR has assigned, then the approval queue.
 *
 * The card summarises; the dialog is the full list. Expanding is a deliberate
 * control rather than a click anywhere on the card, because the rows inside it
 * are themselves links and buttons — a card-wide handler would swallow them.
 */
export function WorkspaceTodo() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  const [data, setData] = useState<WorkspaceData | null>(null);
  const [myTasks, setMyTasks] = useState<StaffTaskView[]>([]);
  const [closing, setClosing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadMyTasks = () => {
    getMyTasks()
      .then((tasks) => setMyTasks(tasks.filter((t) => t.status !== 'COMPLETED')))
      .catch(() => {
        // An empty task list is survivable; the rest of the card still renders.
      });
  };

  useEffect(() => {
    if (!user) return;
    startTransition(async () => {
      try {
        setData(await getMyWorkspace());
      } catch {
        // The widget is secondary; a failure here must not take the
        // dashboard's own figures down with it.
        setData({ tasks: [], doneToday: 0, activity: [] });
      }
    });
    loadMyTasks();
  }, [user]);

  async function markDone(task: StaffTaskView) {
    setClosing(task.id);
    const result = await completeStaffTask(task.id);
    setClosing(null);
    if (result.success) {
      toast.success(result.message ?? 'Task marked complete');
      loadMyTasks();
    } else {
      toast.error(result.error);
    }
  }

  if (!user) return null;

  const queue = data?.tasks ?? [];
  const total = queue.length + (data?.doneToday ?? 0);
  const done = data?.doneToday ?? 0;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const outstanding = myTasks.length + queue.length;

  const assignedRow = (task: StaffTaskView) => {
    const deadline = deadlineLabel(task);
    return (
      <div key={task.id} className="glass-inset flex items-start gap-2.5 px-2.5 py-2">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{task.title}</span>
          <span className={`block text-xs ${deadline.className}`}>
            {deadline.text}
            {task.assignedBy ? ` · set by ${task.assignedBy.name}` : ''}
          </span>
          {task.description && (
            <span className="mt-0.5 block text-xs text-muted-foreground">{task.description}</span>
          )}
        </span>
        <button
          onClick={() => markDone(task)}
          disabled={closing === task.id}
          className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
        >
          {closing === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Done'}
        </button>
      </div>
    );
  };

  const queueRow = (task: WorkspaceTask) => (
    <Link
      key={task.id}
      href={task.href}
      className="flex items-center gap-2.5 rounded-2xl px-1.5 py-2 transition-colors hover:bg-foreground/5"
    >
      <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{task.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{task.detail}</span>
      </span>
      <span className={`icon-tile icon-tile-sm ${TASK_TINT[task.kind]} h-7 w-7 shrink-0`} />
    </Link>
  );

  return (
    <>
      <section className="premium-card flex flex-col p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="icon-tile icon-tile-sm icon-tile-emerald">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <h2 className="font-semibold">Waiting on you</h2>
          {outstanding > 0 && (
            <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium">
              {outstanding}
            </span>
          )}
          <button
            onClick={() => setExpanded(true)}
            className="ml-auto rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            aria-label="Open the full list"
            title="Open the full list"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-1">
          {isPending && !data && (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          )}

          {/* Assigned by HR. These carry a deadline someone else is counting
              on, so they sit above the approval queue and are the only rows
              here that can be cleared from the widget itself. */}
          {myTasks.slice(0, 3).map(assignedRow)}

          {data && queue.length === 0 && myTasks.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing waiting on you. All clear.
            </p>
          )}

          {queue.slice(0, 4).map(queueRow)}
        </div>

        {outstanding > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="mt-3 w-full rounded-2xl border border-border/60 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            View all {outstanding}
          </button>
        )}

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

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Waiting on you</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <section className="space-y-1.5">
              <h3 className="text-sm font-semibold">
                Assigned to you{myTasks.length > 0 ? ` (${myTasks.length})` : ''}
              </h3>
              {myTasks.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  HR has not assigned you anything.
                </p>
              ) : (
                myTasks.map(assignedRow)
              )}
            </section>

            <section className="space-y-1.5">
              <h3 className="text-sm font-semibold">
                Your queue{queue.length > 0 ? ` (${queue.length})` : ''}
              </h3>
              {queue.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nothing is waiting for a decision from you.
                </p>
              ) : (
                queue.map(queueRow)
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================================
// QUICK ACCESS + RECENT ACTIVITY
// ============================================================================

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
        setData({ tasks: [], doneToday: 0, activity: [] });
      }
    });
  }, [user]);

  if (!user) return null;

  const { items } = resolveNav(user, { hideDashboard: isHrFocused(user) });
  // The reference shows a compact grid, not the whole menu.
  const quick = items.filter((i) => i.href !== '/dashboard').slice(0, 8);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
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
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
