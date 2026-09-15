'use server';

/**
 * Staff bank details — Server Actions
 * Hylink Finance Limited EMS
 *
 * Staff submit their own account details; HR confirms them before they count.
 *
 * The confirmed values live on the Staff record. A submission never writes
 * there until it is approved, and payroll reads Staff — so an unconfirmed
 * account number cannot reach a bank draft, even by mistake. That is the whole
 * reason this is a two-step flow rather than an edit form: a salary
 * destination is worth a second pair of eyes.
 */

import { prisma } from '@/lib/prisma';
import { getSession, requirePermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import type { ActionResult } from '@/types';

/** Confirming someone's bank details belongs with the people who run payroll. */
const REVIEW_PERMISSION = 'HR:PAYROLL_MANAGE';

export type BankDetailStatusValue = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface BankSubmissionView {
  id: string;
  staffId: string;
  staffName: string;
  employeeId: string;
  department: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  status: BankDetailStatusValue;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  previousAccountNumber: string | null;
}

export interface MyBankDetails {
  /** What payroll will actually use. Null until a submission has been approved. */
  confirmed: { bankName: string | null; accountNumber: string | null; accountName: string | null };
  /** The submission awaiting review, if any. */
  pending: BankSubmissionView | null;
  /** The most recent rejection, so the reason can be shown back to the person. */
  lastRejected: BankSubmissionView | null;
}

const SUBMISSION_INCLUDE = {
  staff: { select: { firstName: true, lastName: true, employeeId: true, department: { select: { name: true } } } },
  reviewedBy: { select: { firstName: true, lastName: true } },
} as const;

type SubmissionRow = {
  id: string;
  staffId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  status: BankDetailStatusValue;
  submittedAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  previousAccountNumber: string | null;
  staff: { firstName: string; lastName: string; employeeId: string; department: { name: string } };
  reviewedBy: { firstName: string; lastName: string } | null;
};

function toView(row: SubmissionRow): BankSubmissionView {
  return {
    id: row.id,
    staffId: row.staffId,
    staffName: `${row.staff.firstName} ${row.staff.lastName}`,
    employeeId: row.staff.employeeId,
    department: row.staff.department.name,
    bankName: row.bankName,
    accountNumber: row.accountNumber,
    accountName: row.accountName,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedBy: row.reviewedBy ? `${row.reviewedBy.firstName} ${row.reviewedBy.lastName}` : null,
    rejectionReason: row.rejectionReason,
    previousAccountNumber: row.previousAccountNumber,
  };
}

// ============================================================================
// STAFF SIDE
// ============================================================================

export async function getMyBankDetails(): Promise<MyBankDetails> {
  const { user } = await getSession();

  const [staff, pending, lastRejected] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: user.id },
      select: { bankName: true, bankAccountNumber: true, bankAccountName: true },
    }),
    prisma.bankDetailSubmission.findFirst({
      where: { staffId: user.id, status: 'PENDING' },
      include: SUBMISSION_INCLUDE,
      orderBy: { submittedAt: 'desc' },
    }),
    prisma.bankDetailSubmission.findFirst({
      where: { staffId: user.id, status: 'REJECTED' },
      include: SUBMISSION_INCLUDE,
      orderBy: { reviewedAt: 'desc' },
    }),
  ]);

  return {
    confirmed: {
      bankName: staff?.bankName ?? null,
      accountNumber: staff?.bankAccountNumber ?? null,
      accountName: staff?.bankAccountName ?? null,
    },
    pending: pending ? toView(pending as SubmissionRow) : null,
    lastRejected: lastRejected ? toView(lastRejected as SubmissionRow) : null,
  };
}

export async function submitMyBankDetails(input: {
  bankName: string;
  accountNumber: string;
  accountName: string;
}): Promise<ActionResult<{ id: string }>> {
  const { user } = await getSession();

  const bankName = input.bankName?.trim();
  const accountName = input.accountName?.trim();
  // Nigerian bank accounts are ten digits. Strip spacing people paste in.
  const accountNumber = input.accountNumber?.replace(/[\s-]/g, '');

  if (!bankName) return { success: false, error: 'Enter the bank name.' };
  if (!accountName) return { success: false, error: 'Enter the account name.' };
  if (!accountNumber) return { success: false, error: 'Enter the account number.' };
  if (!/^\d{10}$/.test(accountNumber)) {
    return { success: false, error: 'An account number is 10 digits.' };
  }

  const staff = await prisma.staff.findUnique({
    where: { id: user.id },
    select: { bankAccountNumber: true },
  });

  // One open submission at a time: a re-submission replaces the last, so a
  // reviewer is never choosing between two competing versions.
  const result = await prisma.$transaction(async (tx) => {
    await tx.bankDetailSubmission.updateMany({
      where: { staffId: user.id, status: 'PENDING' },
      data: { status: 'REJECTED', rejectionReason: 'Replaced by a newer submission', reviewedAt: new Date() },
    });

    return tx.bankDetailSubmission.create({
      data: {
        staffId: user.id,
        bankName,
        accountNumber,
        accountName,
        previousAccountNumber: staff?.bankAccountNumber ?? null,
      },
      select: { id: true },
    });
  });

  // Tell the people who can confirm it, so it does not sit unnoticed until
  // payroll day.
  const reviewers = await prisma.staff.findMany({
    where: {
      status: 'ACTIVE',
      isDeleted: false,
      role: { permissions: { some: { permission: { code: REVIEW_PERMISSION } } } },
    },
    select: { id: true },
  });

  await Promise.all(
    reviewers.map((r) =>
      createNotification({
        userId: r.id,
        type: 'APPROVAL_REQUIRED',
        title: 'Bank details awaiting confirmation',
        message: `${user.firstName} ${user.lastName} submitted account details for payroll.`,
        entityType: 'BankDetailSubmission',
        entityId: result.id,
        actionUrl: '/hr/payroll',
        email: false,
      })
    )
  );

  await auditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'CREATE',
    module: 'HR',
    entityType: 'BankDetailSubmission',
    entityId: result.id,
    // Deliberately no account number in the description: audit descriptions are
    // read widely, and this one only needs to say that a change was asked for.
    description: `Submitted bank details for confirmation (${bankName})`,
  });

  return {
    success: true,
    message: 'Submitted. Payroll will use these once HR has confirmed them.',
    data: { id: result.id },
  };
}

