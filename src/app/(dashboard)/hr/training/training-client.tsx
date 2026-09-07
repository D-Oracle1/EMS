'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { GraduationCap, Plus, Users, Loader2, Award, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
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
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  getTrainingPrograms,
  createTrainingProgram,
  updateTrainingProgramStatus,
  enrolStaffInTraining,
  getTrainingEnrollments,
  recordTrainingResult,
  getMyTraining,
} from '@/actions/hr-engagement.actions';
import { getStaffList } from '@/actions/hr.actions';
import type { SessionUser } from '@/types';

interface TrainingClientProps {
  user: SessionUser;
}

const STATUS_VARIANT: Record<string, any> = {
  PLANNED: 'secondary',
  OPEN: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'error',
};

const ENROLMENT_VARIANT: Record<string, any> = {
  NOMINATED: 'secondary',
  ENROLLED: 'info',
  ATTENDED: 'warning',
  COMPLETED: 'success',
  FAILED: 'error',
  CANCELLED: 'secondary',
  NO_SHOW: 'error',
};

const CATEGORIES = ['GENERAL', 'COMPLIANCE', 'TECHNICAL', 'LEADERSHIP', 'ONBOARDING', 'SOFT_SKILLS'];

const emptyProgram = {
  title: '',
  description: '',
  category: 'GENERAL',
  provider: '',
  mode: 'IN_PERSON',
  startDate: '',
  endDate: '',
  venue: '',
  capacity: '',
  costPerSeat: '',
  isMandatory: false,
  passMark: '50',
};

