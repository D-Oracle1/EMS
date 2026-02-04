/**
 * Hylink EMS - Accounting Service
 * Double-Entry Bookkeeping Engine
 *
 * CRITICAL: This module handles all financial transactions.
 * All entries must balance (Debits = Credits)
 * No direct edits - only reversals allowed for corrections
 */

import { Prisma, JournalStatus, JournalEntryType, AccountType, BalanceType, PeriodStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma, withTransaction } from '../lib/prisma.js';
import { logger, financialLog } from '../lib/logger.js';
import { generateReference, getFinancialPeriod, getPeriodDateRange } from '../utils/helpers.js';
import {
  UnbalancedEntryError,
  PeriodClosedError,
  AccountingError,
  NotFoundError,
  BusinessError,
} from '../utils/errors.js';
import { JournalEntryInput, JournalLineInput } from '../types/index.js';

// Configure Decimal.js for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

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

interface JournalEntryResult {
  id: string;
  entryNumber: string;
  totalDebit: number;
  totalCredit: number;
  status: JournalStatus;
}

/**
 * Core Accounting Service
 */
export class AccountingService {
  /**
   * Validate that a period is open for posting
   */
  async validatePeriodOpen(date: Date): Promise<void> {
    const { year, month } = getFinancialPeriod(date);

    const period = await prisma.financialPeriod.findUnique({
      where: { year_month: { year, month } },
    });

    if (period && period.status === PeriodStatus.HARD_CLOSE) {
      throw new PeriodClosedError(`${year}-${month.toString().padStart(2, '0')}`);
    }
  }

  /**
   * Validate journal entry balances
   */
  validateEntryBalance(lines: JournalLineInput[]): { totalDebit: Decimal; totalCredit: Decimal } {
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

    // Entries must balance
    if (!totalDebit.equals(totalCredit)) {
      throw new UnbalancedEntryError(totalDebit.toNumber(), totalCredit.toNumber());
    }

    // Entries must have value
    if (totalDebit.isZero()) {
      throw new AccountingError('Journal entry cannot be zero value');
    }

    return { totalDebit, totalCredit };
  }

  /**
   * Validate accounts exist and are active
   */
  async validateAccounts(accountIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(accountIds)];

    const accounts = await prisma.chartOfAccounts.findMany({
      where: {
        id: { in: uniqueIds },
        isActive: true,
        isHeader: false, // Cannot post to header accounts
      },
      select: { id: true },
    });

