'use server';

/**
 * Fixed-Term Savings Engine — Server Actions
 * Hylink Finance Limited EMS
 */

import Decimal from 'decimal.js';
import { prisma, withTransaction } from '@/lib/prisma';
import { requirePermission, requireAnyPermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { generateReference } from '@/lib/utils';
import { createJournalEntry, getAccountByCode } from '@/lib/accounting-engine';
import {
  runMonthlySavingsInterest as engineRunMonthlyInterest,
  processMaturedAccounts as engineProcessMatured,
} from '@/lib/savings-interest-engine';
import type { ActionResult } from '@/types';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// GL account codes
const GL = {
  CASH: '1110',
  SAVINGS_LIABILITY: '2110',
  INTEREST_EXPENSE: '5210',
  INTEREST_PAYABLE: '2120',
  PENALTY_INCOME: '4120',
};

// ============================================================================
// PART 1 — FINANCIAL PRODUCT SETTINGS ENGINE
// ============================================================================

export async function getFixedSavingsProducts(includeInactive = false) {
  await requireAnyPermission(['SAVINGS:READ', 'SAVINGS:CREATE', 'SETTINGS:READ']);

  const where: any = { durationMonths: { not: null } };
  if (!includeInactive) where.isActive = true;

  const products = await prisma.savingsProduct.findMany({
    where,
    include: { _count: { select: { accounts: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return products.map((p: any) => ({
    ...p,
    minBalance: p.minBalance.toNumber(),
    maxBalance: p.maxBalance?.toNumber() ?? null,
    minDeposit: p.minDeposit.toNumber(),
    interestRate: p.interestRate.toNumber(),
    monthlyFee: p.monthlyFee.toNumber(),
    transactionFee: p.transactionFee.toNumber(),
    totalInterestRate: p.totalInterestRate?.toNumber() ?? null,
    monthlyInterestRate: p.monthlyInterestRate?.toNumber() ?? null,
    defaultTerminationPenaltyRate: p.defaultTerminationPenaltyRate?.toNumber() ?? null,
    usageCount: p._count.accounts,
  }));
}

export async function createFixedSavingsProduct(data: {
  name: string;
  description?: string;
  durationMonths: number;
  totalInterestRate: number;
  minimumDeposit: number;
  maximumDeposit?: number;
  interestCalculationMethod?: 'MATURITY_ONLY' | 'MONTHLY_ALLOCATION' | 'FLAT' | 'COMPOUND';
  interestEligibilityDelayMonths?: number;
  allowEarlyTermination?: boolean;
  defaultTerminationPenaltyRate?: number;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('SETTINGS:MANAGE');

    if (data.durationMonths < 1 || data.durationMonths > 120) {
      return { success: false, error: 'Duration must be between 1 and 120 months' };
    }
    if (data.totalInterestRate <= 0 || data.totalInterestRate > 100) {
      return { success: false, error: 'Total interest rate must be between 0 and 100' };
    }
    if (data.minimumDeposit < 0) {
      return { success: false, error: 'Minimum deposit cannot be negative' };
    }
    if (data.maximumDeposit !== undefined && data.maximumDeposit < data.minimumDeposit) {
      return { success: false, error: 'Maximum deposit must be greater than minimum deposit' };
    }

    const monthlyInterestRate = new Decimal(data.totalInterestRate)
      .div(data.durationMonths)
      .toDecimalPlaces(6)
      .toNumber();

    const code = `FS-${Date.now()}`;

    const product = await prisma.savingsProduct.create({
      data: {
        code,
        name: data.name,
        description: data.description,
        savingsType: 'FIXED',
        durationMonths: data.durationMonths,
        totalInterestRate: data.totalInterestRate,
        monthlyInterestRate,
        interestCalculationMethod: data.interestCalculationMethod ?? 'MATURITY_ONLY',
        interestEligibilityDelayMonths: data.interestEligibilityDelayMonths ?? 0,
        allowEarlyTermination: data.allowEarlyTermination ?? false,
        defaultTerminationPenaltyRate: data.defaultTerminationPenaltyRate,
        minDeposit: data.minimumDeposit,
        minBalance: data.minimumDeposit,
        maxBalance: data.maximumDeposit,
        interestRate: monthlyInterestRate,
        allowWithdrawal: false,
        isActive: true,
        createdById: user.id,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'SETTINGS',
      entityType: 'SAVINGS_PRODUCT',
      entityId: product.id,
      description: `Created fixed savings product: ${data.name} (${data.durationMonths}m @ ${data.totalInterestRate}%)`,
    });

    return { success: true, message: `Product "${data.name}" created successfully`, data: { id: product.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateFixedSavingsProduct(
  id: string,
  data: {
    name?: string;
    description?: string;
    durationMonths?: number;
    totalInterestRate?: number;
    minimumDeposit?: number;
    maximumDeposit?: number;
    interestCalculationMethod?: 'MATURITY_ONLY' | 'MONTHLY_ALLOCATION' | 'FLAT' | 'COMPOUND';
    interestEligibilityDelayMonths?: number;
    allowEarlyTermination?: boolean;
    defaultTerminationPenaltyRate?: number;
  }
): Promise<ActionResult> {
  try {
    const user = await requirePermission('SETTINGS:MANAGE');

    const product: any = await prisma.savingsProduct.findUnique({
      where: { id },
      include: { _count: { select: { accounts: true } } },
    });
    if (!product) return { success: false, error: 'Product not found' };
    if (product._count.accounts > 0) {
      return { success: false, error: 'Cannot edit a product that is in use by existing accounts' };
    }

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.interestCalculationMethod !== undefined) updates.interestCalculationMethod = data.interestCalculationMethod;
    if (data.interestEligibilityDelayMonths !== undefined) updates.interestEligibilityDelayMonths = data.interestEligibilityDelayMonths;
    if (data.allowEarlyTermination !== undefined) updates.allowEarlyTermination = data.allowEarlyTermination;
    if (data.defaultTerminationPenaltyRate !== undefined) updates.defaultTerminationPenaltyRate = data.defaultTerminationPenaltyRate;
    if (data.minimumDeposit !== undefined) { updates.minDeposit = data.minimumDeposit; updates.minBalance = data.minimumDeposit; }
    if (data.maximumDeposit !== undefined) updates.maxBalance = data.maximumDeposit;

    const newDuration = data.durationMonths ?? product.durationMonths;
    const newTotal = data.totalInterestRate ?? product.totalInterestRate?.toNumber();
    if (data.durationMonths !== undefined || data.totalInterestRate !== undefined) {
      if (!newDuration || !newTotal) return { success: false, error: 'Invalid rate or duration' };
      const monthlyRate = new Decimal(newTotal).div(newDuration).toDecimalPlaces(6).toNumber();
      updates.durationMonths = newDuration;
      updates.totalInterestRate = newTotal;
      updates.monthlyInterestRate = monthlyRate;
      updates.interestRate = monthlyRate;
    }

    await prisma.savingsProduct.update({ where: { id }, data: updates });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'SETTINGS', entityType: 'SAVINGS_PRODUCT', entityId: id,
      description: `Updated fixed savings product: ${product.name}`,
    });

    return { success: true, message: 'Product updated successfully' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deactivateFixedSavingsProduct(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('SETTINGS:MANAGE');

    const product = await prisma.savingsProduct.findUnique({ where: { id } });
    if (!product) return { success: false, error: 'Product not found' };
    if (!product.isActive) return { success: false, error: 'Product is already inactive' };

    await prisma.savingsProduct.update({ where: { id }, data: { isActive: false } });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'SETTINGS', entityType: 'SAVINGS_PRODUCT', entityId: id,
      description: `Deactivated savings product: ${product.name}`,
    });

    return { success: true, message: `Product "${product.name}" deactivated` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// PART 2 — SAVINGS ENGINE
// ============================================================================

export async function createFixedSavingsAccount(data: {
  customerId: string;
  productId: string;
  initialDeposit: number;
  branchId?: string;
  startDate?: string;
}): Promise<ActionResult<{ id: string; accountNumber: string }>> {
  try {
    const user = await requirePermission('SAVINGS:CREATE');

    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer || customer.status !== 'ACTIVE') {
      return { success: false, error: 'Customer not found or not active' };
    }

    const product: any = await prisma.savingsProduct.findUnique({ where: { id: data.productId } });
    if (!product || !product.isActive || !product.durationMonths) {
      return { success: false, error: 'Fixed savings product not found, inactive, or not a fixed-term product' };
    }

    const minDep = product.minDeposit.toNumber();
    if (data.initialDeposit < minDep) return { success: false, error: `Minimum deposit is ₦${minDep.toLocaleString()}` };
    const maxDep = product.maxBalance?.toNumber();
    if (maxDep && data.initialDeposit > maxDep) return { success: false, error: `Maximum deposit is ₦${maxDep.toLocaleString()}` };

    const startDate = data.startDate ? new Date(data.startDate) : new Date();
    const maturityDate = new Date(startDate);
    maturityDate.setMonth(maturityDate.getMonth() + product.durationMonths);

    const accountNumber = await generateReference('SAVINGS_ACCOUNT');
    const transactionRef = await generateReference('SAVINGS_TXN');

    const account = await withTransaction(async (tx: any) => {
      const acc = await tx.savingsAccount.create({
        data: {
          accountNumber,
          customerId: data.customerId,
          productId: data.productId,
          branchId: data.branchId || user.branchId,
          currentBalance: data.initialDeposit,
          availableBalance: data.initialDeposit,
          pendingDeposits: data.initialDeposit,  // Opening balance rule
          totalDeposits: data.initialDeposit,
          eligibleBalance: 0,
          startDate,
          maturityDate,
          monthsCompleted: 0,
          monthsRemaining: product.durationMonths,
          status: 'ACTIVE',
          createdById: user.id,
        },
      });

      await tx.savingsTransaction.create({
        data: {
          accountId: acc.id,
          transactionRef,
          transactionType: 'DEPOSIT',
          amount: data.initialDeposit,
          balanceBefore: 0,
          balanceAfter: data.initialDeposit,
          paymentMode: 'CASH',
          narration: 'Initial deposit — fixed savings opening',
          processedById: user.id,
        },
      });

      return acc;
    });

    const cashAcc = await getAccountByCode(GL.CASH);
    const savingsLiab = await getAccountByCode(GL.SAVINGS_LIABILITY);
    if (cashAcc && savingsLiab) {
      await createJournalEntry({
        entryDate: startDate,
        description: `Fixed savings opening: ${accountNumber}`,
        sourceModule: 'SAVINGS',
        sourceType: 'DEPOSIT',
        sourceId: account.id,
        savingsAccountId: account.id,
        lines: [
          { accountId: cashAcc.id, debitAmount: data.initialDeposit, description: `Opening deposit - ${accountNumber}` },
          { accountId: savingsLiab.id, creditAmount: data.initialDeposit, description: `Fixed savings liability - ${accountNumber}`, customerId: data.customerId },
        ],
        createdById: user.id,
        autoPost: true,
      });
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'SAVINGS', entityType: 'SAVINGS_ACCOUNT', entityId: account.id,
      description: `Created fixed savings account ${accountNumber} for ${customer.firstName} ${customer.lastName}, matures ${maturityDate.toDateString()}`,
    });

    return {
      success: true,
      message: `Fixed savings account ${accountNumber} created. Matures: ${maturityDate.toLocaleDateString()}`,
      data: { id: account.id, accountNumber },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Deposit into a fixed savings account.
 * Opening Balance Rule: new deposits go to pendingDeposits, NOT eligibleBalance.
 */
export async function fixedSavingsDeposit(data: {
  accountId: string;
  amount: number;
  paymentMode?: string;
  paymentReference?: string;
  narration?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['SAVINGS:DEPOSIT', 'SAVINGS:CREATE']);

    const account: any = await prisma.savingsAccount.findUnique({
      where: { id: data.accountId },
      include: { product: true, customer: true },
    });
    if (!account) return { success: false, error: 'Account not found' };
    if (account.status !== 'ACTIVE') {
      return { success: false, error: `Account is ${account.status}. Only ACTIVE accounts accept deposits.` };
    }
    if (!account.maturityDate) return { success: false, error: 'This is not a fixed-term savings account' };

    const minDep = account.product.minDeposit.toNumber();
    if (data.amount < minDep) return { success: false, error: `Minimum deposit is ₦${minDep.toLocaleString()}` };
    const maxBal = account.product.maxBalance?.toNumber();
    const newTotal = new Decimal(account.totalDeposits.toString()).plus(data.amount);
    if (maxBal && newTotal.gt(maxBal)) {
      return { success: false, error: `This deposit would exceed the maximum allowed of ₦${maxBal.toLocaleString()}` };
    }

    const transactionRef = await generateReference('SAVINGS_TXN');
    const balanceBefore = account.currentBalance.toNumber();
    const balanceAfter = new Decimal(balanceBefore).plus(data.amount).toNumber();

    await withTransaction(async (tx: any) => {
      await tx.savingsTransaction.create({
        data: {
          accountId: data.accountId,
          transactionRef,
          transactionType: 'DEPOSIT',
          amount: data.amount,
          balanceBefore,
          balanceAfter,
          paymentMode: data.paymentMode || 'CASH',
          paymentReference: data.paymentReference,
          narration: data.narration || 'Savings deposit',
          processedById: user.id,
        },
      });

      // Opening Balance Rule: deposits go to pendingDeposits only
      await tx.savingsAccount.update({
        where: { id: data.accountId },
        data: {
          currentBalance: balanceAfter,
          availableBalance: balanceAfter,
          pendingDeposits: { increment: data.amount },
          totalDeposits: { increment: data.amount },
          lastTransactionAt: new Date(),
        },
      });
    });

    const cashAcc = await getAccountByCode(GL.CASH);
    const savingsLiab = await getAccountByCode(GL.SAVINGS_LIABILITY);
    if (cashAcc && savingsLiab) {
      await createJournalEntry({
        entryDate: new Date(),
        description: `Fixed savings deposit: ${account.accountNumber} - ${transactionRef}`,
        sourceModule: 'SAVINGS',
        sourceType: 'DEPOSIT',
        sourceId: data.accountId,
        savingsAccountId: data.accountId,
        lines: [
          { accountId: cashAcc.id, debitAmount: data.amount, description: `Deposit - ${account.accountNumber}` },
          { accountId: savingsLiab.id, creditAmount: data.amount, description: `Savings deposit - ${account.accountNumber}`, customerId: account.customerId },
        ],
        createdById: user.id,
        autoPost: true,
      });
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'SAVINGS', entityType: 'SAVINGS_TRANSACTION', entityId: data.accountId,
      description: `Fixed savings deposit ${transactionRef}: ₦${data.amount} to ${account.accountNumber} (pending until next month roll)`,
    });

    return { success: true, message: `Deposit of ₦${data.amount.toLocaleString()} recorded. Ref: ${transactionRef}. Balance eligible from next month.` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getFixedSavingsAccounts(filters?: {
  customerId?: string;
  productId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  await requireAnyPermission(['SAVINGS:READ', 'SAVINGS:CREATE']);

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = { maturityDate: { not: null } };
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.productId) where.productId = filters.productId;
  if (filters?.status) where.status = filters.status;
  if (filters?.search) {
    where.OR = [
      { accountNumber: { contains: filters.search, mode: 'insensitive' } },
      { customer: { firstName: { contains: filters.search, mode: 'insensitive' } } },
      { customer: { lastName: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }

  const [data, total]: [any[], number] = await Promise.all([
    prisma.savingsAccount.findMany({
      where,
      include: {
        customer: { select: { customerNumber: true, firstName: true, lastName: true, phone: true } },
        product: { select: { name: true, code: true, durationMonths: true, totalInterestRate: true, monthlyInterestRate: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.savingsAccount.count({ where }),
  ]);

  return {
    data: data.map((s: any) => ({
      ...s,
      currentBalance: s.currentBalance.toNumber(),
      availableBalance: s.availableBalance.toNumber(),
      holdAmount: s.holdAmount.toNumber(),
      interestAccrued: s.interestAccrued.toNumber(),
      eligibleBalance: s.eligibleBalance?.toNumber() ?? 0,
      pendingDeposits: s.pendingDeposits?.toNumber() ?? 0,
      totalDeposits: s.totalDeposits?.toNumber() ?? 0,
      product: {
        ...s.product,
        totalInterestRate: s.product.totalInterestRate?.toNumber() ?? null,
        monthlyInterestRate: s.product.monthlyInterestRate?.toNumber() ?? null,
      },
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getFixedSavingsAccount(id: string) {
  await requirePermission('SAVINGS:READ');

  const account: any = await prisma.savingsAccount.findUnique({
    where: { id },
    include: {
      customer: true,
      product: true,
      transactions: { orderBy: { processedAt: 'desc' }, take: 50 },
      terminations: {
        include: {
          requestedBy: { select: { firstName: true, lastName: true, employeeId: true } },
          approvedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { requestDate: 'desc' },
      },
    },
  });

  if (!account) throw new Error('Savings account not found');

  const today = new Date();
  const monthsRemaining = account.maturityDate
    ? Math.max(0, Math.ceil((new Date(account.maturityDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : 0;

  const monthlyRate = account.product.monthlyInterestRate?.toNumber() ?? 0;
  const eligibleBal = account.eligibleBalance?.toNumber() ?? 0;
  const projectedFutureInterest = new Decimal(eligibleBal)
    .times(monthlyRate).div(100).times(monthsRemaining).toDecimalPlaces(2).toNumber();

  const totalDep = account.totalDeposits?.toNumber() ?? 0;
  const projectedMaturityValue = new Decimal(totalDep)
    .plus(account.interestAccrued?.toNumber() ?? 0)
    .plus(projectedFutureInterest)
    .toDecimalPlaces(2).toNumber();

  return {
    ...account,
    currentBalance: account.currentBalance.toNumber(),
    availableBalance: account.availableBalance.toNumber(),
    holdAmount: account.holdAmount.toNumber(),
    interestAccrued: account.interestAccrued.toNumber(),
    eligibleBalance: eligibleBal,
    pendingDeposits: account.pendingDeposits?.toNumber() ?? 0,
    totalDeposits: totalDep,
    customer: { ...account.customer, monthlyIncome: account.customer.monthlyIncome?.toNumber() || 0 },
    product: {
      ...account.product,
      minBalance: account.product.minBalance.toNumber(),
      maxBalance: account.product.maxBalance?.toNumber() ?? null,
      minDeposit: account.product.minDeposit.toNumber(),
      interestRate: account.product.interestRate.toNumber(),
      monthlyFee: account.product.monthlyFee.toNumber(),
      transactionFee: account.product.transactionFee.toNumber(),
      totalInterestRate: account.product.totalInterestRate?.toNumber() ?? null,
      monthlyInterestRate: account.product.monthlyInterestRate?.toNumber() ?? null,
      defaultTerminationPenaltyRate: account.product.defaultTerminationPenaltyRate?.toNumber() ?? null,
    },
    transactions: account.transactions.map((t: any) => ({
      ...t,
      amount: t.amount.toNumber(),
      balanceBefore: t.balanceBefore.toNumber(),
      balanceAfter: t.balanceAfter.toNumber(),
    })),
    terminations: (account.terminations ?? []).map((t: any) => ({
      ...t,
      principalAmount: t.principalAmount.toNumber(),
      accruedInterest: t.accruedInterest.toNumber(),
      approvedInterest: t.approvedInterest?.toNumber() ?? null,
      penaltyAmount: t.penaltyAmount?.toNumber() ?? null,
      payoutAmount: t.payoutAmount?.toNumber() ?? null,
    })),
    monthsRemaining,
    projectedFutureInterest,
    projectedMaturityValue,
  };
}

// ============================================================================
// MONTHLY INTEREST ENGINE
// ============================================================================

/**
 * Run monthly savings interest for all active fixed-term accounts.
 * Interest = eligibleBalance × (monthlyInterestRate / 100)
 * Roll: eligibleBalance += pendingDeposits; pendingDeposits = 0
 * GL: Dr Interest Expense, Cr Interest Payable
 */
export async function runMonthlySavingsInterest(): Promise<ActionResult<{ processed: number; totalInterest: number }>> {
  try {
    await requireAnyPermission(['SAVINGS:MANAGE', 'SETTINGS:MANAGE']);
    const result = await engineRunMonthlyInterest();
    return {
      success: true,
      message: `Monthly interest processed for ${result.processed} account(s) (${result.skipped} skipped). Total: ₦${result.totalInterest.toLocaleString()}`,
      data: { processed: result.processed, totalInterest: result.totalInterest },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Process matured savings accounts.
 * Payout = totalDeposits + interestAccrued
 * GL: Dr Savings Liability + Dr Interest Payable, Cr Cash
 */
export async function processMaturedAccounts(): Promise<ActionResult<{ matured: number }>> {
  try {
    await requireAnyPermission(['SAVINGS:MANAGE', 'SETTINGS:MANAGE']);
    const result = await engineProcessMatured();
    return {
      success: true,
      message: `${result.matured} account(s) maturity-processed`,
      data: { matured: result.matured },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// PART 3 — EARLY TERMINATION SYSTEM
// ============================================================================

export async function requestEarlyTermination(accountId: string): Promise<ActionResult<{ terminationId: string }>> {
  try {
    const user = await requireAnyPermission(['SAVINGS:DEPOSIT', 'SAVINGS:READ']);

    const account: any = await prisma.savingsAccount.findUnique({
      where: { id: accountId },
      include: { product: true, customer: true },
    });
    if (!account) return { success: false, error: 'Account not found' };
    if (account.status !== 'ACTIVE') return { success: false, error: `Account is ${account.status} and cannot be terminated` };
    if (!account.maturityDate) return { success: false, error: 'Only fixed-term savings accounts can be terminated' };
    if (!account.product.allowEarlyTermination) return { success: false, error: 'Early termination is not allowed for this product' };

    const existingPending = await prisma.savingsTermination.findFirst({
      where: { accountId, status: 'PENDING' },
    });
    if (existingPending) return { success: false, error: 'A termination request is already pending for this account' };

    const requestNumber = await generateReference('SAVINGS_TXN');

    const termination = await withTransaction(async (tx: any) => {
      const term = await tx.savingsTermination.create({
        data: {
          requestNumber,
          accountId,
          requestedById: user.id,
          principalAmount: account.totalDeposits?.toNumber() ?? account.currentBalance.toNumber(),
          accruedInterest: account.interestAccrued.toNumber(),
          status: 'PENDING',
        },
      });
      await tx.savingsAccount.update({ where: { id: accountId }, data: { status: 'TERMINATION_REQUESTED' } });
      return term;
    });

    const approvers = await prisma.staff.findMany({
      where: { status: 'ACTIVE', role: { permissions: { some: { permission: { code: 'SAVINGS:APPROVE' } } } } },
      select: { id: true },
    });

    for (const approver of approvers) {
      await createNotification({
        userId: approver.id,
        type: 'WARNING',
        title: 'Early Termination Request',
        message: `Customer ${account.customer.firstName} ${account.customer.lastName} requested early termination of ${account.accountNumber}`,
        entityType: 'SAVINGS_TERMINATION',
        entityId: termination.id,
        actionUrl: '/savings/terminations',
      });
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'SAVINGS', entityType: 'SAVINGS_TERMINATION', entityId: termination.id,
      description: `Early termination requested for account ${account.accountNumber}`,
    });

    return { success: true, message: 'Termination request submitted for admin approval', data: { terminationId: termination.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getTerminationRequests(filters?: { status?: string; page?: number; limit?: number }) {
  await requireAnyPermission(['SAVINGS:APPROVE', 'SAVINGS:READ']);

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (filters?.status && filters.status !== 'ALL') where.status = filters.status;

  const [data, total]: [any[], number] = await Promise.all([
    prisma.savingsTermination.findMany({
      where,
      include: {
        account: {
          select: {
            accountNumber: true,
            totalDeposits: true,
            interestAccrued: true,
            startDate: true,
            maturityDate: true,
            product: { select: { name: true, durationMonths: true, defaultTerminationPenaltyRate: true } },
            customer: { select: { customerNumber: true, firstName: true, lastName: true, phone: true } },
          },
        },
        requestedBy: { select: { firstName: true, lastName: true, employeeId: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { requestDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.savingsTermination.count({ where }),
  ]);

  const today = new Date();
  return {
    data: data.map((t: any) => {
      const monthsCompleted = t.account.startDate
        ? Math.floor((today.getTime() - new Date(t.account.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30))
        : 0;
      return {
        ...t,
        principalAmount: t.principalAmount.toNumber(),
        accruedInterest: t.accruedInterest.toNumber(),
        approvedInterest: t.approvedInterest?.toNumber() ?? null,
        penaltyAmount: t.penaltyAmount?.toNumber() ?? null,
        payoutAmount: t.payoutAmount?.toNumber() ?? null,
        account: {
          ...t.account,
          totalDeposits: t.account.totalDeposits?.toNumber() ?? 0,
          interestAccrued: t.account.interestAccrued.toNumber(),
          product: {
            ...t.account.product,
            defaultTerminationPenaltyRate: t.account.product.defaultTerminationPenaltyRate?.toNumber() ?? null,
          },
          monthsCompleted,
        },
      };
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function decideTermination(data: {
  terminationId: string;
  decision: 'APPROVED' | 'REJECTED';
  approvedInterest?: number;
  penaltyAmount?: number;
  notes?: string;
  rejectionReason?: string;
}): Promise<ActionResult> {
  try {
    const user = await requirePermission('SAVINGS:APPROVE');

    const termination: any = await prisma.savingsTermination.findUnique({
      where: { id: data.terminationId },
      include: { account: { include: { product: true, customer: true } } },
    });
    if (!termination) return { success: false, error: 'Termination request not found' };
    if (termination.status !== 'PENDING') return { success: false, error: 'Request is not in PENDING status' };
    if (termination.requestedById === user.id) return { success: false, error: 'You cannot approve your own termination request' };

    if (data.decision === 'REJECTED') {
      await withTransaction(async (tx: any) => {
        await tx.savingsTermination.update({
          where: { id: data.terminationId },
          data: { status: 'REJECTED', approvedById: user.id, approvedAt: new Date(), rejectionReason: data.rejectionReason || 'Rejected by admin', notes: data.notes },
        });
        await tx.savingsAccount.update({ where: { id: termination.accountId }, data: { status: 'ACTIVE' } });
      });

      await auditLog({
        userId: user.id, action: 'UPDATE', module: 'SAVINGS', entityType: 'SAVINGS_TERMINATION', entityId: data.terminationId,
        description: `Rejected termination for ${termination.account.accountNumber}. Reason: ${data.rejectionReason}`,
      });

      return { success: true, message: 'Termination rejected. Account restored to ACTIVE.' };
    }

    const approvedInterest = data.approvedInterest ?? termination.accruedInterest.toNumber();
    const penalty = data.penaltyAmount ?? 0;
    const payout = new Decimal(termination.principalAmount.toString())
      .plus(approvedInterest).minus(penalty).toDecimalPlaces(2).toNumber();

    if (payout < 0) return { success: false, error: 'Calculated payout is negative. Review penalty amount.' };

    await prisma.savingsTermination.update({
      where: { id: data.terminationId },
      data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date(), approvedInterest, penaltyAmount: penalty, payoutAmount: payout, notes: data.notes },
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'SAVINGS', entityType: 'SAVINGS_TERMINATION', entityId: data.terminationId,
      description: `Approved termination for ${termination.account.accountNumber}. Payout: ₦${payout}`,
      metadata: { approvedInterest, penaltyAmount: penalty, payoutAmount: payout },
    });

    return { success: true, message: `Termination approved. Payout: ₦${payout.toLocaleString()}. Proceed to execute payout.` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function processTerminationPayout(terminationId: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('SAVINGS:APPROVE');

    const termination: any = await prisma.savingsTermination.findUnique({
      where: { id: terminationId },
      include: { account: { include: { product: true, customer: true } } },
    });
    if (!termination) return { success: false, error: 'Termination not found' };
    if (termination.status !== 'APPROVED') return { success: false, error: 'Termination must be APPROVED before payout' };
    if (!termination.payoutAmount) return { success: false, error: 'Payout amount not set. Re-approve with payout details.' };

    const transactionRef = await generateReference('SAVINGS_TXN');
    const payout = termination.payoutAmount.toNumber();
    const principal = termination.principalAmount.toNumber();
    const approvedInterest = termination.approvedInterest?.toNumber() ?? 0;
    const penalty = termination.penaltyAmount?.toNumber() ?? 0;

    await withTransaction(async (tx: any) => {
      await tx.savingsTransaction.create({
        data: {
          accountId: termination.accountId,
          transactionRef,
          transactionType: 'TERMINATION_PAYOUT',
          amount: payout,
          balanceBefore: termination.account.currentBalance.toNumber(),
          balanceAfter: 0,
          paymentMode: 'BANK_TRANSFER',
          narration: `Early termination payout: Principal ₦${principal} + Interest ₦${approvedInterest} - Penalty ₦${penalty}`,
          processedById: user.id,
        },
      });
      await tx.savingsTermination.update({ where: { id: terminationId }, data: { status: 'PAID' } });
      await tx.savingsAccount.update({
        where: { id: termination.accountId },
        data: { status: 'TERMINATED', currentBalance: 0, availableBalance: 0, closedAt: new Date() },
      });
    });

    const cashAcc = await getAccountByCode(GL.CASH);
    const savingsLiab = await getAccountByCode(GL.SAVINGS_LIABILITY);
    const interestPayAcc = await getAccountByCode(GL.INTEREST_PAYABLE);
    const penaltyIncAcc = await getAccountByCode(GL.PENALTY_INCOME);

    if (cashAcc && savingsLiab) {
      const lines: any[] = [
        { accountId: savingsLiab.id, debitAmount: principal, description: `Termination principal - ${termination.account.accountNumber}`, customerId: termination.account.customerId },
      ];
      if (approvedInterest > 0 && interestPayAcc) {
        lines.push({ accountId: interestPayAcc.id, debitAmount: approvedInterest, description: `Termination interest - ${termination.account.accountNumber}`, customerId: termination.account.customerId });
      }
      lines.push({ accountId: cashAcc.id, creditAmount: payout, description: `Termination payout - ${termination.account.accountNumber}` });
      if (penalty > 0 && penaltyIncAcc) {
        lines.push({ accountId: penaltyIncAcc.id, creditAmount: penalty, description: `Early termination penalty - ${termination.account.accountNumber}` });
      }

      await createJournalEntry({
        entryDate: new Date(),
        description: `Early termination payout: ${termination.account.accountNumber}`,
        sourceModule: 'SAVINGS',
        sourceType: 'TERMINATION_PAYOUT',
        sourceId: termination.accountId,
        savingsAccountId: termination.accountId,
        lines,
        createdById: user.id,
        autoPost: true,
      });
    }

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'SAVINGS', entityType: 'SAVINGS_TERMINATION', entityId: terminationId,
      description: `Termination payout ${transactionRef}: ₦${payout} for ${termination.account.accountNumber}`,
      metadata: { principal, approvedInterest, penalty, payout, transactionRef },
    });

    return { success: true, message: `Payout of ₦${payout.toLocaleString()} processed. Ref: ${transactionRef}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// DASHBOARD STATS
// ============================================================================

export async function getFixedSavingsDashboard() {
  await requireAnyPermission(['SAVINGS:READ', 'SAVINGS:CREATE']);

  const [active, terminated, completed, termRequested, pendingTerminations, totalStats] = await Promise.all([
    prisma.savingsAccount.count({ where: { maturityDate: { not: null }, status: 'ACTIVE' } }),
    prisma.savingsAccount.count({ where: { maturityDate: { not: null }, status: 'TERMINATED' } }),
    prisma.savingsAccount.count({ where: { maturityDate: { not: null }, status: 'COMPLETED' } }),
    prisma.savingsAccount.count({ where: { maturityDate: { not: null }, status: 'TERMINATION_REQUESTED' } }),
    prisma.savingsTermination.count({ where: { status: 'PENDING' } }),
    prisma.savingsAccount.aggregate({
      where: { maturityDate: { not: null }, status: { in: ['ACTIVE', 'TERMINATION_REQUESTED'] } },
      _sum: { totalDeposits: true, interestAccrued: true, eligibleBalance: true },
    }),
  ]);

  return {
    activeAccounts: active,
    terminatedAccounts: terminated,
    completedAccounts: completed,
    terminationRequested: termRequested,
    pendingTerminations,
    totalDeposits: totalStats._sum.totalDeposits?.toNumber() ?? 0,
    totalAccruedInterest: totalStats._sum.interestAccrued?.toNumber() ?? 0,
    totalEligibleBalance: totalStats._sum.eligibleBalance?.toNumber() ?? 0,
  };
}

// ============================================================================
// SEED DATA
// ============================================================================

export async function seedFixedSavingsProducts(): Promise<ActionResult> {
  try {
    const user = await requirePermission('SETTINGS:MANAGE');

    const products = [
      { code: 'FS-4M-5PCT', name: '4 Month Plan', description: '4-month fixed savings with 5% total interest', durationMonths: 4, totalInterestRate: 5, minimumDeposit: 10000, maximumDeposit: 5000000, allowEarlyTermination: true, defaultTerminationPenaltyRate: 2 },
      { code: 'FS-8M-11PCT', name: '8 Month Plan', description: '8-month fixed savings with 11% total interest', durationMonths: 8, totalInterestRate: 11, minimumDeposit: 25000, maximumDeposit: 10000000, allowEarlyTermination: true, defaultTerminationPenaltyRate: 3 },
      { code: 'FS-12M-17PCT', name: '12 Month Plan', description: '12-month fixed savings with 17% total interest', durationMonths: 12, totalInterestRate: 17, minimumDeposit: 50000, maximumDeposit: 50000000, allowEarlyTermination: true, defaultTerminationPenaltyRate: 5 },
    ];

    for (const p of products) {
      const monthlyRate = new Decimal(p.totalInterestRate).div(p.durationMonths).toDecimalPlaces(6).toNumber();
      await prisma.savingsProduct.upsert({
        where: { code: p.code },
        update: {},
        create: {
          code: p.code, name: p.name, description: p.description, savingsType: 'FIXED',
          durationMonths: p.durationMonths, totalInterestRate: p.totalInterestRate, monthlyInterestRate: monthlyRate,
          allowEarlyTermination: p.allowEarlyTermination, defaultTerminationPenaltyRate: p.defaultTerminationPenaltyRate,
          minDeposit: p.minimumDeposit, minBalance: p.minimumDeposit, maxBalance: p.maximumDeposit,
          interestRate: monthlyRate, allowWithdrawal: false, isActive: true, createdById: user.id,
        },
      });
    }

    return { success: true, message: '3 fixed savings products seeded (4M @5%, 8M @11%, 12M @17%)' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// HELPER
// ============================================================================

