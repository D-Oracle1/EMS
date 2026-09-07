'use server';

/**
 * Recruitment — Server Actions
 * Hylink Finance Limited EMS
 *
 * Job openings → applications → interviews → hire. Hiring an applicant hands
 * off to the existing staff-creation path so a new employee lands in the same
 * records as any other, with the application linked for traceability.
 */

import { prisma, withTransaction } from '@/lib/prisma';
import { requirePermission, requireAnyPermission, getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import type { ActionResult } from '@/types';

// ============================================================================
// JOB OPENINGS
// ============================================================================

export async function getJobOpenings(filters?: { status?: string; departmentId?: string }) {
  await requireAnyPermission(['HR:RECRUITMENT_MANAGE', 'HR:STAFF_READ']);

  const where: Record<string, unknown> = {};
  if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
  if (filters?.departmentId && filters.departmentId !== 'ALL') where.departmentId = filters.departmentId;

  const openings = await prisma.jobOpening.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      department: { select: { name: true } },
      branch: { select: { name: true } },
      grade: { select: { name: true } },
      hiringManager: { select: { firstName: true, lastName: true } },
      _count: { select: { applications: true } },
    },
  });

  // Applications still in play, per opening — the number that actually matters.
  const activeCounts = await prisma.jobApplication.groupBy({
    by: ['openingId'],
    where: { status: { notIn: ['REJECTED', 'WITHDRAWN', 'HIRED'] } },
    _count: { _all: true },
  });
  const activeByOpening = new Map(activeCounts.map((a) => [a.openingId, a._count._all]));

  return openings.map((o) => ({
    id: o.id,
    code: o.code,
    title: o.title,
    department: o.department.name,
    departmentId: o.departmentId,
    branch: o.branch?.name ?? null,
    grade: o.grade?.name ?? null,
    employmentType: o.employmentType,
    vacancies: o.vacancies,
    filledCount: o.filledCount,
    minSalary: o.minSalary ? Number(o.minSalary) : null,
    maxSalary: o.maxSalary ? Number(o.maxSalary) : null,
    status: o.status,
    openedAt: o.openedAt,
    closingDate: o.closingDate,
    hiringManager: o.hiringManager
      ? `${o.hiringManager.firstName} ${o.hiringManager.lastName}`
      : null,
    applicationCount: o._count.applications,
    activeApplications: activeByOpening.get(o.id) ?? 0,
    createdAt: o.createdAt,
  }));
}

export async function getJobOpeningDetail(id: string) {
  await requireAnyPermission(['HR:RECRUITMENT_MANAGE', 'HR:STAFF_READ']);

  const opening = await prisma.jobOpening.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      grade: { select: { id: true, name: true } },
      hiringManager: { select: { id: true, firstName: true, lastName: true } },
      applications: {
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { interviews: true } } },
      },
    },
  });
  if (!opening) throw new Error('Job opening not found');

  return {
    id: opening.id,
    code: opening.code,
    title: opening.title,
    description: opening.description,
    requirements: opening.requirements,
    responsibilities: opening.responsibilities,
    department: opening.department,
    branch: opening.branch,
    grade: opening.grade,
    employmentType: opening.employmentType,
    vacancies: opening.vacancies,
    filledCount: opening.filledCount,
    minSalary: opening.minSalary ? Number(opening.minSalary) : null,
    maxSalary: opening.maxSalary ? Number(opening.maxSalary) : null,
    status: opening.status,
    openedAt: opening.openedAt,
    closingDate: opening.closingDate,
    closedAt: opening.closedAt,
    hiringManager: opening.hiringManager,
    applications: opening.applications.map((a) => ({
      id: a.id,
      applicationNumber: a.applicationNumber,
      name: `${a.firstName} ${a.lastName}`,
      email: a.email,
      phone: a.phone,
      yearsExperience: a.yearsExperience,
      currentEmployer: a.currentEmployer,
      expectedSalary: a.expectedSalary ? Number(a.expectedSalary) : null,
      source: a.source,
      status: a.status,
      rating: a.rating,
      interviewCount: a._count.interviews,
      createdAt: a.createdAt,
    })),
  };
}

