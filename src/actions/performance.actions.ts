'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission, getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import type { ActionResult } from '@/types';

// ============================================================================
// PERFORMANCE REVIEWS
// ============================================================================

export async function createPerformanceReview(data: {
  staffId: string;
  reviewPeriod: string;
  reviewDate: string;
  productivity: number;
  quality: number;
  attendance: number;
  teamwork: number;
  initiative: number;
  strengths?: string;
  areasForImprovement?: string;
  goals?: string;
  comments?: string;
}): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:PERFORMANCE_MANAGE');

    const overallRating = (data.productivity + data.quality + data.attendance + data.teamwork + data.initiative) / 5;

    const review = await prisma.performanceReview.create({
      data: {
        staffId: data.staffId,
        reviewerId: user.id,
        reviewPeriod: data.reviewPeriod,
        reviewDate: new Date(data.reviewDate),
        productivity: data.productivity,
        quality: data.quality,
        attendance: data.attendance,
        teamwork: data.teamwork,
        initiative: data.initiative,
        overallRating,
        strengths: data.strengths,
        areasForImprovement: data.areasForImprovement,
        goals: data.goals,
        comments: data.comments,
        status: 'DRAFT',
      },
    });

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'HR',
      entityType: 'PERFORMANCE_REVIEW', entityId: review.id,
      description: `Created performance review for staff ${data.staffId} - Period: ${data.reviewPeriod}`,
    });

    return { success: true, message: 'Performance review created', data: { id: review.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getPerformanceReviews(filters?: {
  staffId?: string;
  reviewPeriod?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  await requirePermission('HR:PERFORMANCE_MANAGE');

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters?.staffId) where.staffId = filters.staffId;
  if (filters?.reviewPeriod) where.reviewPeriod = filters.reviewPeriod;
  if (filters?.status) where.status = filters.status;

  const [data, total] = await Promise.all([
    prisma.performanceReview.findMany({
      where: where as any,
      include: {
        staff: { select: { firstName: true, lastName: true, employeeId: true, department: { select: { name: true } } } },
        reviewer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { reviewDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.performanceReview.count({ where: where as any }),
  ]);

  return {
    data: data.map((r) => ({ ...r, overallRating: r.overallRating.toNumber() })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getPerformanceReview(id: string) {
  await requirePermission('HR:PERFORMANCE_MANAGE');

  const review = await prisma.performanceReview.findUnique({
    where: { id },
    include: {
      staff: { select: { firstName: true, lastName: true, employeeId: true, department: { select: { name: true } } } },
      reviewer: { select: { firstName: true, lastName: true } },
    },
  });

  if (!review) throw new Error('Review not found');
  return { ...review, overallRating: review.overallRating.toNumber() };
}

export async function submitReview(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:PERFORMANCE_MANAGE');

    const review = await prisma.performanceReview.findUnique({ where: { id } });
    if (!review) return { success: false, error: 'Review not found' };
    if (review.status !== 'DRAFT') return { success: false, error: 'Review is not in draft status' };

    await prisma.performanceReview.update({
      where: { id },
      data: { status: 'SUBMITTED' },
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'HR',
      entityType: 'PERFORMANCE_REVIEW', entityId: id,
      description: `Submitted performance review for period: ${review.reviewPeriod}`,
    });

    return { success: true, message: 'Review submitted for acknowledgement' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function acknowledgeReview(id: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();

    const review = await prisma.performanceReview.findUnique({ where: { id } });
    if (!review) return { success: false, error: 'Review not found' };
    if (review.status !== 'SUBMITTED') return { success: false, error: 'Review is not submitted' };
    if (review.staffId !== user.id) return { success: false, error: 'You can only acknowledge your own reviews' };

    await prisma.performanceReview.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'HR',
      entityType: 'PERFORMANCE_REVIEW', entityId: id,
      description: `Acknowledged performance review: ${review.reviewPeriod}`,
    });

    return { success: true, message: 'Review acknowledged' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// DISCIPLINARY ACTIONS
// ============================================================================

export async function createDisciplinaryAction(data: {
  staffId: string;
  type: string;
  severity: string;
  description: string;
  incidentDate: string;
}): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:PERFORMANCE_MANAGE');

    const staff = await prisma.staff.findUnique({ where: { id: data.staffId } });
    if (!staff) return { success: false, error: 'Staff not found' };

    const action = await prisma.disciplinaryAction.create({
      data: {
        staffId: data.staffId,
        issuedById: user.id,
        type: data.type,
        severity: data.severity,
        description: data.description,
        incidentDate: new Date(data.incidentDate),
        status: 'OPEN',
      },
    });

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'HR',
      entityType: 'DISCIPLINARY_ACTION', entityId: action.id,
      description: `Issued ${data.type} (${data.severity}) to ${staff.employeeId}: ${data.description.substring(0, 100)}`,
    });

    return { success: true, message: 'Disciplinary action created', data: { id: action.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getDisciplinaryActions(filters?: {
  staffId?: string;
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}) {
  await requirePermission('HR:PERFORMANCE_MANAGE');

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters?.staffId) where.staffId = filters.staffId;
  if (filters?.status) where.status = filters.status;
  if (filters?.type) where.type = filters.type;

  const [data, total] = await Promise.all([
    prisma.disciplinaryAction.findMany({
      where: where as any,
      include: {
        staff: { select: { firstName: true, lastName: true, employeeId: true, department: { select: { name: true } } } },
        issuedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.disciplinaryAction.count({ where: where as any }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function respondToDisciplinaryAction(
  id: string,
  response: string
): Promise<ActionResult> {
  try {
    const { user } = await getSession();

    const action = await prisma.disciplinaryAction.findUnique({ where: { id } });
    if (!action) return { success: false, error: 'Disciplinary action not found' };
    if (action.staffId !== user.id) return { success: false, error: 'You can only respond to actions issued to you' };
    if (action.status !== 'OPEN') return { success: false, error: 'Action is not open for response' };

    await prisma.disciplinaryAction.update({
      where: { id },
      data: { response, respondedAt: new Date(), status: 'RESPONDED' },
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'HR',
      entityType: 'DISCIPLINARY_ACTION', entityId: id,
      description: `Staff responded to disciplinary action`,
    });

    return { success: true, message: 'Response submitted' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function resolveDisciplinaryAction(
  id: string,
  resolution: string
): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:PERFORMANCE_MANAGE');

    const action = await prisma.disciplinaryAction.findUnique({ where: { id } });
    if (!action) return { success: false, error: 'Disciplinary action not found' };

    await prisma.disciplinaryAction.update({
      where: { id },
      data: { resolution, resolvedAt: new Date(), resolvedById: user.id, status: 'RESOLVED' },
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'HR',
      entityType: 'DISCIPLINARY_ACTION', entityId: id,
      description: `Resolved disciplinary action: ${resolution.substring(0, 100)}`,
    });

    return { success: true, message: 'Disciplinary action resolved' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
