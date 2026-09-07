'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Plus,
  Loader2,
  CheckCircle2,
  Circle,
  MinusCircle,
  AlertOctagon,
  PlayCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import {
  getOnboardings,
  getOnboardingDetail,
  startOnboarding,
  updateOnboardingTask,
  getOnboardingTemplates,
} from '@/actions/hr-lifecycle.actions';
import { getStaffList } from '@/actions/hr.actions';
import type { SessionUser } from '@/types';

interface OnboardingClientProps {
  user: SessionUser;
}

const TASK_STATUS_ICON: Record<string, { icon: React.ElementType; className: string }> = {
  PENDING: { icon: Circle, className: 'text-muted-foreground' },
  IN_PROGRESS: { icon: PlayCircle, className: 'text-sky-500' },
  COMPLETED: { icon: CheckCircle2, className: 'text-emerald-500' },
  SKIPPED: { icon: MinusCircle, className: 'text-muted-foreground' },
  BLOCKED: { icon: AlertOctagon, className: 'text-red-500' },
};

const STATUS_VARIANT: Record<string, any> = {
  NOT_STARTED: 'secondary',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'error',
};

const NONE = '__auto';

export function OnboardingClient({ user }: OnboardingClientProps) {
  const [onboardings, setOnboardings] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [form, setForm] = useState({
    staffId: '',
    templateId: NONE,
    type: 'ONBOARDING',
    startDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [isPending, startTransition] = useTransition();

  const canManage = user.permissions.includes('HR:STAFF_UPDATE');

  function load() {
    startTransition(async () => {
      try {
        setOnboardings(await getOnboardings());
      } catch (e: any) {
        toast.error(e.message || 'Failed to load checklists');
      }
    });
  }

  useEffect(() => {
    load();
    Promise.all([getOnboardingTemplates(), getStaffList()])
      .then(([t, s]) => {
        setTemplates(t);
        setStaff(s);
      })
      .catch(() => undefined);
  }, []);

  function openDetail(id: string) {
    startTransition(async () => {
      try {
        setDetail(await getOnboardingDetail(id));
      } catch (e: any) {
        toast.error(e.message || 'Failed to load the checklist');
      }
    });
  }

  function handleStart() {
    if (!form.staffId) {
      toast.error('Select a staff member');
      return;
    }

    startTransition(async () => {
      const result = await startOnboarding({
        staffId: form.staffId,
        templateId: form.templateId === NONE ? undefined : form.templateId,
        type: form.type as any,
        startDate: form.startDate,
        notes: form.notes || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        setStartOpen(false);
        setForm({ ...form, staffId: '', notes: '' });
        load();
      } else {
        toast.error(result.error || 'Failed to start the checklist');
      }
    });
  }

  function setTaskStatus(taskId: string, status: string) {
    let notes: string | undefined;
    if (status === 'BLOCKED') {
      notes = window.prompt('What is blocking this task?') ?? '';
      if (!notes.trim()) return;
    }

    startTransition(async () => {
      const result = await updateOnboardingTask(taskId, {
        status: status as any,
        notes: notes?.trim() || undefined,
      });
      if (result.success) {
        toast.success(result.message);
        if (detail) openDetail(detail.id);
        load();
      } else {
        toast.error(result.error || 'Failed to update the task');
      }
    });
  }

  const onboardingRows = onboardings.filter((o) => o.type === 'ONBOARDING');
  const offboardingRows = onboardings.filter((o) => o.type === 'OFFBOARDING');

  const renderTable = (rows: any[], emptyLabel: string) => (
    <Card>
      <CardContent className="overflow-x-auto pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Target</TableHead>
              <TableHead className="w-[180px]">Progress</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  {isPending ? 'Loading…' : emptyLabel}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">{row.staffName}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.employeeId}
                    {row.jobTitle ? ` · ${row.jobTitle}` : ''}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{row.department}</TableCell>
                <TableCell className="text-sm">{row.templateName ?? '—'}</TableCell>
                <TableCell className="text-sm">{formatDate(row.startDate)}</TableCell>
                <TableCell className="text-sm">
                  {row.targetDate ? formatDate(row.targetDate) : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={row.progressPercent} className="h-1.5 flex-1" />
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {row.completedTasks}/{row.totalTasks}
                    </span>
                  </div>
                  {row.blockedTasks > 0 && (
                    <p className="mt-1 text-[11px] text-red-500">
                      {row.blockedTasks} blocked
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>
                    {row.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => openDetail(row.id)}>
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/hr" className="text-sm text-muted-foreground hover:underline">
              Human Resources
            </Link>
            <span className="text-muted-foreground">/</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Onboarding & Exits</h1>
          <p className="text-muted-foreground">
            Checklists with owners and due dates, so nothing falls through.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setStartOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Start Checklist
          </Button>
        )}
      </div>

      <Tabs defaultValue="onboarding">
        <TabsList>
          <TabsTrigger value="onboarding">
            Onboarding
            <Badge variant="secondary" className="ml-2">
              {onboardingRows.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="offboarding">
            Offboarding
            <Badge variant="secondary" className="ml-2">
              {offboardingRows.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="templates">
            Templates
            <Badge variant="secondary" className="ml-2">
              {templates.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="onboarding" className="mt-4">
          {renderTable(onboardingRows, 'No onboarding in progress')}
        </TabsContent>
        <TabsContent value="offboarding" className="mt-4">
          {renderTable(offboardingRows, 'No offboarding in progress')}
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {templates.map((template) => (
              <Card key={template.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {template.name}
                    <Badge variant={template.type === 'ONBOARDING' ? 'info' : 'secondary'}>
                      {template.type}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {template.description && (
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {template.tasks.length} task(s) · used {template.usageCount} time(s)
                    {template.departmentName ? ` · ${template.departmentName}` : ' · all departments'}
                  </p>
                  <ol className="space-y-1 pt-2 text-sm">
                    {template.tasks.map((task: any) => (
                      <li key={task.id} className="flex items-start gap-2">
                        <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px]">
                          D+{task.dueDayOffset}
                        </Badge>
                        <span className="min-w-0">
                          {task.title}
                          {!task.isMandatory && (
                            <span className="text-xs text-muted-foreground"> (optional)</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))}
            {templates.length === 0 && (
              <Card className="md:col-span-2">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No templates configured. Run the seed, or create one from HR Configuration.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Start checklist */}
      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Checklist</DialogTitle>
            <DialogDescription>
              Tasks are copied from the template and assigned to the default owner for each role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ob-type">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger id="ob-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ONBOARDING">Onboarding</SelectItem>
                  <SelectItem value="OFFBOARDING">Offboarding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ob-staff">Staff Member</Label>
              <Select value={form.staffId} onValueChange={(v) => setForm({ ...form, staffId: v })}>
                <SelectTrigger id="ob-staff">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ob-template">Template</Label>
              <Select
                value={form.templateId}
                onValueChange={(v) => setForm({ ...form, templateId: v })}
              >
                <SelectTrigger id="ob-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Choose automatically</SelectItem>
                  {templates
                    .filter((t: any) => t.type === form.type)
                    .map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ob-date">Start Date</Label>
              <Input
                id="ob-date"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ob-notes">Notes</Label>
              <Textarea
                id="ob-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStart} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checklist detail */}
      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  {detail.staff.name} — {detail.type.toLowerCase()}
                </DialogTitle>
                <DialogDescription>
                  {detail.staff.employeeId} · {detail.staff.department}
                  {detail.staff.jobTitle ? ` · ${detail.staff.jobTitle}` : ''} · started{' '}
                  {formatDate(detail.startDate)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {detail.tasks.map((task: any) => {
                  const config = TASK_STATUS_ICON[task.status] ?? TASK_STATUS_ICON.PENDING;
                  const Icon = config.icon;

                  return (
                    <div
                      key={task.id}
                      className={`rounded-md border p-3 ${
                        task.isOverdue ? 'border-red-500/40 bg-red-500/5' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.className}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-medium ${
                                task.status === 'COMPLETED' || task.status === 'SKIPPED'
                                  ? 'text-muted-foreground line-through'
                                  : ''
                              }`}
                            >
                              {task.title}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {task.category}
                            </Badge>
                            {task.isMandatory && (
                              <Badge variant="secondary" className="text-[10px]">
                                required
                              </Badge>
                            )}
                            {task.isOverdue && (
                              <Badge variant="error" className="text-[10px]">
                                overdue
                              </Badge>
                            )}
                          </div>
                          {task.description && (
                            <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}
                            {task.assignee ? ` · ${task.assignee}` : ' · unassigned'}
                            {task.completedBy ? ` · done by ${task.completedBy}` : ''}
                          </p>
                          {task.notes && (
                            <p className="mt-1 rounded bg-muted/50 p-2 text-xs">{task.notes}</p>
                          )}
                        </div>

                        {(canManage || task.assigneeId === user.id) &&
                          detail.status === 'IN_PROGRESS' && (
                            <Select
                              value={task.status}
                              onValueChange={(v) => setTaskStatus(task.id, v)}
                            >
                              <SelectTrigger className="h-8 w-[130px] shrink-0 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']
                                  .concat(task.isMandatory ? [] : ['SKIPPED'])
                                  .map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {s.replace('_', ' ')}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