export async function createJobOpening(data: {
  title: string;
  departmentId: string;
  branchId?: string;
  gradeId?: string;
  description: string;
  requirements?: string;
  responsibilities?: string;
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'NYSC' | 'CONSULTANT';
  vacancies: number;
  minSalary?: number;
  maxSalary?: number;
  closingDate?: string;
  hiringManagerId?: string;
  publishNow?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('HR:RECRUITMENT_MANAGE');

    if (!data.title.trim()) return { success: false, error: 'Job title is required' };
    if (!data.description.trim()) return { success: false, error: 'A job description is required' };
    if (data.vacancies < 1) return { success: false, error: 'There must be at least one vacancy' };
    if (
      data.minSalary !== undefined &&
      data.maxSalary !== undefined &&
      data.maxSalary < data.minSalary
    ) {
      return { success: false, error: 'The maximum salary must be at least the minimum' };
    }

    const department = await prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!department) return { success: false, error: 'Department not found' };

    let closingDate: Date | null = null;
    if (data.closingDate) {
      closingDate = new Date(data.closingDate);
      if (Number.isNaN(closingDate.getTime())) return { success: false, error: 'Enter a valid closing date' };
    }

    // JOB-<dept code>-<sequence within department>
    const count = await prisma.jobOpening.count({ where: { departmentId: data.departmentId } });
    const code = `JOB-${department.code}-${String(count + 1).padStart(3, '0')}`;

    const opening = await prisma.jobOpening.create({
      data: {
        code,
        title: data.title.trim(),
        departmentId: data.departmentId,
        branchId: data.branchId || null,
        gradeId: data.gradeId || null,
        description: data.description.trim(),
        requirements: data.requirements?.trim() || null,
        responsibilities: data.responsibilities?.trim() || null,
        employmentType: data.employmentType ?? 'FULL_TIME',
        vacancies: data.vacancies,
        minSalary: data.minSalary ?? null,
        maxSalary: data.maxSalary ?? null,
        closingDate,
        hiringManagerId: data.hiringManagerId || null,
        status: data.publishNow ? 'OPEN' : 'DRAFT',
        openedAt: data.publishNow ? new Date() : null,
        createdById: user.id,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'JOB_OPENING',
      entityId: opening.id,
      description: `Created job opening ${data.title} [${code}] — ${data.vacancies} vacancy(ies)`,
    });

    if (data.hiringManagerId) {
      await createNotification({
        userId: data.hiringManagerId,
        type: 'TASK_ASSIGNED',
        title: `You are hiring manager for ${data.title}`,
        message: `${code} has been created with ${data.vacancies} vacancy(ies).`,
        entityType: 'JOB_OPENING',
        entityId: opening.id,
        actionUrl: `/hr/recruitment/${opening.id}`,
      });
    }

    return { success: true, message: `Opening "${data.title}" created`, data: { id: opening.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateJobOpeningStatus(
  id: string,
  status: 'DRAFT' | 'OPEN' | 'ON_HOLD' | 'CLOSED' | 'FILLED' | 'CANCELLED'
): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:RECRUITMENT_MANAGE');

    const opening = await prisma.jobOpening.findUnique({
      where: { id },
      include: { _count: { select: { applications: true } } },
    });
    if (!opening) return { success: false, error: 'Job opening not found' };
    if (opening.status === status) return { success: false, error: `Opening is already ${status}` };
    if (opening.status === 'FILLED' && status !== 'CLOSED') {
      return { success: false, error: 'A filled opening can only be closed' };
    }

    const updates: Record<string, unknown> = { status };
    if (status === 'OPEN' && !opening.openedAt) updates.openedAt = new Date();
    if (['CLOSED', 'FILLED', 'CANCELLED'].includes(status)) updates.closedAt = new Date();

    await prisma.jobOpening.update({ where: { id }, data: updates });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'JOB_OPENING',
      entityId: id,
      description: `Changed opening ${opening.code} from ${opening.status} to ${status}`,
    });

    return { success: true, message: `Opening is now ${status.toLowerCase().replace('_', ' ')}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// APPLICATIONS
// ============================================================================

export async function getApplications(filters?: {
  openingId?: string;
  status?: string;
  search?: string;
}) {
  await requireAnyPermission(['HR:RECRUITMENT_MANAGE', 'HR:STAFF_READ']);

  const where: Record<string, unknown> = {};
  if (filters?.openingId && filters.openingId !== 'ALL') where.openingId = filters.openingId;
  if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
  if (filters?.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: 'insensitive' } },
      { lastName: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
      { applicationNumber: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const applications = await prisma.jobApplication.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      opening: { select: { code: true, title: true } },
      _count: { select: { interviews: true } },
    },
  });

  return applications.map((a) => ({
    id: a.id,
    applicationNumber: a.applicationNumber,
    openingId: a.openingId,
    openingTitle: a.opening.title,
    openingCode: a.opening.code,
    name: `${a.firstName} ${a.lastName}`,
    email: a.email,
    phone: a.phone,
    yearsExperience: a.yearsExperience,
    currentEmployer: a.currentEmployer,
    currentPosition: a.currentPosition,
    expectedSalary: a.expectedSalary ? Number(a.expectedSalary) : null,
    highestQualification: a.highestQualification,
    source: a.source,
    status: a.status,
    rating: a.rating,
    interviewCount: a._count.interviews,
    hiredStaffId: a.hiredStaffId,
    createdAt: a.createdAt,
  }));
}

export async function createApplication(data: {
  openingId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: string;
  resumeUrl?: string;
  coverLetter?: string;
  yearsExperience?: number;
  currentEmployer?: string;
  currentPosition?: string;
  expectedSalary?: number;
  noticePeriodDays?: number;
  highestQualification?: string;
  source?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('HR:RECRUITMENT_MANAGE');

    if (!data.firstName.trim() || !data.lastName.trim()) {
      return { success: false, error: 'First and last name are required' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      return { success: false, error: 'Enter a valid email address' };
    }
    if (!data.phone.trim()) return { success: false, error: 'A phone number is required' };

    const opening = await prisma.jobOpening.findUnique({ where: { id: data.openingId } });
    if (!opening) return { success: false, error: 'Job opening not found' };
    if (!['OPEN', 'DRAFT'].includes(opening.status)) {
      return { success: false, error: `This opening is ${opening.status.toLowerCase()} and is not accepting applications` };
    }
    if (opening.closingDate && opening.closingDate < new Date()) {
      return { success: false, error: 'This opening has passed its closing date' };
    }

    const email = data.email.trim().toLowerCase();
    const duplicate = await prisma.jobApplication.findFirst({
      where: { openingId: data.openingId, email },
    });
    if (duplicate) {
      return { success: false, error: `${email} has already applied to this opening (${duplicate.applicationNumber})` };
    }

    const count = await prisma.jobApplication.count();
    const applicationNumber = `APP${String(count + 1).padStart(6, '0')}`;

    const application = await prisma.jobApplication.create({
      data: {
        applicationNumber,
        openingId: data.openingId,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email,
        phone: data.phone.trim(),
        address: data.address?.trim() || null,
        resumeUrl: data.resumeUrl?.trim() || null,
        coverLetter: data.coverLetter?.trim() || null,
        yearsExperience: data.yearsExperience ?? null,
        currentEmployer: data.currentEmployer?.trim() || null,
        currentPosition: data.currentPosition?.trim() || null,
        expectedSalary: data.expectedSalary ?? null,
        noticePeriodDays: data.noticePeriodDays ?? null,
        highestQualification: data.highestQualification?.trim() || null,
        source: data.source?.trim() || null,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'JOB_APPLICATION',
      entityId: application.id,
      description: `Recorded application ${applicationNumber} from ${data.firstName} ${data.lastName} for ${opening.title}`,
    });

    return {
      success: true,
      message: `Application ${applicationNumber} recorded`,
      data: { id: application.id },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateApplicationStatus(
  id: string,
  status:
    | 'APPLIED'
    | 'SCREENING'
    | 'SHORTLISTED'
    | 'INTERVIEWING'
    | 'OFFER_SENT'
    | 'OFFER_ACCEPTED'
    | 'REJECTED'
    | 'WITHDRAWN',
  data?: { rating?: number; screeningNotes?: string; rejectionReason?: string }
): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:RECRUITMENT_MANAGE');

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      include: { opening: { select: { title: true } } },
    });
    if (!application) return { success: false, error: 'Application not found' };
    if (application.status === 'HIRED') {
      return { success: false, error: 'A hired applicant cannot change status' };
    }
    if (status === 'REJECTED' && !data?.rejectionReason?.trim()) {
      return { success: false, error: 'A rejection reason is required' };
    }
    if (data?.rating !== undefined && (data.rating < 1 || data.rating > 5)) {
      return { success: false, error: 'Rating must be between 1 and 5' };
    }

    await prisma.jobApplication.update({
      where: { id },
      data: {
        status,
        rating: data?.rating ?? application.rating,
        screeningNotes: data?.screeningNotes?.trim() ?? application.screeningNotes,
        rejectionReason: data?.rejectionReason?.trim() ?? application.rejectionReason,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'JOB_APPLICATION',
      entityId: id,
      description: `Moved ${application.applicationNumber} (${application.firstName} ${application.lastName}) from ${application.status} to ${status}`,
    });

    return { success: true, message: `Application moved to ${status.toLowerCase().replace('_', ' ')}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// INTERVIEWS
// ============================================================================

export async function getInterviews(filters?: {
  applicationId?: string;
  interviewerId?: string;
  upcoming?: boolean;
}) {
  await requireAnyPermission(['HR:RECRUITMENT_MANAGE', 'HR:STAFF_READ']);

  const where: Record<string, unknown> = {};
  if (filters?.applicationId) where.applicationId = filters.applicationId;
  if (filters?.interviewerId) where.interviewerId = filters.interviewerId;
  if (filters?.upcoming) {
    where.scheduledAt = { gte: new Date() };
    where.status = 'SCHEDULED';
  }

  const interviews = await prisma.interview.findMany({
    where,
    orderBy: { scheduledAt: 'asc' },
    take: 200,
    include: {
      interviewer: { select: { firstName: true, lastName: true } },
      application: {
        select: {
          applicationNumber: true,
          firstName: true,
          lastName: true,
          opening: { select: { title: true } },
        },
      },
    },
  });

  return interviews.map((i) => ({
    id: i.id,
    applicationId: i.applicationId,
    applicationNumber: i.application.applicationNumber,
    candidateName: `${i.application.firstName} ${i.application.lastName}`,
    positionTitle: i.application.opening.title,
    stage: i.stage,
    stageOrder: i.stageOrder,
    scheduledAt: i.scheduledAt,
    durationMinutes: i.durationMinutes,
    mode: i.mode,
    location: i.location,
    interviewer: i.interviewer ? `${i.interviewer.firstName} ${i.interviewer.lastName}` : null,
    interviewerId: i.interviewerId,
    status: i.status,
    score: i.score,
    feedback: i.feedback,
    recommendation: i.recommendation,
    completedAt: i.completedAt,
  }));
}

export async function scheduleInterview(data: {
  applicationId: string;
  stage: string;
  stageOrder?: number;
  scheduledAt: string;
  durationMinutes?: number;
  mode?: 'IN_PERSON' | 'VIDEO' | 'PHONE';
  location?: string;
  interviewerId?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('HR:RECRUITMENT_MANAGE');

    const application = await prisma.jobApplication.findUnique({
      where: { id: data.applicationId },
      include: { opening: { select: { title: true } } },
    });
    if (!application) return { success: false, error: 'Application not found' };
    if (['REJECTED', 'WITHDRAWN', 'HIRED'].includes(application.status)) {
      return { success: false, error: `Cannot schedule an interview for a ${application.status.toLowerCase()} application` };
    }

    const scheduledAt = new Date(data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) return { success: false, error: 'Enter a valid date and time' };
    if (scheduledAt < new Date()) return { success: false, error: 'Interviews cannot be scheduled in the past' };

    if (!data.stage.trim()) return { success: false, error: 'An interview stage is required' };

    // Warn on an interviewer double-booking within the slot.
    if (data.interviewerId) {
      const duration = data.durationMinutes ?? 45;
      const slotEnd = new Date(scheduledAt.getTime() + duration * 60_000);
      const clash = await prisma.interview.findFirst({
        where: {
          interviewerId: data.interviewerId,
          status: 'SCHEDULED',
          scheduledAt: { lt: slotEnd, gte: new Date(scheduledAt.getTime() - 4 * 60 * 60_000) },
        },
      });
      if (clash) {
        const clashEnd = new Date(clash.scheduledAt.getTime() + clash.durationMinutes * 60_000);
        if (clashEnd > scheduledAt) {
          return {
            success: false,
            error: `That interviewer already has an interview at ${clash.scheduledAt.toLocaleString()}`,
          };
        }
      }
    }

    const interview = await prisma.interview.create({
      data: {
        applicationId: data.applicationId,
        stage: data.stage.trim().toUpperCase(),
        stageOrder: data.stageOrder ?? 1,
        scheduledAt,
        durationMinutes: data.durationMinutes ?? 45,
        mode: data.mode ?? 'IN_PERSON',
        location: data.location?.trim() || null,
        interviewerId: data.interviewerId || null,
      },
    });

    // Applications move into INTERVIEWING as soon as one is booked.
    if (application.status !== 'INTERVIEWING') {
      await prisma.jobApplication.update({
        where: { id: data.applicationId },
        data: { status: 'INTERVIEWING' },
      });
    }

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'INTERVIEW',
      entityId: interview.id,
      description: `Scheduled ${data.stage} interview for ${application.firstName} ${application.lastName} on ${scheduledAt.toISOString()}`,
    });

    if (data.interviewerId) {
      await createNotification({
        userId: data.interviewerId,
        type: 'TASK_ASSIGNED',
        title: 'Interview scheduled',
        message: `${data.stage} interview with ${application.firstName} ${application.lastName} for ${application.opening.title} on ${scheduledAt.toLocaleString()}.`,
        entityType: 'INTERVIEW',
        entityId: interview.id,
        actionUrl: '/hr/recruitment/interviews',
      });
    }

    return { success: true, message: 'Interview scheduled', data: { id: interview.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function submitInterviewFeedback(
  id: string,
  data: {
    score: number;
    feedback: string;
    recommendation: 'STRONG_HIRE' | 'HIRE' | 'NEUTRAL' | 'NO_HIRE' | 'STRONG_NO_HIRE';
  }
): Promise<ActionResult> {
  try {
    const { user } = await getSession();

    const interview = await prisma.interview.findUnique({
      where: { id },
      include: { application: { select: { firstName: true, lastName: true, applicationNumber: true } } },
    });
    if (!interview) return { success: false, error: 'Interview not found' };

    // The assigned interviewer, or anyone with recruitment rights, may submit.
    if (interview.interviewerId !== user.id) {
      await requirePermission('HR:RECRUITMENT_MANAGE');
    }

    if (interview.status === 'COMPLETED') {
      return { success: false, error: 'Feedback has already been submitted for this interview' };
    }
    if (interview.status === 'CANCELLED') {
      return { success: false, error: 'This interview was cancelled' };
    }
    if (data.score < 1 || data.score > 100) {
      return { success: false, error: 'Score must be between 1 and 100' };
    }
    if (!data.feedback.trim()) return { success: false, error: 'Written feedback is required' };

    await prisma.interview.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        score: data.score,
        feedback: data.feedback.trim(),
        recommendation: data.recommendation,
        completedAt: new Date(),
      },
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'INTERVIEW',
      entityId: id,
      description: `Submitted ${interview.stage} interview feedback for ${interview.application.firstName} ${interview.application.lastName}: ${data.recommendation} (${data.score}/100)`,
    });

    return { success: true, message: 'Interview feedback recorded' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function cancelInterview(id: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:RECRUITMENT_MANAGE');

    if (!reason.trim()) return { success: false, error: 'A reason is required' };

    const interview = await prisma.interview.findUnique({ where: { id } });
    if (!interview) return { success: false, error: 'Interview not found' };
    if (interview.status !== 'SCHEDULED') {
      return { success: false, error: `Only a scheduled interview can be cancelled (currently ${interview.status})` };
    }

    await prisma.interview.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        feedback: `Cancelled: ${reason.trim()}`,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'INTERVIEW',
      entityId: id,
      description: `Cancelled ${interview.stage} interview: ${reason.trim()}`,
    });

    return { success: true, message: 'Interview cancelled' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// HIRING
// ============================================================================

/**
 * Link a hired applicant to the staff record created for them, and advance the
 * opening's fill count. Staff creation itself stays in staff.actions so there
 * is exactly one path that provisions a login.
 */
export async function linkApplicationToStaff(
  applicationId: string,
  staffId: string
): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['HR:RECRUITMENT_MANAGE', 'HR:STAFF_CREATE']);

    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: { opening: true },
    });
    if (!application) return { success: false, error: 'Application not found' };
    if (application.hiredStaffId) {
      return { success: false, error: 'This application is already linked to a staff record' };
    }
    if (['REJECTED', 'WITHDRAWN'].includes(application.status)) {
      return { success: false, error: `A ${application.status.toLowerCase()} application cannot be hired` };
    }

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, firstName: true, lastName: true, employeeId: true },
    });
    if (!staff) return { success: false, error: 'Staff record not found' };

    const alreadyLinked = await prisma.jobApplication.findFirst({
      where: { hiredStaffId: staffId },
    });
    if (alreadyLinked) {
      return { success: false, error: `That staff record is already linked to application ${alreadyLinked.applicationNumber}` };
    }

    await withTransaction(async (tx) => {
      await tx.jobApplication.update({
        where: { id: applicationId },
        data: { status: 'HIRED', hiredStaffId: staffId, hiredAt: new Date() },
      });

      const filledCount = application.opening.filledCount + 1;
      await tx.jobOpening.update({
        where: { id: application.openingId },
        data: {
          filledCount,
          // Close the opening automatically once every vacancy is taken.
          ...(filledCount >= application.opening.vacancies
            ? { status: 'FILLED', closedAt: new Date() }
            : {}),
        },
      });
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'JOB_APPLICATION',
      entityId: applicationId,
      description: `Hired ${application.firstName} ${application.lastName} (${application.applicationNumber}) as ${staff.employeeId}`,
    });

    return {
      success: true,
      message: `${application.firstName} ${application.lastName} linked to staff record ${staff.employeeId}`,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Recruitment funnel counts for the HR dashboard. */
export async function getRecruitmentPipeline() {
  await requireAnyPermission(['HR:RECRUITMENT_MANAGE', 'HR:STAFF_READ']);

  const [byStatus, openOpenings, upcomingInterviews, totalVacancies] = await Promise.all([
    prisma.jobApplication.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.jobOpening.count({ where: { status: 'OPEN' } }),
    prisma.interview.count({ where: { status: 'SCHEDULED', scheduledAt: { gte: new Date() } } }),
    prisma.jobOpening.aggregate({
      where: { status: 'OPEN' },
      _sum: { vacancies: true, filledCount: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of byStatus) counts[row.status] = row._count._all;

  return {
    openOpenings,
    upcomingInterviews,
    openVacancies:
      (totalVacancies._sum.vacancies ?? 0) - (totalVacancies._sum.filledCount ?? 0),
    funnel: [
      { stage: 'Applied', count: counts.APPLIED ?? 0 },
      { stage: 'Screening', count: counts.SCREENING ?? 0 },
      { stage: 'Shortlisted', count: counts.SHORTLISTED ?? 0 },
      { stage: 'Interviewing', count: counts.INTERVIEWING ?? 0 },
      { stage: 'Offer', count: (counts.OFFER_SENT ?? 0) + (counts.OFFER_ACCEPTED ?? 0) },
      { stage: 'Hired', count: counts.HIRED ?? 0 },
    ],
    rejected: counts.REJECTED ?? 0,
    withdrawn: counts.WITHDRAWN ?? 0,
  };
}
