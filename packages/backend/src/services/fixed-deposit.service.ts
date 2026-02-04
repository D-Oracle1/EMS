/**
 * Hylink EMS - Fixed Deposit Service
 * Handles fixed deposit lifecycle with interest accrual
 *
 * Status Lifecycle:
 * - Active: Deposit is running
 * - Matured: Reached maturity date
 * - Withdrawn: Prematurely closed
 * - Rolled Over: Renewed at maturity
 */

import { Prisma, FixedDepositStatus, InterestPaymentStatus, JournalEntryType, PaymentMode, MaturityInstruction } from '@prisma/client';
import Decimal from 'decimal.js';
import { addDays, differenceInDays, isBefore, isAfter, startOfDay } from 'date-fns';
import { prisma, withTransaction } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { accountingService } from './accounting.service.js';
import { generateReference, calculateFixedDepositInterest } from '../utils/helpers.js';
import {
  NotFoundError,
  BusinessError,
} from '../utils/errors.js';
import { PaginatedResult, PaginationParams } from '../types/index.js';

// Account codes for FD accounting
const FD_ACCOUNTS = {
  CASH_BANK: '1100', // Asset - Cash/Bank
  FD_LIABILITY: '2200', // Liability - Fixed Deposits
  INTEREST_PAYABLE: '2300', // Liability - Interest Payable
  INTEREST_EXPENSE: '5200', // Expense - Interest Expense
};

interface CreateFixedDepositInput {
  customerId: string;
  branchId?: string;
  principalAmount: number;
  tenure: number; // Days
  interestRate?: number; // Optional override
  fundingMode: PaymentMode;
  fundingReference?: string;
  interestPayment?: string;
  maturityInstruction?: MaturityInstruction;
  createdById: string;
}

interface FixedDepositFilters {
  customerId?: string;
  branchId?: string;
  status?: FixedDepositStatus;
  startDate?: Date;
  endDate?: Date;
  maturityStartDate?: Date;
  maturityEndDate?: Date;
  search?: string;
}

