'use server';

import Decimal from 'decimal.js';
import { prisma, withTransaction } from '@/lib/prisma';
import { requirePermission, requireAnyPermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { generateReference } from '@/lib/utils';
import { createJournalEntry, getAccountByCode } from '@/lib/accounting-engine';
import type { ActionResult } from '@/types';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const FD_GL = {
  CASH: '1110',
  FD_LIABILITY: '2120',       // Fixed Deposits Payable
  INTEREST_EXPENSE: '5320',   // Savings Interest Expense
};

export async function getFixedDeposits(filters?: {
  customerId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  await requirePermission('FIXED_DEPOSITS:READ');

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.status) where.status = filters.status;
  if (filters?.search) {
    where.OR = [
      { certificateNumber: { contains: filters.search, mode: 'insensitive' } },
      { customer: { firstName: { contains: filters.search, mode: 'insensitive' } } },
      { customer: { lastName: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.fixedDeposit.findMany({
      where: where as any,
      include: {
        customer: { select: { customerNumber: true, firstName: true, lastName: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.fixedDeposit.count({ where: where as any }),
  ]);

  return {
    data: data.map((fd) => ({
      ...fd,
      principalAmount: fd.principalAmount.toNumber(),
      interestRate: fd.interestRate.toNumber(),
      interestAmount: fd.interestAmount.toNumber(),
      maturityAmount: fd.maturityAmount.toNumber(),
      accruedInterest: fd.accruedInterest.toNumber(),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getFixedDeposit(id: string) {
  await requirePermission('FIXED_DEPOSITS:READ');

  const fd = await prisma.fixedDeposit.findUnique({
    where: { id },
    include: {
      customer: true,
      branch: true,
      createdBy: { select: { firstName: true, lastName: true } },
      interestPayments: { orderBy: { periodStart: 'desc' } },
    },
  });

  if (!fd) throw new Error('Fixed deposit not found');

  return {
    ...fd,
    principalAmount: fd.principalAmount.toNumber(),
    interestRate: fd.interestRate.toNumber(),
    interestAmount: fd.interestAmount.toNumber(),
    maturityAmount: fd.maturityAmount.toNumber(),
    accruedInterest: fd.accruedInterest.toNumber(),
    penaltyAmount: fd.penaltyAmount?.toNumber() || 0,
    amountPaid: fd.amountPaid?.toNumber() || 0,
    customer: { ...fd.customer, monthlyIncome: fd.customer.monthlyIncome?.toNumber() || 0 },
    interestPayments: fd.interestPayments.map((ip) => ({
      ...ip,
      interestAmount: ip.interestAmount.toNumber(),
    })),
  };
}

/**
 * Create fixed deposit - Posts GL: Dr Cash, Cr FD Liability
 */
export async function createFixedDeposit(data: {
  customerId: string;
  principalAmount: number;
  tenure: number; // days
  interestRate: number;
  fundingMode: string;
  fundingReference?: string;
  interestPayment?: string;
  maturityInstruction?: string;
  branchId?: string;
}): Promise<ActionResult<{ id: string; certificateNumber: string }>> {
  try {
    const user = await requirePermission('FIXED_DEPOSITS:CREATE');

    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer || customer.status !== 'ACTIVE') {
      return { success: false, error: 'Customer not found or not active' };
    }

    const startDate = new Date();
    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + data.tenure);

    // Calculate interest: P * R * T / 365 / 100
    const interestAmount = new Decimal(data.principalAmount)
      .times(data.interestRate)
      .times(data.tenure)
      .div(365)
      .div(100)
      .toDecimalPlaces(2)
      .toNumber();

    const maturityAmount = new Decimal(data.principalAmount).plus(interestAmount).toNumber();
    const certificateNumber = await generateReference('FIXED_DEPOSIT');

    const fd = await prisma.fixedDeposit.create({
      data: {
        certificateNumber,
        customerId: data.customerId,
        branchId: data.branchId || user.branchId,
        principalAmount: data.principalAmount,
        interestRate: data.interestRate,
        tenure: data.tenure,
        interestAmount,
        maturityAmount,
        interestPayment: (data.interestPayment || 'AT_MATURITY') as any,
        maturityInstruction: (data.maturityInstruction || 'ROLLOVER_PRINCIPAL_AND_INTEREST') as any,
        startDate,
        maturityDate,
        fundingMode: data.fundingMode as any,
        fundingReference: data.fundingReference,
        createdById: user.id,
      },
    });

    // Post GL: Dr Cash, Cr FD Liability
    const cashAccount = await getAccountByCode(FD_GL.CASH);
    const fdLiability = await getAccountByCode(FD_GL.FD_LIABILITY);

    if (cashAccount && fdLiability) {
      await createJournalEntry({
        entryDate: new Date(),
        description: `Fixed deposit creation: ${certificateNumber}`,
        sourceModule: 'FIXED_DEPOSITS',
        sourceType: 'CREATION',
        sourceId: fd.id,
        fixedDepositId: fd.id,
        lines: [
          { accountId: cashAccount.id, debitAmount: data.principalAmount, description: `FD funding - ${certificateNumber}` },
          { accountId: fdLiability.id, creditAmount: data.principalAmount, description: `FD liability - ${certificateNumber}`, customerId: data.customerId },
        ],
        createdById: user.id,
        autoPost: true,
      });
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'FIXED_DEPOSITS', entityType: 'FIXED_DEPOSIT', entityId: fd.id,
      description: `Created FD ${certificateNumber}: ${data.principalAmount} at ${data.interestRate}% for ${data.tenure} days`,
    });

    return { success: true, message: `FD ${certificateNumber} created`, data: { id: fd.id, certificateNumber } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Premature withdrawal - Posts GL with penalty
 */
export async function withdrawFixedDeposit(
  fdId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const user = await requirePermission('FIXED_DEPOSITS:LIQUIDATE');

    const fd = await prisma.fixedDeposit.findUnique({
      where: { id: fdId },
      include: { customer: true },
    });
    if (!fd) return { success: false, error: 'Fixed deposit not found' };
    if (fd.status !== 'ACTIVE') return { success: false, error: 'FD is not active' };

    // Calculate penalty (50% of earned interest)
    const daysHeld = Math.floor((new Date().getTime() - fd.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const earnedInterest = new Decimal(fd.principalAmount.toString())
      .times(fd.interestRate.toString())
      .times(daysHeld)
      .div(365)
      .div(100)
      .toDecimalPlaces(2);
    const penalty = earnedInterest.times(0.5).toDecimalPlaces(2);
    const amountPaid = new Decimal(fd.principalAmount.toString())
      .plus(earnedInterest)
      .minus(penalty)
      .toNumber();

    await prisma.fixedDeposit.update({
      where: { id: fdId },
      data: {
        status: 'PREMATURE_CLOSED',
        terminatedAt: new Date(),
        terminationReason: reason,
        penaltyAmount: penalty.toNumber(),
        amountPaid,
      },
    });

    // Post GL: Dr FD Liability + Dr Interest Expense, Cr Cash
    const cashAccount = await getAccountByCode(FD_GL.CASH);
    const fdLiability = await getAccountByCode(FD_GL.FD_LIABILITY);
    const interestExpense = await getAccountByCode(FD_GL.INTEREST_EXPENSE);

    if (cashAccount && fdLiability && interestExpense) {
      const netInterest = earnedInterest.minus(penalty).toNumber();
      await createJournalEntry({
        entryDate: new Date(),
        description: `FD premature withdrawal: ${fd.certificateNumber}`,
        sourceModule: 'FIXED_DEPOSITS',
        sourceType: 'WITHDRAWAL',
        sourceId: fdId,
        fixedDepositId: fdId,
        lines: [
          { accountId: fdLiability.id, debitAmount: fd.principalAmount.toNumber(), description: `FD closure - ${fd.certificateNumber}` },
          { accountId: interestExpense.id, debitAmount: netInterest > 0 ? netInterest : 0, description: `FD interest (net of penalty)` },
          { accountId: cashAccount.id, creditAmount: amountPaid, description: `FD payout - ${fd.certificateNumber}` },
        ],
        createdById: user.id,
        autoPost: true,
      });
    }

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'FIXED_DEPOSITS', entityType: 'FIXED_DEPOSIT', entityId: fdId,
      description: `Premature withdrawal of FD ${fd.certificateNumber}: paid ${amountPaid}, penalty ${penalty}`,
    });

    return { success: true, message: `FD withdrawn. Amount paid: ${amountPaid}, Penalty: ${penalty}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Liquidate a matured fixed deposit - Posts GL: Dr FD Liability + Dr Interest Expense, Cr Cash
 * Entry is always balanced: principal + interest = maturityAmount
 */
export async function matureFixedDeposit(fdId: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('FIXED_DEPOSITS:LIQUIDATE');

    const fd = await prisma.fixedDeposit.findUnique({
      where: { id: fdId },
      include: { customer: true },
    });
    if (!fd) return { success: false, error: 'Fixed deposit not found' };
    if (fd.status !== 'MATURED') return { success: false, error: 'FD has not matured yet' };

    const principalAmount = fd.principalAmount.toNumber();
    const interestAmount = fd.interestAmount.toNumber();
    const maturityAmount = fd.maturityAmount.toNumber();

    await prisma.fixedDeposit.update({
      where: { id: fdId },
      data: {
        status: 'WITHDRAWN',
        terminatedAt: new Date(),
        terminationReason: 'Maturity payout',
        penaltyAmount: 0,
        amountPaid: maturityAmount,
      },
    });

    // Post GL: Dr FD Liability (principal), Dr Interest Expense (interest), Cr Cash (full payout)
    // Balanced: principalAmount + interestAmount = maturityAmount
    const cashAccount = await getAccountByCode(FD_GL.CASH);
    const fdLiability = await getAccountByCode(FD_GL.FD_LIABILITY);
    const interestExpense = await getAccountByCode(FD_GL.INTEREST_EXPENSE);

    if (cashAccount && fdLiability && interestExpense) {
      await createJournalEntry({
        entryDate: new Date(),
        description: `FD maturity payout: ${fd.certificateNumber}`,
        sourceModule: 'FIXED_DEPOSITS',
        sourceType: 'MATURITY',
        sourceId: fdId,
        fixedDepositId: fdId,
        lines: [
          { accountId: fdLiability.id, debitAmount: principalAmount, description: `FD closure (principal) - ${fd.certificateNumber}` },
          { accountId: interestExpense.id, debitAmount: interestAmount, description: `FD interest payout - ${fd.certificateNumber}` },
          { accountId: cashAccount.id, creditAmount: maturityAmount, description: `FD maturity cash payout - ${fd.certificateNumber}`, customerId: fd.customerId },
        ],
        createdById: user.id,
        autoPost: true,
      });
    }

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'FIXED_DEPOSITS', entityType: 'FIXED_DEPOSIT', entityId: fdId,
      description: `Maturity payout of FD ${fd.certificateNumber}: ${maturityAmount} (principal ${principalAmount} + interest ${interestAmount})`,
    });

    return { success: true, message: `FD ${fd.certificateNumber} liquidated at maturity. Amount paid: ${maturityAmount}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getFixedDepositRates() {
  const rates = await prisma.fixedDepositRate.findMany({
    where: { isActive: true },
    orderBy: { minTenure: 'asc' },
  });

  return rates.map((r) => ({
    ...r,
    minAmount: r.minAmount.toNumber(),
    maxAmount: r.maxAmount?.toNumber() ?? null,
    interestRate: r.interestRate.toNumber(),
  }));
}