    if (accounts.length !== uniqueIds.length) {
      const foundIds = accounts.map(a => a.id);
      const missingIds = uniqueIds.filter(id => !foundIds.includes(id));
      throw new AccountingError(`Invalid or inactive accounts: ${missingIds.join(', ')}`);
    }
  }

  /**
   * Create a journal entry with double-entry validation
   */
  async createJournalEntry(params: CreateJournalEntryParams): Promise<JournalEntryResult> {
    const {
      entryDate,
      valueDate = entryDate,
      entryType = JournalEntryType.STANDARD,
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
    await this.validatePeriodOpen(entryDate);

    // Validate entry balances
    const { totalDebit, totalCredit } = this.validateEntryBalance(lines);

    // Validate all accounts
    const accountIds = lines.map(l => l.accountId);
    await this.validateAccounts(accountIds);

    // Generate entry number
    const entryNumber = await generateReference('JOURNAL');

    // Create entry with lines in transaction
    const result = await withTransaction(async (tx) => {
      // Create journal entry header
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
      const linePromises = lines.map((line, index) =>
        tx.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            lineNumber: index + 1,
            accountId: line.accountId,
            debitAmount: line.debitAmount || 0,
            creditAmount: line.creditAmount || 0,
            description: line.description,
            customerId: line.customerId,
            referenceType: line.referenceType,
            referenceId: line.referenceId,
          },
        })
      );

      await Promise.all(linePromises);

      // If auto-posting, update account balances
      if (autoPost) {
        await this.updateAccountBalances(tx, lines);
      }

      return journalEntry;
    });

    // Log financial transaction
    financialLog('JOURNAL_ENTRY', {
      amount: totalDebit.toNumber(),
      reference: entryNumber,
      userId: createdById,
      description,
      metadata: {
        sourceModule,
        sourceType,
        sourceId,
        status: result.status,
      },
    });

    logger.info('Journal entry created', {
      entryNumber,
      totalDebit: totalDebit.toNumber(),
      autoPosted: autoPost,
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
   * Update account balances based on journal lines
   */
  private async updateAccountBalances(
    tx: Prisma.TransactionClient,
    lines: JournalLineInput[]
  ): Promise<void> {
    // Group lines by account
    const accountUpdates = new Map<string, { debit: Decimal; credit: Decimal }>();

    for (const line of lines) {
      const current = accountUpdates.get(line.accountId) || {
        debit: new Decimal(0),
        credit: new Decimal(0),
      };

      if (line.debitAmount) {
        current.debit = current.debit.plus(line.debitAmount);
      }
      if (line.creditAmount) {
        current.credit = current.credit.plus(line.creditAmount);
      }

      accountUpdates.set(line.accountId, current);
    }

    // Get account details for balance calculation
    const accounts = await tx.chartOfAccounts.findMany({
      where: { id: { in: Array.from(accountUpdates.keys()) } },
    });

    // Update each account
    for (const account of accounts) {
      const update = accountUpdates.get(account.id)!;

      // Calculate balance change based on normal balance
      // Assets & Expenses: Debit increases, Credit decreases
      // Liabilities, Equity, Income: Credit increases, Debit decreases
      let balanceChange: Decimal;

      if (account.normalBalance === BalanceType.DEBIT) {
        balanceChange = update.debit.minus(update.credit);
      } else {
        balanceChange = update.credit.minus(update.debit);
      }

      await tx.chartOfAccounts.update({
        where: { id: account.id },
        data: {
          currentBalance: {
            increment: balanceChange.toNumber(),
          },
        },
      });
    }
  }

  /**
   * Post a draft journal entry
   */
  async postJournalEntry(
    entryId: string,
    approvedById: string
  ): Promise<JournalEntryResult> {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true },
    });

    if (!entry) {
      throw new NotFoundError('Journal entry not found');
    }

    if (entry.status !== JournalStatus.DRAFT && entry.status !== JournalStatus.PENDING_APPROVAL) {
      throw new BusinessError(`Cannot post entry with status: ${entry.status}`);
    }

    // Validate period is still open
    await this.validatePeriodOpen(entry.entryDate);

    // Post entry in transaction
    await withTransaction(async (tx) => {
      await tx.journalEntry.update({
        where: { id: entryId },
        data: {
          status: JournalStatus.POSTED,
          approvedById,
          approvedAt: new Date(),
          postedAt: new Date(),
        },
      });

      // Convert lines to JournalLineInput format
      const lines: JournalLineInput[] = entry.lines.map(line => ({
        accountId: line.accountId,
        debitAmount: line.debitAmount.toNumber(),
        creditAmount: line.creditAmount.toNumber(),
        description: line.description ?? undefined,
        customerId: line.customerId ?? undefined,
        referenceType: line.referenceType ?? undefined,
        referenceId: line.referenceId ?? undefined,
      }));

      await this.updateAccountBalances(tx, lines);
    });

    logger.info('Journal entry posted', { entryNumber: entry.entryNumber, approvedById });

    return {
      id: entry.id,
      entryNumber: entry.entryNumber,
      totalDebit: entry.totalDebit.toNumber(),
      totalCredit: entry.totalCredit.toNumber(),
      status: JournalStatus.POSTED,
    };
  }

  /**
   * Reverse a posted journal entry (No edits allowed - only reversals)
   */
  async reverseJournalEntry(
    entryId: string,
    reason: string,
    reversedById: string,
    reversalDate?: Date
  ): Promise<JournalEntryResult> {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true },
    });

    if (!entry) {
      throw new NotFoundError('Journal entry not found');
    }

    if (entry.status !== JournalStatus.POSTED) {
      throw new BusinessError('Only posted entries can be reversed');
    }

    if (entry.isReversed) {
      throw new BusinessError('Entry has already been reversed');
    }

    const effectiveDate = reversalDate || new Date();
    await this.validatePeriodOpen(effectiveDate);

    // Create reversal entry with swapped debits/credits
    const reversalLines: JournalLineInput[] = entry.lines.map(line => ({
      accountId: line.accountId,
      debitAmount: line.creditAmount.toNumber(), // Swap
      creditAmount: line.debitAmount.toNumber(), // Swap
      description: `Reversal: ${line.description || ''}`,
      customerId: line.customerId ?? undefined,
      referenceType: line.referenceType ?? undefined,
      referenceId: line.referenceId ?? undefined,
    }));

    // Create reversal in transaction
    const reversal = await withTransaction(async (tx) => {
      // Mark original as reversed
      await tx.journalEntry.update({
        where: { id: entryId },
        data: {
          isReversed: true,
          reversedAt: effectiveDate,
          reversalReason: reason,
        },
      });

      // Create reversal entry
      const reversalEntry = await this.createJournalEntry({
        entryDate: effectiveDate,
        entryType: JournalEntryType.REVERSAL,
        description: `Reversal of ${entry.entryNumber}: ${reason}`,
        narration: entry.narration ?? undefined,
        sourceModule: entry.sourceModule ?? undefined,
        sourceType: 'REVERSAL',
        sourceId: entry.id,
        loanId: entry.loanId ?? undefined,
        savingsAccountId: entry.savingsAccountId ?? undefined,
        fixedDepositId: entry.fixedDepositId ?? undefined,
        branchId: entry.branchId ?? undefined,
        departmentId: entry.departmentId ?? undefined,
        lines: reversalLines,
        createdById: reversedById,
        autoPost: true,
      });

      // Link reversal to original
      await tx.journalEntry.update({
        where: { id: entryId },
        data: { reversalEntryId: reversalEntry.id },
      });

      return reversalEntry;
    });

    logger.info('Journal entry reversed', {
      originalEntry: entry.entryNumber,
      reversalEntry: reversal.entryNumber,
      reason,
    });

    return reversal;
  }

  /**
   * Get account balance as of a specific date
   */
  async getAccountBalance(accountId: string, asOfDate?: Date): Promise<{
    debitTotal: number;
    creditTotal: number;
    balance: number;
  }> {
    const account = await prisma.chartOfAccounts.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundError('Account not found');
    }

    const whereClause: Prisma.JournalEntryLineWhereInput = {
      accountId,
      journalEntry: {
        status: JournalStatus.POSTED,
        ...(asOfDate ? { entryDate: { lte: asOfDate } } : {}),
      },
    };

    const aggregates = await prisma.journalEntryLine.aggregate({
      where: whereClause,
      _sum: {
        debitAmount: true,
        creditAmount: true,
      },
    });

    const debitTotal = aggregates._sum.debitAmount?.toNumber() || 0;
    const creditTotal = aggregates._sum.creditAmount?.toNumber() || 0;

    // Calculate balance based on normal balance
    let balance: number;
    if (account.normalBalance === BalanceType.DEBIT) {
      balance = new Decimal(account.openingBalance.toNumber())
        .plus(debitTotal)
        .minus(creditTotal)
        .toNumber();
    } else {
      balance = new Decimal(account.openingBalance.toNumber())
        .plus(creditTotal)
        .minus(debitTotal)
        .toNumber();
    }

    return { debitTotal, creditTotal, balance };
  }

  /**
   * Generate Trial Balance
   */
  async generateTrialBalance(asOfDate?: Date): Promise<{
    accounts: Array<{
      accountCode: string;
      accountName: string;
      accountType: AccountType;
      debitBalance: number;
      creditBalance: number;
    }>;
    totals: { debit: number; credit: number };
  }> {
    const accounts = await prisma.chartOfAccounts.findMany({
      where: {
        isActive: true,
        isHeader: false,
      },
      orderBy: { accountCode: 'asc' },
    });

    const trialBalance = [];
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);

    for (const account of accounts) {
      const { balance } = await this.getAccountBalance(account.id, asOfDate);

      let debitBalance = 0;
      let creditBalance = 0;

      if (account.normalBalance === BalanceType.DEBIT) {
        if (balance >= 0) {
          debitBalance = balance;
        } else {
          creditBalance = Math.abs(balance);
        }
      } else {
        if (balance >= 0) {
          creditBalance = balance;
        } else {
          debitBalance = Math.abs(balance);
        }
      }

      // Only include accounts with balances
      if (debitBalance !== 0 || creditBalance !== 0) {
        trialBalance.push({
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType,
          debitBalance,
          creditBalance,
        });

        totalDebit = totalDebit.plus(debitBalance);
        totalCredit = totalCredit.plus(creditBalance);
      }
    }

    return {
      accounts: trialBalance,
      totals: {
        debit: totalDebit.toNumber(),
        credit: totalCredit.toNumber(),
      },
    };
  }

  /**
   * Get General Ledger for an account
   */
  async getGeneralLedger(
    accountId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    account: { code: string; name: string; type: AccountType };
    openingBalance: number;
    entries: Array<{
      date: Date;
      entryNumber: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
    }>;
    closingBalance: number;
  }> {
    const account = await prisma.chartOfAccounts.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundError('Account not found');
    }

    // Get opening balance (all entries before start date)
    const { balance: openingBalance } = await this.getAccountBalance(accountId, startDate);

    // Get entries within date range
    const lines = await prisma.journalEntryLine.findMany({
      where: {
        accountId,
        journalEntry: {
          status: JournalStatus.POSTED,
          entryDate: {
            gte: startDate,
            lte: endDate,
          },
        },
      },
      include: {
        journalEntry: {
          select: {
            entryNumber: true,
            entryDate: true,
            description: true,
          },
        },
      },
      orderBy: {
        journalEntry: {
          entryDate: 'asc',
        },
      },
    });

    let runningBalance = new Decimal(openingBalance);
    const entries = lines.map(line => {
      const debit = line.debitAmount.toNumber();
      const credit = line.creditAmount.toNumber();

      if (account.normalBalance === BalanceType.DEBIT) {
        runningBalance = runningBalance.plus(debit).minus(credit);
      } else {
        runningBalance = runningBalance.plus(credit).minus(debit);
      }

      return {
        date: line.journalEntry.entryDate,
        entryNumber: line.journalEntry.entryNumber,
        description: line.journalEntry.description,
        debit,
        credit,
        balance: runningBalance.toNumber(),
      };
    });

    return {
      account: {
        code: account.accountCode,
        name: account.accountName,
        type: account.accountType,
      },
      openingBalance,
      entries,
      closingBalance: runningBalance.toNumber(),
    };
  }

  /**
   * Close financial period (soft or hard)
   */
  async closePeriod(
    year: number,
    month: number,
    closeType: 'SOFT_CLOSE' | 'HARD_CLOSE',
    closedById: string,
    notes?: string
  ): Promise<void> {
    const { start, end } = getPeriodDateRange(year, month);

    // Check for unposted entries
    const unpostedCount = await prisma.journalEntry.count({
      where: {
        entryDate: { gte: start, lte: end },
        status: { in: [JournalStatus.DRAFT, JournalStatus.PENDING_APPROVAL] },
      },
    });

    if (unpostedCount > 0) {
      throw new BusinessError(
        `Cannot close period with ${unpostedCount} unposted journal entries`
      );
    }

    await prisma.financialPeriod.upsert({
      where: { year_month: { year, month } },
      update: {
        status: closeType === 'HARD_CLOSE' ? PeriodStatus.HARD_CLOSE : PeriodStatus.SOFT_CLOSE,
        closedById,
        closedAt: new Date(),
        closingNotes: notes,
      },
      create: {
        year,
        month,
        startDate: start,
        endDate: end,
        status: closeType === 'HARD_CLOSE' ? PeriodStatus.HARD_CLOSE : PeriodStatus.SOFT_CLOSE,
        closedById,
        closedAt: new Date(),
        closingNotes: notes,
      },
    });

    logger.info('Financial period closed', {
      year,
      month,
      closeType,
      closedById,
    });
  }
}

// Export singleton instance
export const accountingService = new AccountingService();
