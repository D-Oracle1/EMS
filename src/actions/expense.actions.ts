'use server';

/**
 * Expenses — Server Actions
 * Hylink Finance Limited EMS
 *
 * The accountant records operating expenses; an admin approves or rejects
 * them. Nothing reaches the ledger until an expense is approved; approval
 * posts Dr the expense account / Cr the cash or bank account it was paid
 * from, tagged with the expense's branch (or head office).
 *
 * Who may do what is in lib/expense-access.ts.
 */

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotification, createNotificationForUsers } from '@/lib/notifications';
import { generateReference } from '@/lib/utils';
import { createJournalEntry } from '@/lib/accounting-engine';
import {
  canRecordExpenses, canApproveExpenses, isPaymentAccountCode,
  EXPENSE_APPROVE_ROLE_LEVEL,
} from '@/lib/expense-access';
import { monthKey, monthRange } from '@/lib/marketing-access';
import type { ActionResult } from '@/types';

const PAYMENT_MODES = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'POS', 'DIRECT_DEBIT'];
const num = (v: unknown) => (v == null ? 0 : Number(v));
const fullName = (s?: { firstName: string; lastName: string } | null) => (s ? `${s.firstName} ${s.lastName}` : null);

async function viewer() {
  const { user } = await getSession();
  return { user, canRecord: canRecordExpenses(user), canApprove: canApproveExpenses(user) };
}

async function requireExpenseAccess() {
  const v = await viewer();
  if (!v.canRecord && !v.canApprove) throw new Error('Permission denied');
  return v;
}