export function TrainingClient({ user }: TrainingClientProps) {
  const [programs, setPrograms] = useState<any[]>([]);
  const [myTraining, setMyTraining] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [enrolTarget, setEnrolTarget] = useState<any>(null);
  const [rosterTarget, setRosterTarget] = useState<any>(null);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyProgram);
  const [isPending, startTransition] = useTransition();

  const canManage = user.permissions.includes('HR:TRAINING_MANAGE');

  function load() {
    startTransition(async () => {
      try {
        const [p, m] = await Promise.all([getTrainingPrograms(), getMyTraining()]);
        setPrograms(p);
        setMyTraining(m);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load training');
      }
    });
  }

  useEffect(() => {
    load();
    getStaffList()
      .then(setStaff)
      .catch(() => undefined);
  }, []);

  function handleCreate() {
    if (!form.title.trim() || !form.startDate || !form.endDate) {
      toast.error('Title, start and end dates are required');
      return;
    }

    startTransition(async () => {
      const result = await createTrainingProgram({
        title: form.title,
        description: form.description || undefined,
        category: form.category,
        provider: form.provider || undefined,
        mode: form.mode as any,
        startDate: form.startDate,
        endDate: form.endDate,
        venue: form.venue || undefined,
        capacity: form.capacity ? parseInt(form.capacity, 10) : undefined,
        costPerSeat: form.costPerSeat ? parseFloat(form.costPerSeat) : undefined,
        isMandatory: form.isMandatory,
        passMark: form.passMark ? parseInt(form.passMark, 10) : undefined,
      });

      if (result.success) {
        toast.success(result.message);
        setCreateOpen(false);
        setForm(emptyProgram);
        load();
      } else {
        toast.error(result.error || 'Failed to create the programme');
      }
    });
  }

  function changeStatus(id: string, status: string) {
    startTransition(async () => {
      const result = await updateTrainingProgramStatus(id, status as any);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to update status');
      }
    });
  }

  function openEnrol(program: any) {
    setEnrolTarget(program);
    setSelectedStaff(new Set());
  }

  function confirmEnrol() {
    if (!enrolTarget || selectedStaff.size === 0) {
      toast.error('Select at least one staff member');
      return;
    }

    startTransition(async () => {
      const result = await enrolStaffInTraining({
        programId: enrolTarget.id,
        staffIds: Array.from(selectedStaff),
      });
      if (result.success) {
        toast.success(result.message);
        setEnrolTarget(null);
        load();
      } else {
        toast.error(result.error || 'Failed to enrol staff');
      }
    });
  }

  function openRoster(program: any) {
    setRosterTarget(program);
    startTransition(async () => {
      try {
        setEnrollments(await getTrainingEnrollments(program.id));
      } catch (e: any) {
        toast.error(e.message || 'Failed to load the roster');
      }
    });
  }

  function recordResult(enrollmentId: string, status: string) {
    const needsScore = status === 'COMPLETED';
    let score: number | undefined;

    if (needsScore) {
      const input = window.prompt('Score out of 100:');
      if (input === null) return;
      score = parseInt(input, 10);
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        toast.error('Enter a score between 0 and 100');
        return;
      }
    }

    startTransition(async () => {
      const result = await recordTrainingResult(enrollmentId, { status: status as any, score });
      if (result.success) {
        toast.success(result.message);
        if (rosterTarget) openRoster(rosterTarget);
        load();
      } else {
        toast.error(result.error || 'Failed to record the result');
      }
    });
  }

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
          <h1 className="text-2xl font-bold tracking-tight">Learning & Development</h1>
          <p className="text-muted-foreground">
            Training programmes, enrolment and completion tracking.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Programme
          </Button>
        )}
      </div>

      <Tabs defaultValue="programs">
        <TabsList>
          <TabsTrigger value="programs">
            Programmes
            <Badge variant="secondary" className="ml-2">
              {programs.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="mine">
            My Training
            <Badge variant="secondary" className="ml-2">
              {myTraining.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="programs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <GraduationCap className="h-5 w-5" />
                Training Programmes
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Programme</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead className="w-[150px]">Enrolment</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {programs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : 'No training programmes yet'}
                      </TableCell>
                    </TableRow>
                  )}
                  {programs.map((program) => (
                    <TableRow key={program.id}>
                      <TableCell>
                        <div className="font-medium">{program.title}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {program.code}
                        </div>
                        {program.isMandatory && (
                          <Badge variant="warning" className="mt-1 text-[10px]">
                            mandatory
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {program.category.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(program.startDate)}
                        <div className="text-xs text-muted-foreground">
                          to {formatDate(program.endDate)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {program.mode.replace('_', ' ').toLowerCase()}
                        {program.venue && (
                          <div className="text-xs text-muted-foreground">{program.venue}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm tabular-nums">
                            {program.enrolledCount}
                            {program.capacity ? `/${program.capacity}` : ''}
                          </span>
                          {program.capacity && (
                            <Progress
                              value={(program.enrolledCount / program.capacity) * 100}
                              className="h-1.5 flex-1"
                            />
                          )}
                        </div>
                        {program.completedCount > 0 && (
                          <p className="mt-1 text-[11px] text-emerald-600">
                            {program.completedCount} completed
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {program.totalCost != null ? formatCurrency(program.totalCost) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[program.status] ?? 'default'}>
                          {program.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openRoster(program)}>
                            <Users className="h-3.5 w-3.5" />
                          </Button>
                          {canManage && !['COMPLETED', 'CANCELLED'].includes(program.status) && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEnrol(program)}
                                title="Enrol staff"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                              <Select
                                value={program.status}
                                onValueChange={(v) => changeStatus(program.id, v)}
                              >
                                <SelectTrigger className="h-8 w-[120px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {['PLANNED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(
                                    (s) => (
                                      <SelectItem key={s} value={s}>
                                        {s.replace('_', ' ')}
                                      </SelectItem>
                                    )
                                  )}
                                </SelectContent>
                              </Select>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mine" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5" />
                My Training Record
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Programme</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Certificate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myTraining.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        You have no training records yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {myTraining.map((enrolment) => (
                    <TableRow key={enrolment.id}>
                      <TableCell>
                        <div className="font-medium">{enrolment.program.title}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {enrolment.program.code}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {enrolment.program.category.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(enrolment.program.startDate)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ENROLMENT_VARIANT[enrolment.status] ?? 'default'}>
                          {enrolment.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {enrolment.score != null ? enrolment.score : '—'}
                        {enrolment.passed === true && (
                          <Award className="ml-1 inline h-3.5 w-3.5 text-emerald-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        {enrolment.certificateUrl ? (
                          <a
                            href={enrolment.certificateUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New programme */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Training Programme</DialogTitle>
            <DialogDescription>
              Nominate staff once the programme is created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="t-title">Title</Label>
              <Input
                id="t-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="AML & KYC Refresher"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="t-cat">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="t-cat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-mode">Mode</Label>
                <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                  <SelectTrigger id="t-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['IN_PERSON', 'ONLINE', 'HYBRID'].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="t-start">Start Date</Label>
                <Input
                  id="t-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-end">End Date</Label>
                <Input
                  id="t-end"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="t-provider">Provider</Label>
                <Input
                  id="t-provider"
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-venue">Venue / Link</Label>
                <Input
                  id="t-venue"
                  value={form.venue}
                  onChange={(e) => setForm({ ...form, venue: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="t-cap">Capacity</Label>
                <Input
                  id="t-cap"
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-cost">Cost / Seat</Label>
                <Input
                  id="t-cost"
                  type="number"
                  value={form.costPerSeat}
                  onChange={(e) => setForm({ ...form, costPerSeat: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-pass">Pass Mark</Label>
                <Input
                  id="t-pass"
                  type="number"
                  min={0}
                  max={100}
                  value={form.passMark}
                  onChange={(e) => setForm({ ...form, passMark: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-desc">Description</Label>
              <Textarea
                id="t-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.isMandatory}
                onCheckedChange={(v) => setForm({ ...form, isMandatory: v })}
              />
              Mandatory programme
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Programme
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enrol staff */}
      <Dialog open={Boolean(enrolTarget)} onOpenChange={(open) => !open && setEnrolTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enrol Staff</DialogTitle>
            <DialogDescription>
              {enrolTarget?.title}
              {enrolTarget?.seatsLeft != null && ` — ${enrolTarget.seatsLeft} seat(s) remaining`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] space-y-1 overflow-y-auto">
            {staff.map((s: any) => (
              <label
                key={s.id}
                className="flex items-center gap-3 rounded-md p-2 text-sm hover:bg-accent/50"
              >
                <Checkbox
                  checked={selectedStaff.has(s.id)}
                  onCheckedChange={(checked) => {
                    const next = new Set(selectedStaff);
                    if (checked) next.add(s.id);
                    else next.delete(s.id);
                    setSelectedStaff(next);
                  }}
                />
                <span className="min-w-0">
                  <span className="font-medium">
                    {s.firstName} {s.lastName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {s.employeeId}
                    {s.department?.name ? ` · ${s.department.name}` : ''}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Badge variant="secondary" className="mr-auto">
              {selectedStaff.size} selected
            </Badge>
            <Button variant="outline" onClick={() => setEnrolTarget(null)}>
              Cancel
            </Button>
            <Button onClick={confirmEnrol} disabled={isPending || selectedStaff.size === 0}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enrol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Roster */}
      <Dialog open={Boolean(rosterTarget)} onOpenChange={(open) => !open && setRosterTarget(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{rosterTarget?.title} — Roster</DialogTitle>
            <DialogDescription>
              {enrollments.length} participant(s) enrolled
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participant</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Score</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No participants enrolled
                  </TableCell>
                </TableRow>
              )}
              {enrollments.map((enrolment) => (
                <TableRow key={enrolment.id}>
                  <TableCell>
                    <div className="font-medium">{enrolment.staffName}</div>
                    <div className="text-xs text-muted-foreground">{enrolment.employeeId}</div>
                  </TableCell>
                  <TableCell className="text-sm">{enrolment.department}</TableCell>
                  <TableCell>
                    <Badge variant={ENROLMENT_VARIANT[enrolment.status] ?? 'default'}>
                      {enrolment.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {enrolment.score != null ? enrolment.score : '—'}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <Select
                        value={enrolment.status}
                        onValueChange={(v) => recordResult(enrolment.id, v)}
                      >
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['ATTENDED', 'COMPLETED', 'FAILED', 'NO_SHOW', 'CANCELLED'].map((s) => (
                            <SelectItem key={s} value={s}>
                              {s.replace('_', ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
