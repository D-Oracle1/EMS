'use server';

import { Prisma, JournalStatus, JournalEntryType, PeriodStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma, withTransaction } from './prisma';
import { generateReference, getFinancialPeriod } from './utils';

// Configure Decimal.js for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface JournalLineInput {
  accountId: string;
  debitAmount?: number;
  creditAmount?: number;
  description?: string;
  customerId?: string;
  referenceType?: string;
  referenceId?: string;
}

interface CreateJournalEntryParams {
  entryDate: Date;
  valueDate?: Date;
  entryType?: JournalEntryType;
  description: string;
  narration?: string;
  sourceModule?: string;
  sourceType?: string;
  sourceId?: string;
  loanId?: string;
  savingsAccountId?: string;
  fixedDepositId?: string;
  branchId?: string;
  departmentId?: string;
  lines: JournalLineInput[];
  createdById: string;
  autoPost?: boolean;
}

/**
 * Validate that a period is open for posting
 */
async function validatePeriodOpen(date: Date): Promise<void> {
  const { year, month } = getFinancialPeriod(date);

  const period = await prisma.financialPeriod.findUnique({
    where: { year_month: { year, month } },
  });

  if (period && period.status === PeriodStatus.HARD_CLOSE) {
    throw new Error(`Financial period ${year}-${month.toString().padStart(2, '0')} is closed`);
  }
}

/**
 * Validate journal entry balances (Debits must equal Credits)
 */
function validateEntryBalance(lines: JournalLineInput[]): { totalDebit: Decimal; totalCredit: Decimal } {
  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);

  for (const line of lines) {
    if (line.debitAmount && line.debitAmount > 0) {
      totalDebit = totalDebit.plus(line.debitAmount);
    }
    if (line.creditAmount && line.creditAmount > 0) {
      totalCredit = totalCredit.plus(line.creditAmount);
    }
  }

  if (!totalDebit.equals(totalCredit)) {
    throw new Error(`Unbalanced entry: Debits (${totalDebit}) != Credits (${totalCredit})`);
  }

  if (totalDebit.isZero()) {
    throw new Error('Journal entry cannot be zero value');
  }

  return { totalDebit, totalCredit };
}

/**
 * Validate accounts exist and are active (not headers)
 */
async function validateAccounts(accountIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(accountIds)];

  const accounts = await prisma.chartOfAccounts.findMany({
    where: {
      id: { in: uniqueIds },
      isActive: true,
      isHeader: false,
    },
    select: { id: true },
  });

  if (accounts.length !== uniqueIds.length) {
    const foundIds = accounts.map((a) => a.id);
    const missingIds = uniqueIds.filter((id) => !foundIds.includes(id));
    throw new Error(`Invalid or inactive accounts: ${missingIds.join(', ')}`);
  }
}

/**
 * Create a journal entry with double-entry validation.
 * This is the core accounting function - all financial transactions go through this.
 */
export async function createJournalEntry(params: CreateJournalEntryParams) {
  const {
    entryDate,
    valueDate = entryDate,
    entryType = 'STANDARD' as JournalEntryType,
    description,
    narration,
    sourceModule,
    sourceType,
    sourceId,
    loanId,
    savingsAccountId,
    fixedDepositId,
    branchId,
    departmentId,
    lines,
    createdById,
    autoPost = false,
  } = params;

  // Validate period is open
  await validatePeriodOpen(entryDate);

  // Validate entry balances
  const { totalDebit, totalCredit } = validateEntryBalance(lines);

  // Validate all accounts
  const accountIds = lines.map((l) => l.accountId);
  await validateAccounts(accountIds);

  // Generate entry number
  const entryNumber = await generateReference('JOURNAL');

  // Create entry with lines in transaction
  const result = await withTransaction(async (tx) => {
    const journalEntry = await tx.journalEntry.create({
      data: {
        entryNumber,
        entryDate,
        valueDate,
        entryType,
        description,
        narration,
        sourceModule,
        sourceType,
        sourceId,
        loanId,
        savingsAccountId,
        fixedDepositId,
        branchId,
        departmentId,
        totalDebit: totalDebit.toNumber(),
        totalCredit: totalCredit.toNumber(),
        status: autoPost ? JournalStatus.POSTED : JournalStatus.DRAFT,
        createdById,
        postedAt: autoPost ? new Date() : undefined,
      },
    });

    // Create journal entry lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      await tx.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          lineNumber: i + 1,
          accountId: line.accountId,
          debitAmount: line.debitAmount || 0,
          creditAmount: line.creditAmount || 0,
          description: line.description,
          customerId: line.customerId,
          referenceType: line.referenceType,
          referenceId: line.referenceId,
        },
      });
    }

    // If auto-posting, update account balances
    if (autoPost) {
      await updateAccountBalances(tx, lines);
    }

    return journalEntry;
  });

  return {
    id: result.id,
    entryNumber: result.entryNumber,
    totalDebit: totalDebit.toNumber(),
    totalCredit: totalCredit.toNumber(),
    status: result.status,
  };
}

/**
 * Post a draft journal entry
 */
export async function postJournalEntry(entryId: string, approvedById: string) {
  const entry = await prisma.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: true },
  });

  if (!entry) throw new Error('Journal entry not found');
  if (entry.status !== 'DRAFT' && entry.status !== 'APPROVED') {
    throw new Error(`Cannot post entry with status ${entry.status}`);
  }

  await validatePeriodOpen(entry.entryDate);

  await withTransaction(async (tx) => {
    await tx.journalEntry.update({
      where: { id: entryId },
      data: {
        status: JournalStatus.POSTED,
        approvedById,
        postedAt: new Date(),
        approvedAt: new Date(),
      },
    });

    const lines: JournalLineInput[] = entry.lines.map((l) => ({
      accountId: l.accountId,
      debitAmount: l.debitAmount.toNumber(),
      creditAmount: l.creditAmount.toNumber(),
    }));

    await updateAccountBalances(tx, lines);
  });
}