// ============================================================================
// HR SIDE
// ============================================================================

export async function listBankSubmissions(filters?: {
  status?: BankDetailStatusValue;
}): Promise<BankSubmissionView[]> {
  await requirePermission(REVIEW_PERMISSION);

  const rows = await prisma.bankDetailSubmission.findMany({
    where: filters?.status ? { status: filters.status } : {},
    include: SUBMISSION_INCLUDE,
    orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }],
    take: 200,
  });

  return rows.map((r) => toView(r as SubmissionRow));
}

/** How many are waiting, for a badge on the payroll screen. */
export async function countPendingBankSubmissions(): Promise<number> {
  await requirePermission(REVIEW_PERMISSION);
  return prisma.bankDetailSubmission.count({ where: { status: 'PENDING' } });
}

export async function approveBankSubmission(id: string): Promise<ActionResult> {
  const user = await requirePermission(REVIEW_PERMISSION);

  const submission = await prisma.bankDetailSubmission.findUnique({
    where: { id },
    select: { id: true, staffId: true, status: true, bankName: true, accountNumber: true, accountName: true },
  });
  if (!submission) return { success: false, error: 'That submission no longer exists.' };
  if (submission.status !== 'PENDING') {
    return { success: false, error: `Only a pending submission can be confirmed (this one is ${submission.status.toLowerCase()}).` };
  }
  if (submission.staffId === user.id) {
    // The same separation of duties payroll approval already enforces.
    return { success: false, error: 'You cannot confirm your own bank details.' };
  }

  // The write to Staff and the status change belong together: a half-applied
  // confirmation would leave payroll reading details nobody approved.
  await prisma.$transaction([
    prisma.staff.update({
      where: { id: submission.staffId },
      data: {
        bankName: submission.bankName,
        bankAccountNumber: submission.accountNumber,
        bankAccountName: submission.accountName,
      },
    }),
    prisma.bankDetailSubmission.update({
      where: { id },
      data: { status: 'APPROVED', reviewedById: user.id, reviewedAt: new Date() },
    }),
  ]);

  await createNotification({
    userId: submission.staffId,
    type: 'INFO',
    title: 'Bank details confirmed',
    message: 'Your account details have been confirmed and will be used for payroll.',
    entityType: 'BankDetailSubmission',
    entityId: id,
    actionUrl: '/hr/my-profile',
  });

  await auditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'APPROVE',
    module: 'HR',
    entityType: 'BankDetailSubmission',
    entityId: id,
    description: `Confirmed bank details for staff ${submission.staffId} (${submission.bankName})`,
  });

  return { success: true, message: 'Bank details confirmed.' };
}

export async function rejectBankSubmission(id: string, reason: string): Promise<ActionResult> {
  const user = await requirePermission(REVIEW_PERMISSION);

  const trimmed = reason?.trim();
  if (!trimmed) return { success: false, error: 'Give a reason, so they know what to correct.' };

  const submission = await prisma.bankDetailSubmission.findUnique({
    where: { id },
    select: { id: true, staffId: true, status: true },
  });
  if (!submission) return { success: false, error: 'That submission no longer exists.' };
  if (submission.status !== 'PENDING') {
    return { success: false, error: `Only a pending submission can be rejected (this one is ${submission.status.toLowerCase()}).` };
  }

  await prisma.bankDetailSubmission.update({
    where: { id },
    data: { status: 'REJECTED', reviewedById: user.id, reviewedAt: new Date(), rejectionReason: trimmed },
  });

  await createNotification({
    userId: submission.staffId,
    type: 'WARNING',
    title: 'Bank details need correcting',
    message: trimmed,
    entityType: 'BankDetailSubmission',
    entityId: id,
    actionUrl: '/hr/my-profile',
  });

  await auditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'REJECT',
    module: 'HR',
    entityType: 'BankDetailSubmission',
    entityId: id,
    description: `Rejected bank details for staff ${submission.staffId}: ${trimmed}`,
  });

  return { success: true, message: 'Rejected, and they have been told why.' };
}
