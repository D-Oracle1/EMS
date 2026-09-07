'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Plus,
  Users,
  CalendarClock,
  Loader2,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import {
  getJobOpenings,
  createJobOpening,
  updateJobOpeningStatus,
  getApplications,
  updateApplicationStatus,
  getInterviews,
  getRecruitmentPipeline,
  submitInterviewFeedback,
} from '@/actions/recruitment.actions';
import { getDepartments, getBranches } from '@/actions/staff.actions';
import { getStaffList } from '@/actions/hr.actions';
import { getSalaryGrades } from '@/actions/hr-config.actions';
import type { SessionUser } from '@/types';

interface RecruitmentClientProps {
  user: SessionUser;
}

const OPENING_STATUS_VARIANT: Record<string, any> = {
  DRAFT: 'secondary',
  OPEN: 'success',
  ON_HOLD: 'warning',
  CLOSED: 'secondary',
  FILLED: 'info',
  CANCELLED: 'error',
};

const APPLICATION_STATUSES = [
  'APPLIED',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEWING',
  'OFFER_SENT',
  'OFFER_ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
] as const;

const APPLICATION_VARIANT: Record<string, any> = {
  APPLIED: 'secondary',
  SCREENING: 'info',
  SHORTLISTED: 'info',
  INTERVIEWING: 'warning',
  OFFER_SENT: 'purple',
  OFFER_ACCEPTED: 'success',
  HIRED: 'success',
  REJECTED: 'error',
  WITHDRAWN: 'secondary',
};

const NONE = '__none';

const emptyOpening = {
  title: '',
  departmentId: '',
  branchId: NONE,
  gradeId: NONE,
  description: '',
  requirements: '',
  responsibilities: '',
  employmentType: 'FULL_TIME',
  vacancies: '1',
  minSalary: '',
  maxSalary: '',
  closingDate: '',
  hiringManagerId: NONE,
  publishNow: true,
};