export class FixedDepositService {
  /**
   * Get applicable interest rate based on amount and tenure
   */
  private async getApplicableRate(amount: number, tenure: number): Promise<number> {
    const rate = await prisma.fixedDepositRate.findFirst({
      where: {
        isActive: true,
        minTenure: { lte: tenure },
        maxTenure: { gte: tenure },
        minAmount: { lte: amount },
        OR: [
          { maxAmount: null },
          { maxAmount: { gte: amount } },
        ],
        effectiveFrom: { lte: new Date() },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      orderBy: { interestRate: 'desc' },
    });

    if (!rate) {
      throw new BusinessError('No applicable interest rate found for this amount and tenure');
    }

    return rate.interestRate.toNumber();
  }

  /**
   * Create new fixed deposit
   */
  async createFixedDeposit(input: CreateFixedDepositInput): Promise<{
    id: string;
    certificateNumber: string;
    maturityDate: Date;
    interestAmount: number;
    maturityAmount: number;
  }> {
    const {
      customerId,
      branchId,
      principalAmount,
      tenure,
      interestRate,
      fundingMode,
      fundingReference,
      interestPayment = 'AT_MATURITY',
      maturityInstruction = MaturityInstruction.ROLLOVER_PRINCIPAL_AND_INTEREST,
      createdById,
    } = input;

    // Validate customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer || customer.status !== 'ACTIVE') {
      throw new NotFoundError('Active customer not found');
    }

    // Get interest rate if not provided
    const finalRate = interestRate ?? await this.getApplicableRate(principalAmount, tenure);

    // Calculate interest
    const { interestAmount, maturityAmount, dailyInterest } = calculateFixedDepositInterest(
      principalAmount,
      finalRate,
      tenure
    );

    // Calculate dates
    const startDate = new Date();
    const maturityDate = addDays(startDate, tenure);

    // Generate certificate number
    const certificateNumber = await generateReference('FIXED_DEPOSIT');

    // Get accounts for journal
    const cashBank = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: FD_ACCOUNTS.CASH_BANK },
    });

    const fdLiability = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: FD_ACCOUNTS.FD_LIABILITY },
    });

    if (!cashBank || !fdLiability) {
      throw new BusinessError('Required accounting accounts not configured');
    }

    const result = await withTransaction(async (tx) => {
      // Create fixed deposit
      const fd = await tx.fixedDeposit.create({
        data: {
          certificateNumber,
          customerId,
          branchId,
          principalAmount,
          interestRate: finalRate,
          tenure,
          interestAmount,
          maturityAmount,
          interestPayment: interestPayment as any,
          startDate,
          maturityDate,
          fundingMode,
          fundingReference,
          maturityInstruction,
          status: FixedDepositStatus.ACTIVE,
          createdById,
        },
      });

      // Create journal entry for deposit
      // Debit: Cash/Bank
      // Credit: FD Liability
      const journalEntry = await accountingService.createJournalEntry({
        entryDate: new Date(),
        entryType: JournalEntryType.STANDARD,
        description: `Fixed deposit creation - ${certificateNumber} - ${customer.firstName} ${customer.lastName}`,
        sourceModule: 'FIXED_DEPOSITS',
        sourceType: 'CREATION',
        sourceId: fd.id,
        fixedDepositId: fd.id,
        branchId: branchId ?? undefined,
        lines: [
          {
            accountId: cashBank!.id,
            debitAmount: principalAmount,
            description: 'Fixed deposit received',
          },
          {
            accountId: fdLiability!.id,
            creditAmount: principalAmount,
            description: 'Fixed deposit liability',
            customerId,
            referenceType: 'FIXED_DEPOSIT',
            referenceId: fd.id,
          },
        ],
        createdById,
        autoPost: true,
      });

      return { fd, journalEntry };
    });

    logger.info('Fixed deposit created', {
      certificateNumber,
      customerId,
      principalAmount,
      tenure,
      interestRate: finalRate,
    });

    return {
      id: result.fd.id,
      certificateNumber,
      maturityDate,
      interestAmount,
      maturityAmount,
    };
  }

  /**
   * Get fixed deposit by ID with full details
   */
  async getFixedDepositById(id: string): Promise<Prisma.FixedDepositGetPayload<{
    include: {
      customer: true;
      branch: true;
      createdBy: { select: { id: true; firstName: true; lastName: true } };
      interestPayments: true;
    };
  }> | null> {
    return prisma.fixedDeposit.findUnique({
      where: { id },
      include: {
        customer: true,
        branch: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        interestPayments: {
          orderBy: { periodEnd: 'desc' },
        },
      },
    });
  }

  /**
   * Get fixed deposits with filters
   */
  async getFixedDeposits(
    filters: FixedDepositFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Prisma.FixedDepositGetPayload<{
    include: {
      customer: { select: { firstName: true; lastName: true; customerNumber: true } };
    };
  }>>> {
    const { page, limit, sortBy = 'startDate', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.FixedDepositWhereInput = {};

    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.branchId) where.branchId = filters.branchId;
    if (filters.status) where.status = filters.status;

    if (filters.startDate && filters.endDate) {
      where.startDate = {
        gte: filters.startDate,
        lte: filters.endDate,
      };
    }

    if (filters.maturityStartDate && filters.maturityEndDate) {
      where.maturityDate = {
        gte: filters.maturityStartDate,
        lte: filters.maturityEndDate,
      };
    }

    if (filters.search) {
      where.OR = [
        { certificateNumber: { contains: filters.search, mode: 'insensitive' } },
        { customer: { firstName: { contains: filters.search, mode: 'insensitive' } } },
        { customer: { lastName: { contains: filters.search, mode: 'insensitive' } } },
        { customer: { customerNumber: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const [deposits, total] = await Promise.all([
      prisma.fixedDeposit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          customer: {
            select: { firstName: true, lastName: true, customerNumber: true },
          },
        },
      }),
      prisma.fixedDeposit.count({ where }),
    ]);

    return {
      data: deposits,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Accrue daily interest for all active FDs (batch job)
   */
  async accrueInterest(processDate: Date = new Date()): Promise<{
    processed: number;
    totalInterest: number;
  }> {
    const today = startOfDay(processDate);

    // Get all active FDs that haven't been accrued today
    const activeFDs = await prisma.fixedDeposit.findMany({
      where: {
        status: FixedDepositStatus.ACTIVE,
        OR: [
          { lastAccrualDate: null },
          { lastAccrualDate: { lt: today } },
        ],
      },
    });

    let totalInterest = new Decimal(0);
    let processed = 0;

    for (const fd of activeFDs) {
      const { dailyInterest } = calculateFixedDepositInterest(
        fd.principalAmount.toNumber(),
        fd.interestRate.toNumber(),
        fd.tenure
      );

      // Calculate days to accrue (from last accrual or start date to today)
      const lastDate = fd.lastAccrualDate || fd.startDate;
      const daysToAccrue = differenceInDays(today, lastDate);

      if (daysToAccrue <= 0) continue;

      const interestToAccrue = new Decimal(dailyInterest).times(daysToAccrue);

      await prisma.fixedDeposit.update({
        where: { id: fd.id },
        data: {
          accruedInterest: {
            increment: interestToAccrue.toNumber(),
          },
          lastAccrualDate: today,
        },
      });

      totalInterest = totalInterest.plus(interestToAccrue);
      processed++;
    }

    logger.info('Interest accrual completed', {
      processed,
      totalInterest: totalInterest.toNumber(),
      processDate: today,
    });

    return {
      processed,
      totalInterest: totalInterest.toNumber(),
    };
  }

  /**
   * Process matured fixed deposits (batch job)
   */
  async processMaturedDeposits(processDate: Date = new Date()): Promise<{
    processed: number;
    details: Array<{
      certificateNumber: string;
      action: string;
      amount: number;
    }>;
  }> {
    const today = startOfDay(processDate);

    // Get all matured FDs
    const maturedFDs = await prisma.fixedDeposit.findMany({
      where: {
        status: FixedDepositStatus.ACTIVE,
        maturityDate: { lte: today },
      },
      include: { customer: true },
    });

    const results: Array<{
      certificateNumber: string;
      action: string;
      amount: number;
    }> = [];

    for (const fd of maturedFDs) {
      const maturityAmount = fd.maturityAmount.toNumber();

      switch (fd.maturityInstruction) {
        case MaturityInstruction.ROLLOVER_PRINCIPAL_AND_INTEREST:
          // Create new FD with principal + interest
          const newFD = await this.createFixedDeposit({
            customerId: fd.customerId,
            branchId: fd.branchId ?? undefined,
            principalAmount: maturityAmount,
            tenure: fd.tenure,
            fundingMode: PaymentMode.BANK_TRANSFER,
            fundingReference: `Rollover from ${fd.certificateNumber}`,
            maturityInstruction: fd.maturityInstruction,
            createdById: fd.createdById,
          });

          await prisma.fixedDeposit.update({
            where: { id: fd.id },
            data: { status: FixedDepositStatus.ROLLED_OVER },
          });

          results.push({
            certificateNumber: fd.certificateNumber,
            action: 'ROLLED_OVER',
            amount: maturityAmount,
          });
          break;

        case MaturityInstruction.PAY_OUT:
        default:
          // Mark as matured - requires manual payout
          await prisma.fixedDeposit.update({
            where: { id: fd.id },
            data: { status: FixedDepositStatus.MATURED },
          });

          results.push({
            certificateNumber: fd.certificateNumber,
            action: 'MATURED',
            amount: maturityAmount,
          });
          break;
      }
    }

    logger.info('Maturity processing completed', {
      processed: maturedFDs.length,
      processDate: today,
    });

    return {
      processed: maturedFDs.length,
      details: results,
    };
  }

  /**
   * Premature withdrawal
   */
  async processWithdrawal(
    fdId: string,
    reason: string,
    processedById: string,
    penaltyRate: number = 2 // 2% penalty
  ): Promise<{
    principalReturned: number;
    interestPaid: number;
    penaltyDeducted: number;
    netAmount: number;
    journalEntryId: string;
  }> {
    const fd = await prisma.fixedDeposit.findUnique({
      where: { id: fdId },
      include: { customer: true },
    });

    if (!fd) {
      throw new NotFoundError('Fixed deposit not found');
    }

    if (fd.status !== FixedDepositStatus.ACTIVE) {
      throw new BusinessError(`Cannot withdraw FD with status: ${fd.status}`);
    }

    // Calculate actual interest earned
    const daysHeld = differenceInDays(new Date(), fd.startDate);
    const { interestAmount: earnedInterest } = calculateFixedDepositInterest(
      fd.principalAmount.toNumber(),
      fd.interestRate.toNumber(),
      daysHeld
    );

    // Calculate penalty
    const penalty = new Decimal(fd.principalAmount)
      .times(penaltyRate)
      .div(100)
      .toNumber();

    // Net interest after penalty
    const netInterest = Math.max(0, earnedInterest - penalty);
    const netAmount = fd.principalAmount.toNumber() + netInterest;

    // Get accounts
    const cashBank = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: FD_ACCOUNTS.CASH_BANK },
    });

    const fdLiability = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: FD_ACCOUNTS.FD_LIABILITY },
    });

    const interestExpense = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: FD_ACCOUNTS.INTEREST_EXPENSE },
    });

    if (!cashBank || !fdLiability || !interestExpense) {
      throw new BusinessError('Required accounting accounts not configured');
    }

    const result = await withTransaction(async (tx) => {
      // Create journal entry
      const lines = [
        {
          accountId: fdLiability!.id,
          debitAmount: fd.principalAmount.toNumber(),
          description: 'FD principal liability cleared',
          customerId: fd.customerId,
          referenceType: 'FIXED_DEPOSIT',
          referenceId: fd.id,
        },
        {
          accountId: cashBank!.id,
          creditAmount: netAmount,
          description: 'Premature withdrawal payout',
        },
      ];

      if (netInterest > 0) {
        lines.push({
          accountId: interestExpense!.id,
          debitAmount: netInterest,
          description: 'Interest paid on premature withdrawal',
        });
      }

      const journalEntry = await accountingService.createJournalEntry({
        entryDate: new Date(),
        entryType: JournalEntryType.STANDARD,
        description: `FD premature withdrawal - ${fd.certificateNumber} - ${fd.customer.firstName} ${fd.customer.lastName}`,
        sourceModule: 'FIXED_DEPOSITS',
        sourceType: 'PREMATURE_WITHDRAWAL',
        sourceId: fd.id,
        fixedDepositId: fd.id,
        branchId: fd.branchId ?? undefined,
        lines,
        createdById: processedById,
        autoPost: true,
      });

      // Update FD status
      await tx.fixedDeposit.update({
        where: { id: fdId },
        data: {
          status: FixedDepositStatus.PREMATURE_CLOSED,
          terminatedAt: new Date(),
          terminationReason: reason,
          penaltyAmount: penalty,
          amountPaid: netAmount,
        },
      });

      return journalEntry;
    });

    logger.info('FD premature withdrawal processed', {
      certificateNumber: fd.certificateNumber,
      netAmount,
      penalty,
    });

    return {
      principalReturned: fd.principalAmount.toNumber(),
      interestPaid: netInterest,
      penaltyDeducted: penalty,
      netAmount,
      journalEntryId: result.id,
    };
  }

  /**
   * Get FD summary for dashboard
   */
  async getFixedDepositSummary(branchId?: string): Promise<{
    totalDeposits: number;
    activeCount: number;
    totalPrincipal: number;
    totalInterestAccrued: number;
    maturingThisMonth: number;
    maturingThisMonthAmount: number;
  }> {
    const where: Prisma.FixedDepositWhereInput = {};
    if (branchId) {
      where.branchId = branchId;
    }

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    const [
      totalCount,
      activeCount,
      totals,
      maturingThisMonth,
    ] = await Promise.all([
      prisma.fixedDeposit.count({ where }),
      prisma.fixedDeposit.count({ where: { ...where, status: FixedDepositStatus.ACTIVE } }),
      prisma.fixedDeposit.aggregate({
        where: { ...where, status: FixedDepositStatus.ACTIVE },
        _sum: {
          principalAmount: true,
          accruedInterest: true,
        },
      }),
      prisma.fixedDeposit.aggregate({
        where: {
          ...where,
          status: FixedDepositStatus.ACTIVE,
          maturityDate: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        _count: { id: true },
        _sum: { maturityAmount: true },
      }),
    ]);

    return {
      totalDeposits: totalCount,
      activeCount,
      totalPrincipal: totals._sum.principalAmount?.toNumber() || 0,
      totalInterestAccrued: totals._sum.accruedInterest?.toNumber() || 0,
      maturingThisMonth: maturingThisMonth._count.id,
      maturingThisMonthAmount: maturingThisMonth._sum.maturityAmount?.toNumber() || 0,
    };
  }
}

export const fixedDepositService = new FixedDepositService();
