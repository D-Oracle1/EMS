'use server';

import Decimal from 'decimal.js';
import { prisma, withTransaction } from '@/lib/prisma';
import { requirePermission, requireAnyPermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { generateReference } from '@/lib/utils';
import { createJournalEntry, getAccountByCode } from '@/lib/accounting-engine';
import { createCustomerInTx, validateNewCustomer, type NewCustomerInput } from '@/lib/customer-registration';
import { notifyCustomerByEmail } from '@/lib/email';
import type { ActionResult } from '@/types';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const SAVINGS_GL = {
  CASH: '1110',
  SAVINGS_LIABILITY: '2110',
};

export async function getSavingsAccounts(filters?: {
  customerId?: string;
  status?: string;
  productId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}) {
  await requireAnyPermission(['SAVINGS:READ', 'SAVINGS:CREATE']);

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.status) where.status = filters.status;
  if (filters?.productId) where.productId = filters.productId;
  if (filters?.dateFrom || filters?.dateTo) {
    where.openedAt = {};
    if (filters?.dateFrom) (where.openedAt as any).gte = new Date(filters.dateFrom);
    if (filters?.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      (where.openedAt as any).lte = to;
    }
  }
  if (filters?.search) {
    where.OR = [
      { accountNumber: { contains: filters.search, mode: 'insensitive' } },
      { customer: { firstName: { contains: filters.search, mode: 'insensitive' } } },
      { customer: { lastName: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.savingsAccount.findMany({
      where: where as any,
      include: {
        customer: { select: { customerNumber: true, firstName: true, lastName: true } },
        product: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.savingsAccount.count({ where: where as any }),
  ]);

  return {
    data: data.map((s) => ({
      ...s,
      currentBalance: s.currentBalance.toNumber(),
      availableBalance: s.availableBalance.toNumber(),
      holdAmount: s.holdAmount.toNumber(),
      targetAmount: s.targetAmount?.toNumber() ?? null,
      interestAccrued: s.interestAccrued.toNumber(),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getSavingsAccount(id: string) {
  await requirePermission('SAVINGS:READ');

  const account = await prisma.savingsAccount.findUnique({
    where: { id },
    include: {
      customer: true,
      product: true,
      transactions: { orderBy: { processedAt: 'desc' }, take: 50 },
      withdrawalRequests: {
        where: { status: { in: ['PENDING', 'APPROVED'] } },
        include: {
          requestedBy: { select: { firstName: true, lastName: true } },
          approvedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { requestedAt: 'desc' },
      },
    },
  });

  if (!account) throw new Error('Savings account not found');

  return {
    ...account,
    currentBalance: account.currentBalance.toNumber(),
    availableBalance: account.availableBalance.toNumber(),
    holdAmount: account.holdAmount.toNumber(),
    targetAmount: account.targetAmount?.toNumber() ?? null,
    interestAccrued: account.interestAccrued.toNumber(),
    customer: { ...account.customer, monthlyIncome: account.customer.monthlyIncome?.toNumber() || 0 },
    product: {
      ...account.product,
      minBalance: account.product.minBalance.toNumber(),
      maxBalance: account.product.maxBalance?.toNumber() ?? null,
      minDeposit: account.product.minDeposit.toNumber(),
      maxDailyWithdrawal: account.product.maxDailyWithdrawal?.toNumber() ?? null,
      interestRate: account.product.interestRate.toNumber(),
      monthlyFee: account.product.monthlyFee.toNumber(),
      transactionFee: account.product.transactionFee.toNumber(),
    },
    transactions: account.transactions.map((t) => ({
      ...t,
      amount: t.amount.toNumber(),
      balanceBefore: t.balanceBefore.toNumber(),
      balanceAfter: t.balanceAfter.toNumber(),
    })),
    withdrawalRequests: account.withdrawalRequests.map((wr) => ({
      ...wr,
      amount: wr.amount.toNumber(),
    })),
  };
}

export async function createSavingsAccount(data: {
  customerId?: string;
  newCustomer?: NewCustomerInput;
  productId: string;
  targetAmount?: number;
  targetDate?: string;
  branchId?: string;
}): Promise<ActionResult<{ id: string; accountNumber: string }>> {
  try {
    const user = await requirePermission('SAVINGS:CREATE');

    // Resolve customer: existing, or auto-register a new one.
    const registerNew = !data.customerId && !!data.newCustomer;
    let customerId = data.customerId?.trim() || '';
    let customerName: string;
    const branchId = data.branchId || user.branchId;

    if (registerNew) {
      const err = validateNewCustomer(data.newCustomer!);
      if (err) return { success: false, error: err };
      if (!branchId) return { success: false, error: 'No branch assigned. Cannot register a new customer.' };
      customerName = `${data.newCustomer!.firstName.trim()} ${data.newCustomer!.lastName.trim()}`;
    } else {
      if (!customerId) return { success: false, error: 'Please select an existing customer or enter new customer details' };
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer || customer.status !== 'ACTIVE') {
        return { success: false, error: 'Customer not found or not active' };
      }
      customerName = `${customer.firstName} ${customer.lastName}`;
    }

    const product = await prisma.savingsProduct.findUnique({ where: { id: data.productId } });
    if (!product || !product.isActive) {
      return { success: false, error: 'Savings product not found or inactive' };
    }

    const accountNumber = await generateReference('SAVINGS_ACCOUNT');
    const newCustomerNumber = registerNew ? await generateReference('CUSTOMER') : null;

    const account = await withTransaction(async (tx) => {
      if (registerNew) {
        const created = await createCustomerInTx(tx, data.newCustomer!, {
          customerNumber: newCustomerNumber!,
          branchId: branchId as string,
          createdBy: user.id,
        });
        customerId = created.id;
      }
      return tx.savingsAccount.create({
        data: {
          accountNumber,
          customerId,
          productId: data.productId,
          branchId: branchId || undefined,
          targetAmount: data.targetAmount,
          targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
        },
      });
    });

    if (registerNew && newCustomerNumber) {
      await auditLog({
        userId: user.id, action: 'CREATE', module: 'CUSTOMERS', entityType: 'CUSTOMER', entityId: customerId,
        description: `Registered customer ${newCustomerNumber}: ${customerName} (from savings account ${accountNumber})`,
      });
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'SAVINGS', entityType: 'SAVINGS_ACCOUNT', entityId: account.id,
      description: `Created savings account ${accountNumber} for ${customerName}`,
    });

    await notifyCustomerByEmail(
      customerId,
      `Savings account ${accountNumber} opened`,
      `Your savings account ${accountNumber} has been successfully opened. Thank you for banking with Hylink Finance.`
    );

    return { success: true, message: `Account ${accountNumber} created`, data: { id: account.id, accountNumber } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Process deposit - Posts GL: Dr Cash, Cr Savings Liability
 */
export async function processDeposit(data: {
  accountId: string;
  amount: number;
  paymentMode: string;
  paymentReference?: string;
  narration?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW']);

    const account = await prisma.savingsAccount.findUnique({
      where: { id: data.accountId },
      include: { product: true, customer: true },
    });
    if (!account) return { success: false, error: 'Account not found' };
    if (account.status !== 'ACTIVE') return { success: false, error: 'Account is not active' };

    if (data.amount < account.product.minDeposit.toNumber()) {
      return { success: false, error: `Minimum deposit is ${account.product.minDeposit}` };
    }

    const transactionRef = await generateReference('SAVINGS_TXN');
    const balanceBefore = account.currentBalance.toNumber();
    const balanceAfter = new Decimal(balanceBefore).plus(data.amount).toNumber();

    await withTransaction(async (tx) => {
      await tx.savingsTransaction.create({
        data: {
          accountId: data.accountId,
          transactionRef,
          transactionType: 'DEPOSIT',
          amount: data.amount,
          balanceBefore,
          balanceAfter,
          paymentMode: data.paymentMode as any,
          paymentReference: data.paymentReference,
          narration: data.narration || 'Cash deposit',
          processedById: user.id,
        },
      });

      await tx.savingsAccount.update({
        where: { id: data.accountId },
        data: {
          currentBalance: balanceAfter,
          availableBalance: balanceAfter,
          lastTransactionAt: new Date(),
        },
      });
    });

    // Post GL: Dr Cash, Cr Savings Liability
    const cashAccount = await getAccountByCode(SAVINGS_GL.CASH);
    const savingsLiability = await getAccountByCode(SAVINGS_GL.SAVINGS_LIABILITY);

    if (cashAccount && savingsLiability) {
      await createJournalEntry({
        entryDate: new Date(),
        description: `Savings deposit: ${account.accountNumber} - ${transactionRef}`,
        sourceModule: 'SAVINGS',
        sourceType: 'DEPOSIT',
        sourceId: data.accountId,
        savingsAccountId: data.accountId,
        lines: [
          { accountId: cashAccount.id, debitAmount: data.amount, description: `Cash deposit - ${account.accountNumber}` },
          { accountId: savingsLiability.id, creditAmount: data.amount, description: `Savings deposit - ${account.accountNumber}`, customerId: account.customerId },
        ],
        createdById: user.id,
        autoPost: true,
      });
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'SAVINGS', entityType: 'SAVINGS_TRANSACTION', entityId: data.accountId,
      description: `Deposit ${transactionRef}: ${data.amount} to ${account.accountNumber}`,
    });

    return { success: true, message: `Deposit of ${data.amount} successful. Ref: ${transactionRef}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Process withdrawal - Posts GL: Dr Savings Liability, Cr Cash
 */
export async function processWithdrawal(data: {
  accountId: string;
  amount: number;
  paymentMode: string;
  paymentReference?: string;
  narration?: string;
}): Promise<ActionResult> {
  try {
    const user = await requirePermission('SAVINGS:WITHDRAW');

    const account = await prisma.savingsAccount.findUnique({
      where: { id: data.accountId },
      include: { product: true, customer: true },
    });
    if (!account) return { success: false, error: 'Account not found' };
    if (account.status !== 'ACTIVE') return { success: false, error: 'Account is not active' };

    // Check withdrawal allowed
    if (!account.product.allowWithdrawal) {
      return { success: false, error: 'Withdrawals not allowed on this account type' };
    }

    // Check minimum balance
    const balanceAfterWithdrawal = new Decimal(account.currentBalance.toString()).minus(data.amount);
    if (balanceAfterWithdrawal.lt(account.product.minBalance.toString())) {
      return { success: false, error: `Withdrawal would breach minimum balance of ${account.product.minBalance}` };
    }

    // Check daily withdrawal limit
    if (account.product.maxDailyWithdrawal) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayWithdrawals = await prisma.savingsTransaction.aggregate({
        where: {
          accountId: data.accountId,
          transactionType: 'WITHDRAWAL',
          processedAt: { gte: today },
        },
        _sum: { amount: true },
      });
      const totalToday = new Decimal(todayWithdrawals._sum.amount?.toString() || '0').plus(data.amount);
      if (totalToday.gt(account.product.maxDailyWithdrawal.toString())) {
        return { success: false, error: `Daily withdrawal limit of ${account.product.maxDailyWithdrawal} exceeded` };
      }
    }

    const transactionRef = await generateReference('SAVINGS_TXN');
    const balanceBefore = account.currentBalance.toNumber();
    const balanceAfter = balanceAfterWithdrawal.toNumber();

    await withTransaction(async (tx) => {
      await tx.savingsTransaction.create({
        data: {
          accountId: data.accountId,
          transactionRef,
          transactionType: 'WITHDRAWAL',
          amount: data.amount,
          balanceBefore,
          balanceAfter,
          paymentMode: data.paymentMode as any,
          paymentReference: data.paymentReference,
          narration: data.narration || 'Cash withdrawal',
          processedById: user.id,
        },
      });

      await tx.savingsAccount.update({
        where: { id: data.accountId },
        data: {
          currentBalance: balanceAfter,
          availableBalance: balanceAfter,
          lastTransactionAt: new Date(),
        },
      });
    });

    // Post GL: Dr Savings Liability, Cr Cash
    const cashAccount = await getAccountByCode(SAVINGS_GL.CASH);
    const savingsLiability = await getAccountByCode(SAVINGS_GL.SAVINGS_LIABILITY);

    if (cashAccount && savingsLiability) {
      await createJournalEntry({
        entryDate: new Date(),
        description: `Savings withdrawal: ${account.accountNumber} - ${transactionRef}`,
        sourceModule: 'SAVINGS',
        sourceType: 'WITHDRAWAL',
        sourceId: data.accountId,
        savingsAccountId: data.accountId,
        lines: [
          { accountId: savingsLiability.id, debitAmount: data.amount, description: `Withdrawal - ${account.accountNumber}`, customerId: account.customerId },
          { accountId: cashAccount.id, creditAmount: data.amount, description: `Cash withdrawal - ${account.accountNumber}` },
        ],
        createdById: user.id,
        autoPost: true,
      });
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'SAVINGS', entityType: 'SAVINGS_TRANSACTION', entityId: data.accountId,
      description: `Withdrawal ${transactionRef}: ${data.amount} from ${account.accountNumber}`,
    });

    return { success: true, message: `Withdrawal of ${data.amount} successful. Ref: ${transactionRef}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getSavingsProducts() {
  const products = await prisma.savingsProduct.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  return products.map((p) => ({
    ...p,
    minBalance: p.minBalance.toNumber(),
    maxBalance: p.maxBalance?.toNumber() ?? null,
    minDeposit: p.minDeposit.toNumber(),
    maxDailyWithdrawal: p.maxDailyWithdrawal?.toNumber() ?? null,
    interestRate: p.interestRate.toNumber(),
    monthlyFee: p.monthlyFee.toNumber(),
    transactionFee: p.transactionFee.toNumber(),
  }));
}

// ---------------------------------------------------------------------------
// Withdrawal Approval Workflow
// ---------------------------------------------------------------------------

/**
 * Request a withdrawal. If amount is within product daily limit, auto-approve
 * and process immediately. Otherwise, submit for manager approval.
 */
export async function requestWithdrawal(data: {
  accountId: string;
  amount: number;
  paymentMode: string;
  paymentReference?: string;
  reason?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW']);

    const account = await prisma.savingsAccount.findUnique({
      where: { id: data.accountId },
      include: { product: true, customer: true },
    });
    if (!account) return { success: false, error: 'Account not found' };
    if (account.status !== 'ACTIVE') return { success: false, error: 'Account is not active' };
    if (!account.product.allowWithdrawal) {
      return { success: false, error: 'Withdrawals not allowed on this account type' };
    }

    // Check minimum balance
    const balanceAfter = new Decimal(account.currentBalance.toString()).minus(data.amount);
    if (balanceAfter.lt(account.product.minBalance.toString())) {
      return { success: false, error: `Withdrawal would breach minimum balance of ${account.product.minBalance}` };
    }

    // Check if amount requires approval (exceeds daily limit or no limit set but over 50k)
    const approvalThreshold = account.product.maxDailyWithdrawal
      ? account.product.maxDailyWithdrawal.toNumber()
      : 50000;
    const needsApproval = data.amount > approvalThreshold;

    if (!needsApproval) {
      // Auto-process: check daily limit and execute immediately
      return processWithdrawal({
        accountId: data.accountId,
        amount: data.amount,
        paymentMode: data.paymentMode,
        paymentReference: data.paymentReference,
        narration: data.reason || 'Cash withdrawal',
      });
    }

    // Create withdrawal request for approval
    const requestNumber = await generateReference('WITHDRAWAL_REQ');

    await prisma.withdrawalRequest.create({
      data: {
        requestNumber,
        accountId: data.accountId,
        amount: data.amount,
        reason: data.reason,
        paymentMode: data.paymentMode as any,
        paymentReference: data.paymentReference,
        requestedById: user.id,
      },
    });

    // Place hold on available balance
    await prisma.savingsAccount.update({
      where: { id: data.accountId },
      data: {
        holdAmount: { increment: data.amount },
        availableBalance: { decrement: data.amount },
      },
    });

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'SAVINGS',
      entityType: 'WITHDRAWAL_REQUEST', entityId: data.accountId,
      description: `Withdrawal request ${requestNumber}: ${data.amount} from ${account.accountNumber} (pending approval)`,
    });

    // Notify managers with SAVINGS:APPROVE permission
    const approvers = await prisma.staff.findMany({
      where: {
        status: 'ACTIVE',
        role: { permissions: { some: { permission: { code: 'SAVINGS:APPROVE' } } } },
      },
      select: { id: true },
    });

    for (const approver of approvers) {
      await createNotification({
        userId: approver.id,
        type: 'WARNING',
        title: 'Withdrawal Approval Required',
        message: `Withdrawal of ${data.amount} from account ${account.accountNumber} requires your approval`,
        entityType: 'WITHDRAWAL_REQUEST',
        entityId: data.accountId,
        actionUrl: '/savings/withdrawals',
      });
    }

    return { success: true, message: `Withdrawal request ${requestNumber} submitted for approval` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get pending withdrawal requests for approvers.
 */
export async function getPendingWithdrawals(filters?: {
  status?: string;
  accountId?: string;
  page?: number;
  limit?: number;
}) {
  await requireAnyPermission(['SAVINGS:WITHDRAW', 'SAVINGS:APPROVE', 'SAVINGS:READ']);

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters?.status) where.status = filters.status;
  else where.status = 'PENDING'; // Default to pending
  if (filters?.accountId) where.accountId = filters.accountId;

  const [data, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where: where as any,
      include: {
        account: {
          select: {
            accountNumber: true,
            currentBalance: true,
            customer: { select: { customerNumber: true, firstName: true, lastName: true } },
          },
        },
        requestedBy: { select: { firstName: true, lastName: true, employeeId: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { requestedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.withdrawalRequest.count({ where: where as any }),
  ]);

  return {
    data: data.map((r) => ({
      ...r,
      amount: r.amount.toNumber(),
      account: {
        ...r.account,
        currentBalance: r.account.currentBalance.toNumber(),
      },
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Approve or reject a withdrawal request.
 * On approval, executes the withdrawal with GL posting.
 */
export async function processWithdrawalRequest(data: {
  requestId: string;
  decision: 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['SAVINGS:APPROVE', 'SAVINGS:WITHDRAW']);

    const request = await prisma.withdrawalRequest.findUnique({
      where: { id: data.requestId },
      include: {
        account: { include: { product: true, customer: true } },
      },
    });
    if (!request) return { success: false, error: 'Request not found' };
    if (request.status !== 'PENDING') return { success: false, error: 'Request is not pending' };

    // Segregation of duties: requester cannot approve their own request
    if (request.requestedById === user.id) {
      return { success: false, error: 'You cannot approve your own withdrawal request' };
    }

    if (data.decision === 'REJECTED') {
      // Release hold
      await prisma.$transaction([
        prisma.withdrawalRequest.update({
          where: { id: data.requestId },
          data: {
            status: 'REJECTED',
            approvedById: user.id,
            approvedAt: new Date(),
            rejectionReason: data.rejectionReason || 'Rejected',
          },
        }),
        prisma.savingsAccount.update({
          where: { id: request.accountId },
          data: {
            holdAmount: { decrement: request.amount },
            availableBalance: { increment: request.amount },
          },
        }),
      ]);

      // Notify requester
      await createNotification({
        userId: request.requestedById,
        type: 'WARNING',
        title: 'Withdrawal Rejected',
        message: `Withdrawal of ${request.amount} from ${request.account.accountNumber} was rejected. Reason: ${data.rejectionReason || 'N/A'}`,
        entityType: 'SAVINGS_ACCOUNT',
        entityId: request.accountId,
        actionUrl: `/savings/${request.accountId}`,
      });

      await auditLog({
        userId: user.id, action: 'UPDATE', module: 'SAVINGS',
        entityType: 'WITHDRAWAL_REQUEST', entityId: data.requestId,
        description: `Rejected withdrawal ${request.requestNumber}: ${data.rejectionReason}`,
      });

      return { success: true, message: 'Withdrawal rejected' };
    }

    // APPROVED: Execute the withdrawal
    const account = request.account;
    const balanceBefore = account.currentBalance.toNumber();
    const balanceAfterAmount = new Decimal(balanceBefore).minus(request.amount.toNumber()).toNumber();

    const transactionRef = await generateReference('SAVINGS_TXN');

    await withTransaction(async (tx) => {
      const txn = await tx.savingsTransaction.create({
        data: {
          accountId: request.accountId,
          transactionRef,
          transactionType: 'WITHDRAWAL',
          amount: request.amount,
          balanceBefore,
          balanceAfter: balanceAfterAmount,
          paymentMode: request.paymentMode as any,
          paymentReference: request.paymentReference,
          narration: `Approved withdrawal - ${request.requestNumber}`,
          processedById: user.id,
        },
      });

      await tx.savingsAccount.update({
        where: { id: request.accountId },
        data: {
          currentBalance: balanceAfterAmount,
          availableBalance: balanceAfterAmount,
          holdAmount: { decrement: request.amount },
          lastTransactionAt: new Date(),
        },
      });

      await tx.withdrawalRequest.update({
        where: { id: data.requestId },
        data: {
          status: 'PROCESSED',
          approvedById: user.id,
          approvedAt: new Date(),
          transactionId: txn.id,
        },
      });
    });

    // Post GL: Dr Savings Liability, Cr Cash
    const cashAccount = await getAccountByCode(SAVINGS_GL.CASH);
    const savingsLiability = await getAccountByCode(SAVINGS_GL.SAVINGS_LIABILITY);

    if (cashAccount && savingsLiability) {
      await createJournalEntry({
        entryDate: new Date(),
        description: `Approved withdrawal: ${account.accountNumber} - ${transactionRef}`,
        sourceModule: 'SAVINGS',
        sourceType: 'WITHDRAWAL',
        sourceId: request.accountId,
        savingsAccountId: request.accountId,
        lines: [
          { accountId: savingsLiability.id, debitAmount: request.amount.toNumber(), description: `Withdrawal - ${account.accountNumber}`, customerId: account.customerId },
          { accountId: cashAccount.id, creditAmount: request.amount.toNumber(), description: `Cash withdrawal - ${account.accountNumber}` },
        ],
        createdById: user.id,
        autoPost: true,
      });
    }

    // Notify requester
    await createNotification({
      userId: request.requestedById,
      type: 'INFO',
      title: 'Withdrawal Approved',
      message: `Withdrawal of ${request.amount} from ${account.accountNumber} has been approved and processed`,
      entityType: 'SAVINGS_ACCOUNT',
      entityId: request.accountId,
      actionUrl: `/savings/${request.accountId}`,
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'SAVINGS',
      entityType: 'WITHDRAWAL_REQUEST', entityId: data.requestId,
      description: `Approved and processed withdrawal ${request.requestNumber}: ${request.amount} from ${account.accountNumber}`,
    });

    return { success: true, message: `Withdrawal approved and processed. Ref: ${transactionRef}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get savings dashboard stats for today's activity.
 */
export async function getSavingsDashboardStats() {
  await requireAnyPermission(['SAVINGS:READ', 'SAVINGS:CREATE', 'SAVINGS:DEPOSIT']);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [deposits, withdrawals, pendingRequests, activeAccounts] = await Promise.all([
    prisma.savingsTransaction.aggregate({
      where: { transactionType: 'DEPOSIT', processedAt: { gte: today } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.savingsTransaction.aggregate({
      where: { transactionType: 'WITHDRAWAL', processedAt: { gte: today } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.withdrawalRequest.count({ where: { status: 'PENDING' } }),
    prisma.savingsAccount.count({ where: { status: 'ACTIVE' } }),
  ]);

  return {
    todayDeposits: {
      count: deposits._count,
      total: deposits._sum.amount?.toNumber() || 0,
    },
    todayWithdrawals: {
      count: withdrawals._count,
      total: withdrawals._sum.amount?.toNumber() || 0,
    },
    pendingWithdrawalRequests: pendingRequests,
    activeAccounts,
  };
}
