'use server';

import { prisma, withTransaction } from '@/lib/prisma';
import { requirePermission, requireAnyPermission, getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import type { ActionResult } from '@/types';

/**
 * Check if a verification task is immutable (completed/failed/cancelled).
 * Returns true if the task cannot be modified.
 */
async function isTaskImmutable(taskId: string): Promise<boolean> {
  const task = await prisma.verificationTask.findUnique({
    where: { id: taskId },
    select: { status: true },
  });
  return task ? ['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status) : false;
}

export async function getVerificationTasks(filters?: {
  status?: string;
  priority?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const user = await requirePermission('LOANS:VERIFY');

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  // Only show tasks assigned to the current verification officer
  const where: Record<string, unknown> = { assignedToId: user.id };
  if (filters?.status) where.status = filters.status;
  if (filters?.priority) where.priority = filters.priority;
  if (filters?.search) {
    const term = filters.search.trim();
    where.OR = [
      { customer: { firstName: { contains: term, mode: 'insensitive' } } },
      { customer: { lastName: { contains: term, mode: 'insensitive' } } },
      { customer: { customerNumber: { contains: term, mode: 'insensitive' } } },
      { loan: { loanNumber: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const [rawData, total] = await Promise.all([
    prisma.verificationTask.findMany({
      where: where as any,
      include: {
        loan: {
          select: {
            loanNumber: true,
            customer: { select: { customerNumber: true, firstName: true, lastName: true } },
          },
        },
        customer: { select: { customerNumber: true, firstName: true, lastName: true } },
        assignedTo: { select: { firstName: true, lastName: true, employeeId: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.verificationTask.count({ where: where as any }),
  ]);

  // For tasks missing direct loan/customer FKs, look up via referenceId
  const tasksNeedingLookup = rawData.filter(
    (t) => !t.loan && !t.customer && t.referenceType === 'LOAN' && t.referenceId
  );
  const loanLookup: Record<string, { loanNumber: string; customerId: string; customer: { customerNumber: string; firstName: string; lastName: string } | null }> = {};
  if (tasksNeedingLookup.length > 0) {
    const loanIds = tasksNeedingLookup.map((t) => t.referenceId);
    const loans = await prisma.loan.findMany({
      where: { id: { in: loanIds } },
      select: {
        id: true,
        loanNumber: true,
        customerId: true,
        customer: { select: { customerNumber: true, firstName: true, lastName: true } },
      },
    });
    for (const loan of loans) {
      loanLookup[loan.id] = { loanNumber: loan.loanNumber, customerId: loan.customerId, customer: loan.customer };
    }

    // Backfill the missing FKs so future queries work via direct relations
    const backfillPromises = tasksNeedingLookup
      .map((t) => {
        const loan = loanLookup[t.referenceId];
        if (!loan) return null;
        return prisma.verificationTask.update({
          where: { id: t.id },
          data: { loanId: t.referenceId, customerId: loan.customerId },
        });
      })
      .filter(Boolean);
    if (backfillPromises.length > 0) {
      Promise.all(backfillPromises).catch(() => {}); // fire-and-forget
    }
  }

  // Explicitly serialize to plain objects for Next.js server action transport
  const data = rawData.map((task) => {
    const fallback = loanLookup[task.referenceId] || null;
    const customer = task.customer || task.loan?.customer || fallback?.customer || null;
    const loanNumber = task.loan?.loanNumber || fallback?.loanNumber || null;
    return {
      id: task.id,
      taskType: task.taskType,
      status: task.status,
      priority: task.priority,
      createdAt: task.createdAt.toISOString(),
      customer: customer
        ? {
            customerNumber: customer.customerNumber,
            firstName: customer.firstName,
            lastName: customer.lastName,
          }
        : null,
      loan: loanNumber ? { loanNumber } : null,
      assignedTo: task.assignedTo
        ? {
            firstName: task.assignedTo.firstName,
            lastName: task.assignedTo.lastName,
            employeeId: task.assignedTo.employeeId,
          }
        : null,
    };
  });

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getVerificationTask(id: string) {
  const user = await requirePermission('LOANS:VERIFY');

  const task = await prisma.verificationTask.findUnique({
    where: { id },
    include: {
      loan: {
        select: {
          loanNumber: true,
          principalAmount: true,
          status: true,
          customer: true,
        },
      },
      customer: true,
      assignedTo: { select: { firstName: true, lastName: true, employeeId: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });

  if (!task) throw new Error('Verification task not found');
  // Only the assigned officer can view task details
  if (task.assignedToId !== user.id) throw new Error('You do not have access to this verification task');

  // Use direct relations, or fall back to referenceId lookup
  let loanData = task.loan;
  let customer = task.customer || task.loan?.customer || null;

  if (!loanData && task.referenceType === 'LOAN' && task.referenceId) {
    const refLoan = await prisma.loan.findUnique({
      where: { id: task.referenceId },
      select: { loanNumber: true, principalAmount: true, status: true, customer: true },
    });
    if (refLoan) {
      loanData = refLoan;
      customer = customer || refLoan.customer;
    }
  }

  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    startedAt: task.startedAt?.toISOString() || null,
    completedAt: task.completedAt?.toISOString() || null,
    dueDate: task.dueDate?.toISOString() || null,
    loan: loanData ? {
      loanNumber: loanData.loanNumber,
      principalAmount: loanData.principalAmount.toNumber(),
      status: loanData.status,
    } : null,
    customer: customer ? {
      ...customer,
      monthlyIncome: customer.monthlyIncome?.toNumber() || 0,
    } : null,
  };
}

export async function startVerificationTask(taskId: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('LOANS:VERIFY');

    const task = await prisma.verificationTask.findUnique({ where: { id: taskId } });
    if (!task) return { success: false, error: 'Task not found' };
    if (task.assignedToId !== user.id) return { success: false, error: 'This task is not assigned to you' };
    if (task.status !== 'ASSIGNED') return { success: false, error: 'Task is not available to start' };

    // Resolve loanId: direct FK or via referenceId
    const loanId = task.loanId || (task.referenceType === 'LOAN' ? task.referenceId : null);

    await prisma.verificationTask.update({
      where: { id: taskId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        // Backfill loanId if missing
        ...(loanId && !task.loanId ? { loanId } : {}),
      },
    });

    // Update loan status to VERIFICATION_IN_PROGRESS
    if (loanId) {
      await prisma.loan.update({
        where: { id: loanId },
        data: { status: 'VERIFICATION_IN_PROGRESS' },
      });
    }

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'VERIFICATION',
      entityType: 'VERIFICATION_TASK', entityId: taskId,
      description: 'Started verification task',
    });

    // Notify the loan officer who created the task
    if (task.createdById && task.createdById !== user.id) {
      await createNotification({
        userId: task.createdById,
        type: 'INFO',
        title: 'Verification Started',
        message: `${user.firstName} ${user.lastName} has started the verification`,
        entityType: 'VERIFICATION_TASK',
        entityId: taskId,
        actionUrl: `/verification/${taskId}`,
      });
    }

    return { success: true, message: 'Verification started' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function submitVerificationResult(
  taskId: string,
  data: {
    result: 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE';
    addressVerified?: boolean;
    employmentVerified?: boolean;
    incomeVerified?: boolean;
    collateralVerified?: boolean;
    remarks: string;
    findings?: string;
    verifiedAddress?: string;
    gpsCoordinates?: string;
    riskLevel?: string;
    estimatedValue?: number;
    propertyCondition?: string;
    propertyComments?: string;
    photos?: string[];
  }
): Promise<ActionResult> {
  try {
    const user = await requirePermission('LOANS:VERIFY');

    const task = await prisma.verificationTask.findUnique({ where: { id: taskId } });
    if (!task) return { success: false, error: 'Task not found' };
    if (task.status !== 'IN_PROGRESS') return { success: false, error: 'Task is not in progress' };
    if (task.assignedToId !== user.id) return { success: false, error: 'Task not assigned to you' };

    // Resolve loanId: direct FK or via referenceId
    const loanId = task.loanId || (task.referenceType === 'LOAN' ? task.referenceId : null);

    await withTransaction(async (tx) => {
      await tx.verificationTask.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          result: data.result,
          addressVerified: data.addressVerified,
          employmentVerified: data.employmentVerified,
          incomeVerified: data.incomeVerified,
          collateralVerified: data.collateralVerified,
          remarks: data.remarks,
          findings: data.findings,
          verifiedAddress: data.verifiedAddress,
          gpsCoordinates: data.gpsCoordinates,
          photos: data.photos || [],
          recommendation: data.result === 'VERIFIED' ? 'APPROVE' : data.result === 'FAILED' ? 'DECLINE' : 'FURTHER_REVIEW',
          completedAt: new Date(),
          // Backfill loanId if missing
          ...(loanId && !task.loanId ? { loanId } : {}),
        },
      });

      // If loan verification, update loan status and create LoanVerification record
      if (loanId) {
        // Map result to recommendation for LoanVerification
        const recommendation = data.result === 'VERIFIED'
          ? 'APPROVE'
          : data.result === 'FAILED'
          ? 'DECLINE'
          : 'REFER';

        // Map TaskType to VerificationType
        const taskTypeToVerificationType: Record<string, string> = {
          ADDRESS_VERIFICATION: 'ADDRESS',
          EMPLOYMENT_VERIFICATION: 'EMPLOYMENT',
          COLLATERAL_VERIFICATION: 'COLLATERAL',
          GUARANTOR_VERIFICATION: 'GUARANTOR',
          KYC_VERIFICATION: 'COMPREHENSIVE',
          BUSINESS_VERIFICATION: 'COMPREHENSIVE',
        };
        const verificationType = taskTypeToVerificationType[task.taskType] || 'COMPREHENSIVE';

        // Map recommendation to VerificationRecommendation enum
        const recMap: Record<string, string> = {
          APPROVE: 'APPROVE',
          DECLINE: 'DECLINE',
          REFER: 'FURTHER_REVIEW',
        };

        // Create a LoanVerification record so it appears on the loan detail page
        await tx.loanVerification.create({
          data: {
            loanId,
            officerId: user.id,
            verificationType: verificationType as any,
            addressVerified: data.addressVerified ?? null,
            addressComments: data.verifiedAddress || null,
            employmentVerified: data.employmentVerified ?? null,
            employmentComments: null,
            propertyExists: data.collateralVerified ?? null,
            propertyCondition: data.propertyCondition || null,
            estimatedValue: data.estimatedValue ?? null,
            propertyComments: data.propertyComments || null,
            riskLevel: (data.riskLevel as any) || null,
            recommendation: (recMap[recommendation] || 'FURTHER_REVIEW') as any,
            findings: data.findings || data.remarks,
            gpsCoordinates: data.gpsCoordinates || null,
            photos: data.photos || [],
            status: 'COMPLETED',
            submittedAt: new Date(),
          },
        });

        if (data.result === 'VERIFIED') {
          await tx.loan.update({
            where: { id: loanId },
            data: { status: 'VERIFIED' },
          });
        } else if (data.result === 'FAILED') {
          await tx.loan.update({
            where: { id: loanId },
            data: { status: 'REJECTED', rejectionReason: `Verification failed: ${data.remarks}` },
          });
        }
        // INCONCLUSIVE: loan stays in current state, needs re-verification
      }
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'VERIFICATION',
      entityType: 'VERIFICATION_TASK', entityId: taskId,
      description: `Verification completed: ${data.result}. ${data.remarks}`,
    });

    // Notify the loan officer who created the loan
    if (loanId) {
      const loan = await prisma.loan.findUnique({
        where: { id: loanId },
        select: { createdById: true, loanNumber: true },
      });
      if (loan && loan.createdById !== user.id) {
        await createNotification({
          userId: loan.createdById,
          type: data.result === 'VERIFIED' ? 'INFO' : 'WARNING',
          title: `Verification ${data.result}`,
          message: `Verification for loan ${loan.loanNumber}: ${data.result}. ${data.remarks}`,
          entityType: 'LOAN',
          entityId: loanId,
          actionUrl: `/loans/${loanId}`,
        });
      }
    }

    return { success: true, message: `Verification submitted: ${data.result}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get verification analytics for reporting.
 * Accessible by verification officers and managers.
 */
export async function getVerificationAnalytics(filters?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  await requireAnyPermission(['LOANS:VERIFY', 'LOANS:APPROVE_L1', 'LOANS:APPROVE_L2', 'ACCOUNTS:REPORTS_VIEW']);

  const dateFilter: Record<string, unknown> = {};
  if (filters?.dateFrom || filters?.dateTo) {
    dateFilter.createdAt = {};
    if (filters?.dateFrom) (dateFilter.createdAt as any).gte = new Date(filters.dateFrom);
    if (filters?.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      (dateFilter.createdAt as any).lte = to;
    }
  }

  // 1. Task counts by status
  const allTasks = await prisma.verificationTask.groupBy({
    by: ['status'],
    _count: { id: true },
    where: dateFilter as any,
  });

  const statusCounts: Record<string, number> = {};
  let totalTasks = 0;
  for (const row of allTasks) {
    statusCounts[row.status] = row._count.id;
    totalTasks += row._count.id;
  }

  // 2. Outcome distribution (from completed tasks)
  const completedTasks = await prisma.verificationTask.groupBy({
    by: ['result'],
    _count: { id: true },
    where: { status: 'COMPLETED', result: { not: null }, ...dateFilter } as any,
  });

  const outcomeCounts: Record<string, number> = {};
  for (const row of completedTasks) {
    if (row.result) outcomeCounts[row.result] = row._count.id;
  }

  // 3. Task type distribution
  const typeTasks = await prisma.verificationTask.groupBy({
    by: ['taskType'],
    _count: { id: true },
    where: dateFilter as any,
  });

  const typeCounts: Record<string, number> = {};
  for (const row of typeTasks) {
    typeCounts[row.taskType] = row._count.id;
  }

  // 4. Risk level distribution (from LoanVerification records)
  const riskData = await prisma.loanVerification.groupBy({
    by: ['riskLevel'],
    _count: { id: true },
    where: { riskLevel: { not: null }, ...(dateFilter.createdAt ? { submittedAt: dateFilter.createdAt } : {}) } as any,
  });

  const riskCounts: Record<string, number> = {};
  for (const row of riskData) {
    if (row.riskLevel) riskCounts[row.riskLevel] = row._count.id;
  }

  // 5. Average turnaround time (completed tasks with startedAt and completedAt)
  const turnaroundTasks = await prisma.verificationTask.findMany({
    where: { status: 'COMPLETED', startedAt: { not: null }, completedAt: { not: null }, ...dateFilter } as any,
    select: { startedAt: true, completedAt: true },
  });

  let avgTurnaroundHours = 0;
  if (turnaroundTasks.length > 0) {
    const totalMs = turnaroundTasks.reduce((sum, t) => {
      return sum + (new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime());
    }, 0);
    avgTurnaroundHours = Math.round((totalMs / turnaroundTasks.length) / (1000 * 60 * 60) * 10) / 10;
  }

  // 6. Tasks per officer (top officers)
  const officerTasks = await prisma.verificationTask.groupBy({
    by: ['assignedToId'],
    _count: { id: true },
    where: { assignedToId: { not: null }, ...dateFilter } as any,
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  const officerIds = officerTasks.map((o) => o.assignedToId!).filter(Boolean);
  const officers = officerIds.length > 0
    ? await prisma.staff.findMany({
        where: { id: { in: officerIds } },
        select: { id: true, firstName: true, lastName: true, employeeId: true },
      })
    : [];

  const officerMap = new Map(officers.map((o) => [o.id, o]));

  // Get completed count per officer for pass rate
  const officerCompleted = await prisma.verificationTask.groupBy({
    by: ['assignedToId', 'result'],
    _count: { id: true },
    where: { status: 'COMPLETED', assignedToId: { in: officerIds }, result: { not: null }, ...dateFilter } as any,
  });

  const officerCompletedMap: Record<string, { total: number; verified: number }> = {};
  for (const row of officerCompleted) {
    if (!row.assignedToId) continue;
    if (!officerCompletedMap[row.assignedToId]) {
      officerCompletedMap[row.assignedToId] = { total: 0, verified: 0 };
    }
    officerCompletedMap[row.assignedToId].total += row._count.id;
    if (row.result === 'VERIFIED') officerCompletedMap[row.assignedToId].verified += row._count.id;
  }

  const officerPerformance = officerTasks.map((o) => {
    const staff = officerMap.get(o.assignedToId!);
    const completed = officerCompletedMap[o.assignedToId!] || { total: 0, verified: 0 };
    return {
      officerId: o.assignedToId!,
      name: staff ? `${staff.firstName} ${staff.lastName}` : 'Unknown',
      employeeId: staff?.employeeId || '',
      totalAssigned: o._count.id,
      totalCompleted: completed.total,
      passRate: completed.total > 0 ? Math.round((completed.verified / completed.total) * 100) : 0,
    };
  });

  // 7. 30-day completion trend
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const recentCompleted = await prisma.verificationTask.findMany({
    where: { status: 'COMPLETED', completedAt: { gte: thirtyDaysAgo } },
    select: { completedAt: true },
  });

  const dailyCounts: Record<string, number> = {};
  for (let d = 0; d < 30; d++) {
    const date = new Date(thirtyDaysAgo);
    date.setDate(date.getDate() + d);
    dailyCounts[date.toISOString().slice(0, 10)] = 0;
  }
  for (const t of recentCompleted) {
    if (t.completedAt) {
      const day = new Date(t.completedAt).toISOString().slice(0, 10);
      if (dailyCounts[day] !== undefined) dailyCounts[day]++;
    }
  }

  const completionTrend = Object.entries(dailyCounts).map(([date, count]) => ({
    date,
    count,
  }));

  // 8. Overdue tasks
  const overdueCount = await prisma.verificationTask.count({
    where: {
      status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      dueDate: { lt: new Date() },
    },
  });

  const completedCount = (statusCounts['COMPLETED'] || 0);
  const verifiedCount = outcomeCounts['VERIFIED'] || 0;
  const passRate = completedCount > 0 ? Math.round((verifiedCount / completedCount) * 100) : 0;

  return {
    summary: {
      totalTasks,
      completedCount,
      passRate,
      avgTurnaroundHours,
      overdueCount,
    },
    statusCounts,
    outcomeCounts,
    typeCounts,
    riskCounts,
    officerPerformance,
    completionTrend,
  };
}
