'use server';

/**
 * The dashboard's To Do and Recent Activity widgets.
 *
 * Tasks are only the things genuinely waiting on THIS user: a savings officer
 * is never shown a loan to approve, and someone without an approval permission
 * is shown no approvals at all. Same departmental isolation as the sidebar.
 */

import { prisma } from '@/lib/prisma';
import { getSession, hasAnyPermission } from '@/lib/auth-utils';

export interface WorkspaceTask {
  id: string;
  label: string;
  detail: string;
  href: string;
  /** Drives the tint of the row's icon. */
  kind: 'loan' | 'savings' | 'leave' | 'verification';
}

export interface WorkspaceActivity {
  id: string;
  description: string;
  module: string;
  at: string;
}

export interface WorkspaceData {
  tasks: WorkspaceTask[];
  /** Tasks cleared today, for the completion line under the list. */
  doneToday: number;
  activity: WorkspaceActivity[];
}

const naira = (n: unknown) =>
  Number(n ?? 0).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });

export async function getMyWorkspace(): Promise<WorkspaceData> {
  const { user } = await getSession();

  const canApproveLoans = hasAnyPermission(user, [
    'LOANS:APPROVE', 'LOANS:APPROVE_L1', 'LOANS:APPROVE_L2',
  ]);
  const canVerify = hasAnyPermission(user, ['LOANS:VERIFY', 'VERIFICATION:PROCESS']);
  const canApproveWithdrawals = hasAnyPermission(user, ['SAVINGS:APPROVE', 'SAVINGS:WITHDRAW']);
  const canManageLeave = hasAnyPermission(user, ['HR:LEAVE_MANAGE']);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [loans, verifications, withdrawals, leave, activity, clearedToday] = await Promise.all([
    canApproveLoans
      ? prisma.loan.findMany({
          where: { status: 'PENDING_APPROVAL', isDeleted: false },
          select: {
            id: true, loanNumber: true, principalAmount: true,
            customer: { select: { firstName: true, lastName: true } },
          },
          take: 5,
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),

    canVerify
      ? prisma.loan.findMany({
          where: { status: { in: ['PENDING_VERIFICATION', 'VERIFICATION_IN_PROGRESS'] }, isDeleted: false },
          select: {
            id: true, loanNumber: true,
            customer: { select: { firstName: true, lastName: true } },
          },
          take: 5,
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),

    canApproveWithdrawals
      ? prisma.withdrawalRequest.findMany({
          where: { status: 'PENDING' },
          select: {
            id: true, requestNumber: true, amount: true,
            account: { select: { id: true, accountNumber: true } },
          },
          take: 5,
          orderBy: { requestedAt: 'asc' },
        })
      : Promise.resolve([]),

    canManageLeave
      ? prisma.leaveRequest.findMany({
          where: { status: 'PENDING' },
          select: {
            id: true, startDate: true, endDate: true,
            staff: { select: { firstName: true, lastName: true } },
          },
          take: 5,
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),

    // What this user themselves has been doing.
    prisma.auditLog.findMany({
      where: { userId: user.id },
      select: { id: true, description: true, module: true, createdAt: true },
      take: 8,
      orderBy: { createdAt: 'desc' },
    }),

    prisma.auditLog.count({
      where: {
        userId: user.id,
        createdAt: { gte: startOfToday },
        action: { in: ['APPROVE', 'REJECT', 'UPDATE'] },
      },
    }),
  ]);

  const tasks: WorkspaceTask[] = [
    ...loans.map((l) => ({
      id: `loan-${l.id}`,
      kind: 'loan' as const,
      label: `Approve loan ${l.loanNumber}`,
      detail: `${l.customer.firstName} ${l.customer.lastName} · ${naira(l.principalAmount)}`,
      href: `/loans/${l.id}`,
    })),
    ...verifications.map((l) => ({
      id: `verify-${l.id}`,
      kind: 'verification' as const,
      label: `Verify loan ${l.loanNumber}`,
      detail: `${l.customer.firstName} ${l.customer.lastName}`,
      href: `/loans/${l.id}`,
    })),
    ...withdrawals.map((w) => ({
      id: `wdr-${w.id}`,
      kind: 'savings' as const,
      label: `Authorise withdrawal ${w.requestNumber}`,
      detail: `${w.account?.accountNumber ?? 'account'} · ${naira(w.amount)}`,
      href: '/savings/withdrawals',
    })),
    ...leave.map((r) => ({
      id: `leave-${r.id}`,
      kind: 'leave' as const,
      label: `Leave request from ${r.staff.firstName} ${r.staff.lastName}`,
      detail: `${r.startDate.toISOString().slice(0, 10)} to ${r.endDate.toISOString().slice(0, 10)}`,
      href: '/hr/leave',
    })),
  ];

  return {
    tasks,
    doneToday: clearedToday,
    activity: activity.map((a) => ({
      id: a.id,
      description: a.description,
      module: a.module,
      at: a.createdAt.toISOString(),
    })),
  };
}