/** Everyone who approves expenses, for notifications. */
async function approverIds(): Promise<string[]> {
  const rows = await prisma.staff.findMany({
    where: {
      status: 'ACTIVE',
      isDeleted: false,
      OR: [
        { role: { level: { gte: EXPENSE_APPROVE_ROLE_LEVEL } } },
        { role: { permissions: { some: { permission: { code: 'ADMIN:SYSTEM' } } } } },
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function getExpenseAccess() {
  const v = await viewer();
  return { canRecord: v.canRecord, canApprove: v.canApprove, userId: v.user.id };
}

/** The expense accounts, the cash and bank accounts, and the branches to pick from. */
export async function getExpenseOptions() {
  await requireExpenseAccess();
  const [expenseAccounts, assetAccounts, branches] = await Promise.all([
    prisma.chartOfAccounts.findMany({
      where: { accountType: 'EXPENSE', isHeader: false, isActive: true },
      select: { id: true, accountCode: true, accountName: true },
      orderBy: { accountCode: 'asc' },
    }),
    prisma.chartOfAccounts.findMany({
      where: { accountType: 'ASSET', isHeader: false, isActive: true, accountCode: { startsWith: '11' } },
      select: { id: true, accountCode: true, accountName: true },
      orderBy: { accountCode: 'asc' },
    }),
    prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
  ]);
  return {
    expenseAccounts,
    paymentAccounts: assetAccounts.filter((a) => isPaymentAccountCode(a.accountCode)),
    branches,
  };
}

// ── Recording ───────────────────────────────────────────────────────────────

export interface RecordExpenseInput {
  expenseDate: string;
  amount: number;
  payee: string;
  description: string;
  expenseAccountId: string;
  paymentAccountId: string;
  paymentMode?: string;
  paymentReference?: string;
  branchId?: string | null;
}

export async function recordExpense(data: RecordExpenseInput): Promise<ActionResult<{ id: string; reference: string }>> {
  try {
    const { user, canRecord } = await viewer();
    if (!canRecord) return { success: false, error: 'Only the accountant can record expenses' };

    if (!Number.isFinite(data.amount) || data.amount <= 0) return { success: false, error: 'Enter an amount greater than zero' };
    if (!data.payee?.trim()) return { success: false, error: 'Who was paid?' };
    if (!data.description?.trim()) return { success: false, error: 'Describe what the expense was for' };
    const expenseDate = new Date(data.expenseDate);
    if (Number.isNaN(expenseDate.getTime())) return { success: false, error: 'Enter the date of the expense' };
    if (expenseDate.getTime() > Date.now() + 86_400_000) return { success: false, error: 'The expense date cannot be in the future' };
    const paymentMode = data.paymentMode ?? 'CASH';
    if (!PAYMENT_MODES.includes(paymentMode)) return { success: false, error: 'Unknown payment method' };

    const [expenseAccount, paymentAccount] = await Promise.all([
      prisma.chartOfAccounts.findUnique({ where: { id: data.expenseAccountId } }),
      prisma.chartOfAccounts.findUnique({ where: { id: data.paymentAccountId } }),
    ]);
    if (!expenseAccount || expenseAccount.accountType !== 'EXPENSE' || expenseAccount.isHeader || !expenseAccount.isActive) {
      return { success: false, error: 'Choose an active expense account' };
    }
    if (!paymentAccount || paymentAccount.accountType !== 'ASSET' || paymentAccount.isHeader || !paymentAccount.isActive || !isPaymentAccountCode(paymentAccount.accountCode)) {
      return { success: false, error: 'Choose the cash or bank account it was paid from' };
    }
    if (data.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: data.branchId }, select: { id: true } });
      if (!branch) return { success: false, error: 'Branch not found' };
    }

    const reference = await generateReference('EXPENSE');
    const expense = await prisma.expense.create({
      data: {
        reference,
        expenseDate,
        amount: data.amount,
        payee: data.payee.trim(),
        description: data.description.trim(),
        expenseAccountId: expenseAccount.id,
        paymentAccountId: paymentAccount.id,
        paymentMode: paymentMode as any,
        paymentReference: data.paymentReference?.trim() || null,
        branchId: data.branchId || null,
        recordedById: user.id,
      },
    });

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'ACCOUNTING', entityType: 'EXPENSE', entityId: expense.id,
      description: `Recorded expense ${reference}: ${data.amount} to ${data.payee.trim()} (${expenseAccount.accountName})`,
    });
    const recipients = (await approverIds()).filter((id) => id !== user.id);
    await createNotificationForUsers(recipients, {
      type: 'APPROVAL_REQUIRED',
      title: 'Expense awaiting approval',
      message: `${user.firstName} ${user.lastName} recorded ${reference}: ${data.amount} to ${data.payee.trim()} for ${expenseAccount.accountName}.`,
      entityType: 'EXPENSE',
      entityId: expense.id,
      actionUrl: '/accounting/expenses',
    });

    return { success: true, message: `Expense ${reference} sent for approval`, data: { id: expense.id, reference } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ── Listing ─────────────────────────────────────────────────────────────────

export interface ExpenseFilters {
  status?: string;
  month?: string;
  expenseAccountId?: string;
  branchId?: string; // 'HQ' for head office
  search?: string;
  page?: number;
  limit?: number;
}

function expenseWhere(filters: ExpenseFilters) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.expenseAccountId) where.expenseAccountId = filters.expenseAccountId;
  if (filters.branchId) where.branchId = filters.branchId === 'HQ' ? null : filters.branchId;
  if (filters.month) {
    const { from, to } = monthRange(filters.month);
    where.expenseDate = { gte: from, lt: to };
  }
  if (filters.search?.trim()) {
    const like = { contains: filters.search.trim(), mode: 'insensitive' };
    where.OR = [{ reference: like }, { payee: like }, { description: like }];
  }
  return where;
}

export async function getExpenses(filters: ExpenseFilters = {}) {
  await requireExpenseAccess();
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, filters.limit || 25);
  const where = expenseWhere(filters);

  const [rows, total] = await Promise.all([
    prisma.expense.findMany({
      where: where as any,
      include: {
        expenseAccount: { select: { accountCode: true, accountName: true } },
        paymentAccount: { select: { accountCode: true, accountName: true } },
        branch: { select: { name: true } },
        recordedBy: { select: { firstName: true, lastName: true } },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.expense.count({ where: where as any }),
  ]);

  return {
    data: rows.map((e) => ({
      id: e.id,
      reference: e.reference,
      expenseDate: e.expenseDate.toISOString(),
      amount: num(e.amount),
      payee: e.payee,
      description: e.description,
      category: `${e.expenseAccount.accountCode} · ${e.expenseAccount.accountName}`,
      paidFrom: `${e.paymentAccount.accountCode} · ${e.paymentAccount.accountName}`,
      paymentMode: e.paymentMode as string,
      paymentReference: e.paymentReference,
      branch: e.branch?.name ?? null,
      status: e.status as string,
      recordedById: e.recordedById,
      recordedBy: fullName(e.recordedBy),
      reviewedBy: fullName(e.reviewedBy),
      reviewedAt: e.reviewedAt?.toISOString() ?? null,
      reviewNote: e.reviewNote,
      journalEntryId: e.journalEntryId,
      createdAt: e.createdAt.toISOString(),
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export type ExpenseRow = Awaited<ReturnType<typeof getExpenses>>['data'][number];

/** The month at a glance: approved spend, what awaits approval, by category and branch. */
export async function getExpenseSummary(month?: string) {
  await requireExpenseAccess();
  const key = month || monthKey(new Date());
  const { from, to } = monthRange(key);
  const inMonth = { expenseDate: { gte: from, lt: to } };

  const [approved, pending, byAccount, byBranch] = await Promise.all([
    prisma.expense.aggregate({ where: { ...inMonth, status: 'APPROVED' }, _sum: { amount: true }, _count: true }),
    prisma.expense.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true }, _count: true }),
    prisma.expense.groupBy({ by: ['expenseAccountId'], where: { ...inMonth, status: 'APPROVED' }, _sum: { amount: true }, _count: true }),
    prisma.expense.groupBy({ by: ['branchId'], where: { ...inMonth, status: 'APPROVED' }, _sum: { amount: true }, _count: true }),
  ]);

  const [accounts, branches] = await Promise.all([
    prisma.chartOfAccounts.findMany({ where: { id: { in: byAccount.map((a) => a.expenseAccountId) } }, select: { id: true, accountCode: true, accountName: true } }),
    prisma.branch.findMany({ where: { id: { in: byBranch.map((b) => b.branchId).filter((id): id is string => !!id) } }, select: { id: true, name: true } }),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, `${a.accountCode} · ${a.accountName}`]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  return {
    month: key,
    approvedAmount: num(approved._sum.amount),
    approvedCount: approved._count,
    pendingAmount: num(pending._sum.amount),
    pendingCount: pending._count,
    byCategory: byAccount
      .map((a) => ({ label: accountName.get(a.expenseAccountId) ?? 'Unknown', amount: num(a._sum.amount), count: a._count }))
      .sort((a, b) => b.amount - a.amount),
    byBranch: byBranch
      .map((b) => ({ label: b.branchId ? branchName.get(b.branchId) ?? 'Unknown' : 'Head office', amount: num(b._sum.amount), count: b._count }))
      .sort((a, b) => b.amount - a.amount),
  };
}

// ── Approval ────────────────────────────────────────────────────────────────

export async function approveExpense(id: string, note?: string): Promise<ActionResult> {
  try {
    const { user, canApprove } = await viewer();
    if (!canApprove) return { success: false, error: 'Only an admin can approve expenses' };

    const expense = await prisma.expense.findUnique({
      where: { id },
      include: { expenseAccount: true, paymentAccount: true },
    });
    if (!expense) return { success: false, error: 'Expense not found' };
    if (expense.recordedById === user.id) return { success: false, error: 'You cannot approve an expense you recorded' };
    if (expense.status !== 'PENDING') return { success: false, error: `This expense is already ${expense.status.toLowerCase()}` };

    // Claim it before posting, so two approvers cannot post it twice.
    const claimed = await prisma.expense.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVING', reviewedById: user.id },
    });
    if (claimed.count !== 1) return { success: false, error: 'Someone else is already reviewing this expense' };

    const amount = num(expense.amount);
    let journalEntryId: string;
    try {
      const entry = await createJournalEntry({
        entryDate: expense.expenseDate,
        description: `Expense ${expense.reference}: ${expense.payee} - ${expense.description}`,
        sourceModule: 'EXPENSES',
        sourceType: 'EXPENSE',
        sourceId: expense.id,
        branchId: expense.branchId ?? undefined,
        lines: [
          { accountId: expense.expenseAccountId, debitAmount: amount, description: `${expense.expenseAccount.accountName} - ${expense.reference}` },
          { accountId: expense.paymentAccountId, creditAmount: amount, description: `Paid to ${expense.payee} - ${expense.reference}` },
        ],
        createdById: expense.recordedById,
        autoPost: true,
      });
      journalEntryId = entry.id;
    } catch (e: any) {
      await prisma.expense.update({ where: { id }, data: { status: 'PENDING', reviewedById: null } });
      return { success: false, error: `Could not post to the ledger: ${e.message}` };
    }

    await prisma.expense.update({
      where: { id },
      data: { status: 'APPROVED', reviewedById: user.id, reviewedAt: new Date(), reviewNote: note?.trim() || null, journalEntryId },
    });

    await auditLog({
      userId: user.id, action: 'APPROVE', module: 'ACCOUNTING', entityType: 'EXPENSE', entityId: id,
      description: `Approved expense ${expense.reference}: ${amount}; posted to the ledger`,
    });
    await createNotification({
      userId: expense.recordedById,
      type: 'INFO',
      title: 'Expense approved',
      message: `${expense.reference} (${amount} to ${expense.payee}) was approved and posted.`,
      entityType: 'EXPENSE',
      entityId: id,
      actionUrl: '/accounting/expenses',
    });

    return { success: true, message: `${expense.reference} approved and posted` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function rejectExpense(id: string, reason: string): Promise<ActionResult> {
  try {
    const { user, canApprove } = await viewer();
    if (!canApprove) return { success: false, error: 'Only an admin can reject expenses' };
    if (!reason?.trim()) return { success: false, error: 'Give a reason for rejecting the expense' };

    const expense = await prisma.expense.findUnique({ where: { id }, select: { reference: true, recordedById: true } });
    if (!expense) return { success: false, error: 'Expense not found' };
    if (expense.recordedById === user.id) return { success: false, error: 'You cannot review an expense you recorded' };

    const updated = await prisma.expense.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', reviewedById: user.id, reviewedAt: new Date(), reviewNote: reason.trim() },
    });
    if (updated.count !== 1) return { success: false, error: 'This expense is no longer pending' };

    await auditLog({
      userId: user.id, action: 'REJECT', module: 'ACCOUNTING', entityType: 'EXPENSE', entityId: id,
      description: `Rejected expense ${expense.reference}: ${reason.trim()}`,
    });
    await createNotification({
      userId: expense.recordedById,
      type: 'WARNING',
      title: 'Expense rejected',
      message: `${expense.reference} was rejected: ${reason.trim()}`,
      entityType: 'EXPENSE',
      entityId: id,
      actionUrl: '/accounting/expenses',
    });

    return { success: true, message: `${expense.reference} rejected` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
