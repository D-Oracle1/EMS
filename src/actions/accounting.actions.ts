'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission, getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import {
  createJournalEntry as createJE,
  postJournalEntry as postJE,
  reverseJournalEntry as reverseJE,
  generateTrialBalance as genTB,
  closePeriod as closeP,
  type JournalLineInput,
} from '@/lib/accounting-engine';
import type { ActionResult } from '@/types';

export async function getChartOfAccounts() {
  await requirePermission('ACCOUNTS:COA_MANAGE');

  return prisma.chartOfAccounts.findMany({
    where: { isActive: true },
    orderBy: { accountCode: 'asc' },
    include: { parent: { select: { accountName: true, accountCode: true } } },
  });
}

export async function getJournalEntries(filters?: {
  status?: string;
  sourceModule?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  await requirePermission('ACCOUNTS:JOURNAL_CREATE');

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.sourceModule) where.sourceModule = filters.sourceModule;
  if (filters?.startDate || filters?.endDate) {
    where.entryDate = {};
    if (filters?.startDate) (where.entryDate as any).gte = new Date(filters.startDate);
    if (filters?.endDate) (where.entryDate as any).lte = new Date(filters.endDate);
  }

  const [data, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where: where as any,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        lines: { include: { account: { select: { accountCode: true, accountName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.journalEntry.count({ where: where as any }),
  ]);

  return {
    data: data.map((j) => ({
      ...j,
      totalDebit: j.totalDebit.toNumber(),
      totalCredit: j.totalCredit.toNumber(),
      lines: j.lines.map((l) => ({
        ...l,
        debitAmount: l.debitAmount.toNumber(),
        creditAmount: l.creditAmount.toNumber(),
      })),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function createManualJournalEntry(data: {
  entryDate: string;
  description: string;
  narration?: string;
  lines: JournalLineInput[];
  autoPost?: boolean;
}): Promise<ActionResult> {
  try {
    const user = await requirePermission('ACCOUNTS:JOURNAL_CREATE');

    const result = await createJE({
      entryDate: new Date(data.entryDate),
      description: data.description,
      narration: data.narration,
      sourceModule: 'MANUAL',
      lines: data.lines,
      createdById: user.id,
      autoPost: data.autoPost,
    });

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'ACCOUNTS', entityType: 'JOURNAL_ENTRY', entityId: result.id,
      description: `Created journal entry ${result.entryNumber}: ${data.description}`,
    });

    return { success: true, message: `Journal entry ${result.entryNumber} created`, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function postJournalEntryAction(entryId: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('ACCOUNTS:JOURNAL_POST');

    await postJE(entryId, user.id);

    await auditLog({
      userId: user.id, action: 'APPROVE', module: 'ACCOUNTS', entityType: 'JOURNAL_ENTRY', entityId: entryId,
      description: `Posted journal entry`,
    });

    return { success: true, message: 'Journal entry posted' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function reverseJournalEntryAction(entryId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('ACCOUNTS:JOURNAL_REVERSE');

    const result = await reverseJE(entryId, reason, user.id);

    await auditLog({
      userId: user.id, action: 'REVERSAL', module: 'ACCOUNTS', entityType: 'JOURNAL_ENTRY', entityId: entryId,
      description: `Reversed journal entry. Reason: ${reason}`,
    });

    return { success: true, message: `Entry reversed. New entry: ${result.entryNumber}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getTrialBalance() {
  await requirePermission('ACCOUNTS:REPORTS_VIEW');
  return genTB();
}

export async function closePeriodAction(
  year: number,
  month: number,
  closeType: 'SOFT_CLOSE' | 'HARD_CLOSE',
  notes?: string
): Promise<ActionResult> {
  try {
    const user = await requirePermission('ACCOUNTS:PERIOD_CLOSE');

    await closeP(year, month, closeType, user.id, notes);

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'ACCOUNTS', entityType: 'FINANCIAL_PERIOD',
      description: `${closeType} period ${year}-${month.toString().padStart(2, '0')}`,
    });

    return { success: true, message: `Period ${year}-${month} ${closeType.replace('_', ' ').toLowerCase()}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getFinancialPeriods() {
  await requirePermission('ACCOUNTS:REPORTS_VIEW');

  return prisma.financialPeriod.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
}