export function RecruitmentClient({ user }: RecruitmentClientProps) {
  const [openings, setOpenings] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [pipeline, setPipeline] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  const [openingDialog, setOpeningDialog] = useState(false);
  const [form, setForm] = useState(emptyOpening);
  const [feedbackTarget, setFeedbackTarget] = useState<any>(null);
  const [feedback, setFeedback] = useState({ score: '70', feedback: '', recommendation: 'HIRE' });
  const [isPending, startTransition] = useTransition();

  const canManage = user.permissions.includes('HR:RECRUITMENT_MANAGE');

  function load() {
    startTransition(async () => {
      try {
        const [o, a, i, p] = await Promise.all([
          getJobOpenings(),
          getApplications(),
          getInterviews({ upcoming: true }),
          getRecruitmentPipeline(),
        ]);
        setOpenings(o);
        setApplications(a);
        setInterviews(i);
        setPipeline(p);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load recruitment data');
      }
    });
  }

  useEffect(() => {
    load();
    Promise.all([getDepartments(), getBranches(), getSalaryGrades(), getStaffList()])
      .then(([d, b, g, s]) => {
        setDepartments(d);
        setBranches(b);
        setGrades(g);
        setStaff(s);
      })
      .catch(() => undefined);
  }, []);

  function handleCreateOpening() {
    if (!form.title.trim() || !form.departmentId || !form.description.trim()) {
      toast.error('Title, department and description are required');
      return;
    }

    startTransition(async () => {
      const result = await createJobOpening({
        title: form.title,
        departmentId: form.departmentId,
        branchId: form.branchId === NONE ? undefined : form.branchId,
        gradeId: form.gradeId === NONE ? undefined : form.gradeId,
        description: form.description,
        requirements: form.requirements || undefined,
        responsibilities: form.responsibilities || undefined,
        employmentType: form.employmentType as any,
        vacancies: parseInt(form.vacancies, 10) || 1,
        minSalary: form.minSalary ? parseFloat(form.minSalary) : undefined,
        maxSalary: form.maxSalary ? parseFloat(form.maxSalary) : undefined,
        closingDate: form.closingDate || undefined,
        hiringManagerId: form.hiringManagerId === NONE ? undefined : form.hiringManagerId,
        publishNow: form.publishNow,
      });

      if (result.success) {
        toast.success(result.message);
        setOpeningDialog(false);
        setForm(emptyOpening);
        load();
      } else {
        toast.error(result.error || 'Failed to create the opening');
      }
    });
  }

  function changeOpeningStatus(id: string, status: string) {
    startTransition(async () => {
      const result = await updateJobOpeningStatus(id, status as any);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to update status');
      }
    });
  }

  function changeApplicationStatus(id: string, status: string) {
    if (status === 'REJECTED') {
      const reason = window.prompt('Reason for rejection:');
      if (!reason?.trim()) return;
      startTransition(async () => {
        const result = await updateApplicationStatus(id, 'REJECTED', {
          rejectionReason: reason.trim(),
        });
        if (result.success) {
          toast.success(result.message);
          load();
        } else {
          toast.error(result.error || 'Failed to update');
        }
      });
      return;
    }

    startTransition(async () => {
      const result = await updateApplicationStatus(id, status as any);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to update');
      }
    });
  }

  function submitFeedback() {
    if (!feedbackTarget) return;
    const score = parseInt(feedback.score, 10);
    if (!Number.isFinite(score) || score < 1 || score > 100) {
      toast.error('Score must be between 1 and 100');
      return;
    }
    if (!feedback.feedback.trim()) {
      toast.error('Written feedback is required');
      return;
    }

    startTransition(async () => {
      const result = await submitInterviewFeedback(feedbackTarget.id, {
        score,
        feedback: feedback.feedback.trim(),
        recommendation: feedback.recommendation as any,
      });
      if (result.success) {
        toast.success(result.message);
        setFeedbackTarget(null);
        setFeedback({ score: '70', feedback: '', recommendation: 'HIRE' });
        load();
      } else {
        toast.error(result.error || 'Failed to submit feedback');
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
          <h1 className="text-2xl font-bold tracking-tight">Recruitment</h1>
          <p className="text-muted-foreground">From opening a role to signing the offer.</p>
        </div>
        {canManage && (
          <Button onClick={() => setOpeningDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Opening
          </Button>
        )}
      </div>

      {/* Pipeline */}
      {pipeline && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Open Roles</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{pipeline.openOpenings}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pipeline.openVacancies} vacancies to fill
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Upcoming Interviews</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {pipeline.upcomingInterviews}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Rejected / Withdrawn</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {pipeline.rejected + pipeline.withdrawn}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Hiring Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-stretch gap-2">
                {pipeline.funnel.map((stage: any, index: number) => (
                  <div
                    key={stage.stage}
                    className="flex min-w-[120px] flex-1 items-center gap-2 rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-muted-foreground">{stage.stage}</p>
                      <p className="text-xl font-bold tabular-nums">{stage.count}</p>
                    </div>
                    {index < pipeline.funnel.length - 1 && (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Tabs defaultValue="openings">
        <TabsList>
          <TabsTrigger value="openings">
            Openings
            <Badge variant="secondary" className="ml-2">
              {openings.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="applications">
            Applicants
            <Badge variant="secondary" className="ml-2">
              {applications.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="interviews">
            Interviews
            <Badge variant="secondary" className="ml-2">
              {interviews.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Openings */}
        <TabsContent value="openings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Briefcase className="h-5 w-5" />
                Job Openings
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Vacancies</TableHead>
                    <TableHead className="text-right">Applicants</TableHead>
                    <TableHead>Salary Range</TableHead>
                    <TableHead>Closing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : 'No job openings yet'}
                      </TableCell>
                    </TableRow>
                  )}
                  {openings.map((opening) => (
                    <TableRow key={opening.id}>
                      <TableCell>
                        <Link
                          href={`/hr/recruitment/${opening.id}`}
                          className="font-medium hover:underline"
                        >
                          {opening.title}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">
                          {opening.code}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {opening.department}
                        {opening.branch && (
                          <div className="text-xs text-muted-foreground">{opening.branch}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {opening.filledCount}/{opening.vacancies}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {opening.activeApplications}
                        <span className="text-muted-foreground"> / {opening.applicationCount}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">
                        {opening.minSalary != null && opening.maxSalary != null
                          ? `${formatCurrency(opening.minSalary)} – ${formatCurrency(opening.maxSalary)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {opening.closingDate ? formatDate(opening.closingDate) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={OPENING_STATUS_VARIANT[opening.status] ?? 'default'}>
                          {opening.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <Select
                            value={opening.status}
                            onValueChange={(v) => changeOpeningStatus(opening.id, v)}
                          >
                            <SelectTrigger className="h-8 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED'].map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s.replace('_', ' ')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Applications */}
        <TabsContent value="applications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Applicants
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Applied For</TableHead>
                    <TableHead>Experience</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Interviews</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : 'No applications recorded'}
                      </TableCell>
                    </TableRow>
                  )}
                  {applications.map((application) => (
                    <TableRow key={application.id}>
                      <TableCell>
                        <div className="font-medium">{application.name}</div>
                        <div className="text-xs text-muted-foreground">{application.email}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {application.applicationNumber}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{application.openingTitle}</TableCell>
                      <TableCell className="text-sm">
                        {application.yearsExperience != null
                          ? `${application.yearsExperience} yrs`
                          : '—'}
                        {application.currentEmployer && (
                          <div className="text-xs text-muted-foreground">
                            {application.currentEmployer}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {application.expectedSalary != null
                          ? formatCurrency(application.expectedSalary)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {application.interviewCount}
                      </TableCell>
                      <TableCell>
                        <Badge variant={APPLICATION_VARIANT[application.status] ?? 'default'}>
                          {application.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canManage && application.status !== 'HIRED' && (
                          <Select
                            value={application.status}
                            onValueChange={(v) => changeApplicationStatus(application.id, v)}
                          >
                            <SelectTrigger className="h-8 w-[130px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {APPLICATION_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s.replace('_', ' ')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {application.status === 'HIRED' && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600">
                            <UserCheck className="h-3.5 w-3.5" />
                            Hired
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Interviews */}
        <TabsContent value="interviews" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarClock className="h-5 w-5" />
                Upcoming Interviews
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Interviewer</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interviews.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : 'No interviews scheduled'}
                      </TableCell>
                    </TableRow>
                  )}
                  {interviews.map((interview) => (
                    <TableRow key={interview.id}>
                      <TableCell className="font-medium">{interview.candidateName}</TableCell>
                      <TableCell className="text-sm">{interview.positionTitle}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{interview.stage}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(interview.scheduledAt)}
                        <div className="text-xs text-muted-foreground">
                          {interview.durationMinutes} min
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {interview.mode.replace('_', ' ').toLowerCase()}
                        {interview.location && (
                          <div className="text-xs text-muted-foreground">{interview.location}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{interview.interviewer ?? '—'}</TableCell>
                      <TableCell>
                        {(canManage || interview.interviewerId === user.id) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setFeedbackTarget(interview)}
                          >
                            Feedback
                          </Button>
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

      {/* New opening */}
      <Dialog open={openingDialog} onOpenChange={setOpeningDialog}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Job Opening</DialogTitle>
            <DialogDescription>
              A code is generated from the department once the opening is created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="o-title">Job Title</Label>
              <Input
                id="o-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Credit Analyst"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="o-dept">Department</Label>
                <Select
                  value={form.departmentId}
                  onValueChange={(v) => setForm({ ...form, departmentId: v })}
                >
                  <SelectTrigger id="o-dept">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="o-branch">Branch</Label>
                <Select
                  value={form.branchId}
                  onValueChange={(v) => setForm({ ...form, branchId: v })}
                >
                  <SelectTrigger id="o-branch">
                    <SelectValue placeholder="Any branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Any branch</SelectItem>
                    {branches.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="o-type">Employment Type</Label>
                <Select
                  value={form.employmentType}
                  onValueChange={(v) => setForm({ ...form, employmentType: v })}
                >
                  <SelectTrigger id="o-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'NYSC', 'CONSULTANT'].map(
                      (t) => (
                        <SelectItem key={t} value={t}>
                          {t.replace('_', ' ')}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="o-vac">Vacancies</Label>
                <Input
                  id="o-vac"
                  type="number"
                  min={1}
                  value={form.vacancies}
                  onChange={(e) => setForm({ ...form, vacancies: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="o-grade">Grade</Label>
                <Select value={form.gradeId} onValueChange={(v) => setForm({ ...form, gradeId: v })}>
                  <SelectTrigger id="o-grade">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not specified</SelectItem>
                    {grades.map((g: any) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="o-min">Min Salary</Label>
                <Input
                  id="o-min"
                  type="number"
                  value={form.minSalary}
                  onChange={(e) => setForm({ ...form, minSalary: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="o-max">Max Salary</Label>
                <Input
                  id="o-max"
                  type="number"
                  value={form.maxSalary}
                  onChange={(e) => setForm({ ...form, maxSalary: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="o-close">Closing Date</Label>
                <Input
                  id="o-close"
                  type="date"
                  value={form.closingDate}
                  onChange={(e) => setForm({ ...form, closingDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="o-manager">Hiring Manager</Label>
              <Select
                value={form.hiringManagerId}
                onValueChange={(v) => setForm({ ...form, hiringManagerId: v })}
              >
                <SelectTrigger id="o-manager">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {staff.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="o-desc">Description</Label>
              <Textarea
                id="o-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What the role is about"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="o-resp">Responsibilities</Label>
              <Textarea
                id="o-resp"
                value={form.responsibilities}
                onChange={(e) => setForm({ ...form, responsibilities: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="o-req">Requirements</Label>
              <Textarea
                id="o-req"
                value={form.requirements}
                onChange={(e) => setForm({ ...form, requirements: e.target.value })}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.publishNow}
                onCheckedChange={(v) => setForm({ ...form, publishNow: v })}
              />
              Open for applications immediately
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpeningDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOpening} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Opening
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interview feedback */}
      <Dialog
        open={Boolean(feedbackTarget)}
        onOpenChange={(open) => !open && setFeedbackTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Interview Feedback</DialogTitle>
            <DialogDescription>
              {feedbackTarget &&
                `${feedbackTarget.candidateName} — ${feedbackTarget.stage} for ${feedbackTarget.positionTitle}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="f-score">Score (1–100)</Label>
                <Input
                  id="f-score"
                  type="number"
                  min={1}
                  max={100}
                  value={feedback.score}
                  onChange={(e) => setFeedback({ ...feedback, score: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-rec">Recommendation</Label>
                <Select
                  value={feedback.recommendation}
                  onValueChange={(v) => setFeedback({ ...feedback, recommendation: v })}
                >
                  <SelectTrigger id="f-rec">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['STRONG_HIRE', 'HIRE', 'NEUTRAL', 'NO_HIRE', 'STRONG_NO_HIRE'].map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-notes">Written Feedback</Label>
              <Textarea
                id="f-notes"
                value={feedback.feedback}
                onChange={(e) => setFeedback({ ...feedback, feedback: e.target.value })}
                placeholder="Strengths, concerns, and the reasoning behind your recommendation"
                className="min-h-[120px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitFeedback} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
