'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, CalendarPlus, Loader2, Star, UserCheck,
  Briefcase, Users, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
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
  createApplication,
  scheduleInterview,
  linkApplicationToStaff,
} from '@/actions/recruitment.actions';
import type { SessionUser } from '@/types';

interface OpeningDetailClientProps {
  opening: any;
  user: SessionUser;
}

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

const emptyApplicant = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  yearsExperience: '',
  currentEmployer: '',
  currentPosition: '',
  expectedSalary: '',
  highestQualification: '',
  source: 'WEBSITE',
  resumeUrl: '',
  coverLetter: '',
};

export function OpeningDetailClient({ opening, user }: OpeningDetailClientProps) {
  const router = useRouter();
  const [applicantOpen, setApplicantOpen] = useState(false);
  const [applicant, setApplicant] = useState(emptyApplicant);
  const [interviewTarget, setInterviewTarget] = useState<any>(null);
  const [interview, setInterview] = useState({
    stage: 'SCREENING',
    scheduledAt: '',
    durationMinutes: '45',
    mode: 'IN_PERSON',
    location: '',
  });
  const [hireTarget, setHireTarget] = useState<any>(null);
  const [staffId, setStaffId] = useState('');
  const [isPending, startTransition] = useTransition();

  const canManage = user.permissions.includes('HR:RECRUITMENT_MANAGE');

  function addApplicant() {
    if (
      !applicant.firstName.trim() ||
      !applicant.lastName.trim() ||
      !applicant.email.trim() ||
      !applicant.phone.trim()
    ) {
      toast.error('Name, email and phone are required');
      return;
    }

    startTransition(async () => {
      const result = await createApplication({
        openingId: opening.id,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        email: applicant.email,
        phone: applicant.phone,
        yearsExperience: applicant.yearsExperience
          ? parseInt(applicant.yearsExperience, 10)
          : undefined,
        currentEmployer: applicant.currentEmployer || undefined,
        currentPosition: applicant.currentPosition || undefined,
        expectedSalary: applicant.expectedSalary
          ? parseFloat(applicant.expectedSalary)
          : undefined,
        highestQualification: applicant.highestQualification || undefined,
        source: applicant.source,
        resumeUrl: applicant.resumeUrl || undefined,
        coverLetter: applicant.coverLetter || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        setApplicantOpen(false);
        setApplicant(emptyApplicant);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to record the application');
      }
    });
  }

  function bookInterview() {
    if (!interviewTarget) return;
    if (!interview.scheduledAt) {
      toast.error('Pick a date and time');
      return;
    }

    startTransition(async () => {
      const result = await scheduleInterview({
        applicationId: interviewTarget.id,
        stage: interview.stage,
        scheduledAt: interview.scheduledAt,
        durationMinutes: parseInt(interview.durationMinutes, 10) || 45,
        mode: interview.mode as any,
        location: interview.location || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        setInterviewTarget(null);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to schedule the interview');
      }
    });
  }

  function confirmHire() {
    if (!hireTarget || !staffId.trim()) {
      toast.error('Enter the staff record ID created for this hire');
      return;
    }

    startTransition(async () => {
      const result = await linkApplicationToStaff(hireTarget.id, staffId.trim());
      if (result.success) {
        toast.success(result.message);
        setHireTarget(null);
        setStaffId('');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to link the hire');
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/hr/recruitment">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Recruitment
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{opening.title}</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{opening.code}</span> · {opening.department.name}
              {opening.branch ? ` · ${opening.branch.name}` : ''}
            </p>
          </div>
        </div>
        {canManage && ['OPEN', 'DRAFT'].includes(opening.status) && (
          <Button onClick={() => setApplicantOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Applicant
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Status"
          color="cyan"
          value={opening.status.replace('_', ' ')}
          icon={Briefcase}
        />
        <StatCard
          title="Vacancies"
          color="indigo"
          value={opening.filledCount}
          secondaryValue={opening.vacancies}
          icon={UserCheck}
          progress={
            opening.vacancies > 0 ? (opening.filledCount / opening.vacancies) * 100 : 0
          }
        />
        <StatCard
          title="Applicants"
          color="sky"
          value={opening.applications.length}
          icon={Users}
        />
        <StatCard
          title="Salary Range"
          color="emerald"
          value={
            opening.minSalary != null && opening.maxSalary != null
              ? `${formatCurrency(opening.minSalary)} – ${formatCurrency(opening.maxSalary)}`
              : 'Not disclosed'
          }
          icon={Wallet}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Applicants</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Experience</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {opening.applications.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      No applications yet
                    </TableCell>
                  </TableRow>
                )}
                {opening.applications.map((application: any) => (
                  <TableRow key={application.id}>
                    <TableCell>
                      <div className="font-medium">{application.name}</div>
                      <div className="text-xs text-muted-foreground">{application.email}</div>
                      <div className="text-xs text-muted-foreground">{application.phone}</div>
                    </TableCell>
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
                    <TableCell>
                      {application.rating ? (
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span className="tabular-nums">{application.rating}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={APPLICATION_VARIANT[application.status] ?? 'default'}>
                        {application.status.replace('_', ' ')}
                      </Badge>
                      {application.interviewCount > 0 && (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {application.interviewCount} interview
                          {application.interviewCount === 1 ? '' : 's'}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <div className="flex gap-1">
                          {!['REJECTED', 'WITHDRAWN', 'HIRED'].includes(application.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setInterviewTarget(application)}
                              title="Schedule an interview"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {['OFFER_ACCEPTED', 'OFFER_SENT'].includes(application.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setHireTarget(application)}
                              title="Link to a staff record"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Role Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="mb-1 font-medium">Description</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{opening.description}</p>
            </div>
            {opening.responsibilities && (
              <>
                <Separator />
                <div>
                  <p className="mb-1 font-medium">Responsibilities</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {opening.responsibilities}
                  </p>
                </div>
              </>
            )}
            {opening.requirements && (
              <>
                <Separator />
                <div>
                  <p className="mb-1 font-medium">Requirements</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {opening.requirements}
                  </p>
                </div>
              </>
            )}
            <Separator />
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Employment type</span>
                <span>{opening.employmentType.replace('_', ' ')}</span>
              </div>
              {opening.grade && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Grade</span>
                  <span>{opening.grade.name}</span>
                </div>
              )}
              {opening.hiringManager && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hiring manager</span>
                  <span>
                    {opening.hiringManager.firstName} {opening.hiringManager.lastName}
                  </span>
                </div>
              )}
              {opening.openedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Opened</span>
                  <span>{formatDate(opening.openedAt)}</span>
                </div>
              )}
              {opening.closingDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Closes</span>
                  <span>{formatDate(opening.closingDate)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add applicant */}
      <Dialog open={applicantOpen} onOpenChange={setApplicantOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Applicant</DialogTitle>
            <DialogDescription>Applying for {opening.title}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="a-first">First Name</Label>
                <Input
                  id="a-first"
                  value={applicant.firstName}
                  onChange={(e) => setApplicant({ ...applicant, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-last">Last Name</Label>
                <Input
                  id="a-last"
                  value={applicant.lastName}
                  onChange={(e) => setApplicant({ ...applicant, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="a-email">Email</Label>
                <Input
                  id="a-email"
                  type="email"
                  value={applicant.email}
                  onChange={(e) => setApplicant({ ...applicant, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-phone">Phone</Label>
                <Input
                  id="a-phone"
                  value={applicant.phone}
                  onChange={(e) => setApplicant({ ...applicant, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="a-exp">Years Experience</Label>
                <Input
                  id="a-exp"
                  type="number"
                  min={0}
                  value={applicant.yearsExperience}
                  onChange={(e) => setApplicant({ ...applicant, yearsExperience: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-salary">Expected Salary</Label>
                <Input
                  id="a-salary"
                  type="number"
                  value={applicant.expectedSalary}
                  onChange={(e) => setApplicant({ ...applicant, expectedSalary: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-source">Source</Label>
                <Select
                  value={applicant.source}
                  onValueChange={(v) => setApplicant({ ...applicant, source: v })}
                >
                  <SelectTrigger id="a-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['WEBSITE', 'REFERRAL', 'AGENCY', 'WALK_IN', 'LINKEDIN'].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="a-employer">Current Employer</Label>
                <Input
                  id="a-employer"
                  value={applicant.currentEmployer}
                  onChange={(e) => setApplicant({ ...applicant, currentEmployer: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-position">Current Position</Label>
                <Input
                  id="a-position"
                  value={applicant.currentPosition}
                  onChange={(e) => setApplicant({ ...applicant, currentPosition: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="a-qual">Highest Qualification</Label>
                <Input
                  id="a-qual"
                  value={applicant.highestQualification}
                  onChange={(e) =>
                    setApplicant({ ...applicant, highestQualification: e.target.value })
                  }
                  placeholder="BSc Accounting"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-resume">Résumé URL</Label>
                <Input
                  id="a-resume"
                  value={applicant.resumeUrl}
                  onChange={(e) => setApplicant({ ...applicant, resumeUrl: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-cover">Cover Letter / Notes</Label>
              <Textarea
                id="a-cover"
                value={applicant.coverLetter}
                onChange={(e) => setApplicant({ ...applicant, coverLetter: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplicantOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addApplicant} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Applicant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule interview */}
      <Dialog
        open={Boolean(interviewTarget)}
        onOpenChange={(open) => !open && setInterviewTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Interview</DialogTitle>
            <DialogDescription>{interviewTarget?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="i-stage">Stage</Label>
                <Select
                  value={interview.stage}
                  onValueChange={(v) => setInterview({ ...interview, stage: v })}
                >
                  <SelectTrigger id="i-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['SCREENING', 'TECHNICAL', 'PANEL', 'FINAL'].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="i-mode">Mode</Label>
                <Select
                  value={interview.mode}
                  onValueChange={(v) => setInterview({ ...interview, mode: v })}
                >
                  <SelectTrigger id="i-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['IN_PERSON', 'VIDEO', 'PHONE'].map((m) => (
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
                <Label htmlFor="i-when">Date & Time</Label>
                <Input
                  id="i-when"
                  type="datetime-local"
                  value={interview.scheduledAt}
                  onChange={(e) => setInterview({ ...interview, scheduledAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="i-duration">Duration (minutes)</Label>
                <Input
                  id="i-duration"
                  type="number"
                  min={15}
                  value={interview.durationMinutes}
                  onChange={(e) => setInterview({ ...interview, durationMinutes: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="i-location">Location / Link</Label>
              <Input
                id="i-location"
                value={interview.location}
                onChange={(e) => setInterview({ ...interview, location: e.target.value })}
                placeholder="Head office boardroom, or a meeting link"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInterviewTarget(null)}>
              Cancel
            </Button>
            <Button onClick={bookInterview} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link hire */}
      <Dialog open={Boolean(hireTarget)} onOpenChange={(open) => !open && setHireTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to Staff Record</DialogTitle>
            <DialogDescription>
              Create the staff record first in People Directory, then paste its ID here to close
              the loop on {hireTarget?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="h-staff">Staff Record ID</Label>
            <Input
              id="h-staff"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              placeholder="UUID from the staff record"
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHireTarget(null)}>
              Cancel
            </Button>
            <Button onClick={confirmHire} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Hire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
