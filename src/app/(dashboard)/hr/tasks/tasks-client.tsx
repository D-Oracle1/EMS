'use client';

/**
 * HR task assignment.
 *
 * HR hands a staff member a task with a deadline; the staff member reports it
 * complete from their own dashboard. This screen is the assigning half — the
 * completing half lives in the To Do widget on the workspace.
 */

import { useEffect, useState, useTransition } from 'react';
import {
  ClipboardCheck,
  Plus,
  Loader2,
  CalendarClock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  assignStaffTask,
  cancelStaffTask,
  listStaffTasks,
  type StaffTaskView,
} from '@/actions/staff-tasks.actions';
import { getStaffList } from '@/actions/hr.actions';
import type { SessionUser } from '@/types';

const STATUS_VARIANT: Record<string, 'secondary' | 'warning' | 'success' | 'error'> = {
  PENDING: 'secondary',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'error',
};

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const ALL = '__all';

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * How long is left, in words. Nothing stores a duration — a task carries a
 * start and a deadline, and the span between them is the duration, so this is
 * derived rather than remembered and can never go stale.
 */
export function deadlineLabel(task: Pick<StaffTaskView, 'status' | 'dueDate' | 'completedAt'>): {
  text: string;
  tone: 'muted' | 'warn' | 'over' | 'done';
} {
  if (task.status === 'COMPLETED') {
    return { text: task.completedAt ? `Completed ${shortDate(task.completedAt)}` : 'Completed', tone: 'done' };
  }
  if (task.status === 'CANCELLED') return { text: 'Cancelled', tone: 'muted' };

  const midnightToday = new Date();
  midnightToday.setHours(0, 0, 0, 0);
  const dueDay = new Date(task.dueDate);
  dueDay.setHours(0, 0, 0, 0);

  const days = Math.round((dueDay.getTime() - midnightToday.getTime()) / 86_400_000);
  if (days < 0) return { text: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, tone: 'over' };
  if (days === 0) return { text: 'Due today', tone: 'warn' };
  if (days === 1) return { text: '1 day left', tone: 'warn' };
  return { text: `${days} days left`, tone: 'muted' };
}

const TONE_CLASS: Record<string, string> = {
  muted: 'text-muted-foreground',
  warn: 'text-amber-600',
  over: 'text-rose-600 font-medium',
  done: 'text-emerald-600',
};

interface Props {
  user: SessionUser;
}

export function StaffTasksClient({ user }: Props) {
  const [tasks, setTasks] = useState<StaffTaskView[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canManage = user.permissions.includes('HR:STAFF_UPDATE');

  const today = new Date().toISOString().slice(0, 10);
  const emptyForm = {
    assigneeId: '',
    title: '',
    description: '',
    category: 'GENERAL',
    priority: 'NORMAL' as (typeof PRIORITIES)[number],
    startDate: today,
    dueDate: '',
  };
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    startTransition(async () => {
      try {
        setTasks(await listStaffTasks(statusFilter === ALL ? undefined : { status: statusFilter as never }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not load tasks');
      }
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    getStaffList({ status: 'ACTIVE' })
      .then(setStaff)
      .catch((error) => {
        // An empty picker is indistinguishable from "these people cannot be
        // assigned work", so report the reason rather than leaving a silent
        // dead dropdown behind.
        toast.error(error instanceof Error ? error.message : 'Could not load the staff list');
      });
  }, []);

  const submit = async () => {
    setBusy(true);
    const result = await assignStaffTask(form);
    setBusy(false);

    if (result.success) {
      toast.success(result.message ?? 'Task assigned');
      setOpen(false);
      setForm(emptyForm);
      load();
    } else {
      toast.error(result.error);
    }
  };

  const cancel = async (id: string) => {
    const result = await cancelStaffTask(id);
    if (result.success) {
      toast.success(result.message ?? 'Cancelled');
      load();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-description">
            Assign work to a staff member with a deadline. They report it complete from their own
            dashboard.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="IN_PROGRESS">In progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          {canManage && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-full">
                  <Plus className="mr-1 h-4 w-4" /> Assign task
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign a task</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Staff member</Label>
                    <Select
                      value={form.assigneeId}
                      onValueChange={(value) => setForm((f) => ({ ...f, assigneeId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose who this is for" />
                      </SelectTrigger>
                      <SelectContent>
                        {staff.length === 0 && (
                          <div className="px-2 py-3 text-sm text-muted-foreground">
                            No staff loaded yet.
                          </div>
                        )}
                        {/* The role is shown because every active member of
                            staff is assignable — managers, the director and the
                            administrator included — and a list of bare names
                            gives no way to tell that. */}
                        {staff.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.firstName} {member.lastName}
                            {member.role?.name ? ` · ${member.role.name}` : ''} — {member.employeeId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Task</Label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Reconcile the September petty cash"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Details (optional)</Label>
                    <Textarea
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Anything they need to know to finish it"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Starts</Label>
                      <Input
                        type="date"
                        value={form.startDate}
                        onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Deadline</Label>
                      <Input
                        type="date"
                        value={form.dueDate}
                        min={form.startDate}
                        onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Priority</Label>
                      <Select
                        value={form.priority}
                        onValueChange={(value) =>
                          setForm((f) => ({ ...f, priority: value as (typeof PRIORITIES)[number] }))
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              {priority.charAt(0) + priority.slice(1).toLowerCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Input
                        value={form.category}
                        onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                        placeholder="GENERAL"
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    onClick={submit}
                    disabled={busy || !form.assigneeId || !form.title.trim() || !form.dueDate}
                    className="rounded-full"
                  >
                    {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Assign
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardCheck className="h-5 w-5 text-teal-600" />
            Assigned tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isPending && tasks.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : tasks.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No tasks yet. Assign one and it appears on that person&rsquo;s dashboard straight away.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Assigned to</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => {
                    const deadline = deadlineLabel(task);
                    return (
                      <TableRow key={task.id}>
                        <TableCell>
                          <p className="font-medium">{task.title}</p>
                          {task.description && (
                            <p className="max-w-[280px] truncate text-xs text-muted-foreground">
                              {task.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {task.assignee?.name ?? '—'}
                          <span className="block text-xs text-muted-foreground">
                            {task.assignee?.employeeId}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {shortDate(task.startDate)} → {shortDate(task.dueDate)}
                        </TableCell>
                        <TableCell className={`whitespace-nowrap text-sm ${TONE_CLASS[deadline.tone]}`}>
                          {deadline.text}
                        </TableCell>
                        <TableCell className="text-xs">{task.priority}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[task.status] ?? 'secondary'} className="text-xs">
                            {task.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-rose-600"
                              onClick={() => cancel(task.id)}
                            >
                              <XCircle className="mr-1 h-3.5 w-3.5" /> Cancel
                            </Button>
                          )}
                          {task.status === 'COMPLETED' && (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Done
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" />
        A task&rsquo;s duration is the span between its start and its deadline, so the countdown on
        someone&rsquo;s dashboard always matches the dates set here.
      </p>
    </div>
  );
}