/**
 * Reverse a posted journal entry (creates opposing entry)
 */
export async function reverseJournalEntry(
  entryId: string,
  reason: string,
  reversedById: string
) {
  const entry = await prisma.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: true },
  });

  if (!entry) throw new Error('Journal entry not found');
  if (entry.status !== 'POSTED') throw new Error('Only posted entries can be reversed');
  if (entry.isReversed) throw new Error('Entry already reversed');

  // Create reversal entry (swap debits and credits)
  const reversalLines: JournalLineInput[] = entry.lines.map((l) => ({
    accountId: l.accountId,
    debitAmount: l.creditAmount.toNumber(),
    creditAmount: l.debitAmount.toNumber(),
    description: `Reversal: ${l.description || ''}`,
  }));

  const reversalEntry = await createJournalEntry({
    entryDate: new Date(),
    entryType: 'REVERSAL' as JournalEntryType,
    description: `Reversal of ${entry.entryNumber}: ${reason}`,
    sourceModule: entry.sourceModule || undefined,
    sourceType: 'REVERSAL',
    sourceId: entry.id,
    loanId: entry.loanId || undefined,
    savingsAccountId: entry.savingsAccountId || undefined,
    fixedDepositId: entry.fixedDepositId || undefined,
    branchId: entry.branchId || undefined,
    lines: reversalLines,
    createdById: reversedById,
    autoPost: true,
  });

  // Mark original as reversed
  await prisma.journalEntry.update({
    where: { id: entryId },
    data: {
      isReversed: true,
      reversedAt: new Date(),
      reversalEntryId: reversalEntry.id,
      reversalReason: reason,
    },
  });

  return reversalEntry;
}

/**
 * Update chart of accounts balances based on journal lines.
 * Normal balance rules:
 * - Assets/Expenses: Debit increases, Credit decreases
 * - Liabilities/Equity/Income: Credit increases, Debit decreases
 */
async function updateAccountBalances(
  tx: Prisma.TransactionClient,
  lines: JournalLineInput[]
) {
  for (const line of lines) {
    const account = await tx.chartOfAccounts.findUnique({
      where: { id: line.accountId },
      select: { normalBalance: true, currentBalance: true },
    });

    if (!account) continue;

    const debit = new Decimal(line.debitAmount || 0);
    const credit = new Decimal(line.creditAmount || 0);
    const currentBalance = new Decimal(account.currentBalance.toString());

    let newBalance: Decimal;

    if (account.normalBalance === 'DEBIT') {
      // Assets/Expenses: Debit increases, Credit decreases
      newBalance = currentBalance.plus(debit).minus(credit);
    } else {
      // Liabilities/Equity/Income: Credit increases, Debit decreases
      newBalance = currentBalance.plus(credit).minus(debit);
    }

    await tx.chartOfAccounts.update({
      where: { id: line.accountId },
      data: { currentBalance: newBalance.toNumber() },
    });
  }
}

/**
 * Get account by code
 */
export async function getAccountByCode(code: string) {
  return prisma.chartOfAccounts.findUnique({
    where: { accountCode: code },
  });
}

/**
 * Generate Trial Balance
 */
export async function generateTrialBalance(asOfDate?: Date) {
  const accounts = await prisma.chartOfAccounts.findMany({
    where: {
      isActive: true,
      isHeader: false,
    },
    orderBy: { accountCode: 'asc' },
  });

  let totalDebits = new Decimal(0);
  let totalCredits = new Decimal(0);

  const rows = accounts
    .filter((a) => !new Decimal(a.currentBalance.toString()).isZero())
    .map((account) => {
      const balance = new Decimal(account.currentBalance.toString());
      const isDebitBalance = account.normalBalance === 'DEBIT' ? balance.gte(0) : balance.lt(0);

      const debit = isDebitBalance ? balance.abs().toNumber() : 0;
      const credit = isDebitBalance ? 0 : balance.abs().toNumber();

      totalDebits = totalDebits.plus(debit);
      totalCredits = totalCredits.plus(credit);

      return {
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        debit,
        credit,
      };
    });

  return {
    rows,
    totalDebits: totalDebits.toNumber(),
    totalCredits: totalCredits.toNumber(),
    isBalanced: totalDebits.equals(totalCredits),
    asOfDate: asOfDate || new Date(),
  };
}

/**
 * Close a financial period
 */
export async function closePeriod(
  year: number,
  month: number,
  closeType: 'SOFT_CLOSE' | 'HARD_CLOSE',
  closedById: string,
  notes?: string
) {
  const period = await prisma.financialPeriod.findUnique({
    where: { year_month: { year, month } },
  });

  if (period?.status === 'HARD_CLOSE') {
    throw new Error('Period is already hard closed');
  }

  await prisma.financialPeriod.upsert({
    where: { year_month: { year, month } },
    update: {
      status: closeType as PeriodStatus,
      closedById,
      closedAt: new Date(),
      closingNotes: notes,
    },
    create: {
      year,
      month,
      startDate: new Date(year, month - 1, 1),
      endDate: new Date(year, month, 0),
      status: closeType as PeriodStatus,
      closedById,
      closedAt: new Date(),
      closingNotes: notes,
    },
  });
}
