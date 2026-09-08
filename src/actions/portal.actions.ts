'use server';

/**
 * Customer Portal — self-service actions. Every action is scoped to the logged
 * in customer (session.user.id) and refuses non-customer sessions. Customers
 * have no staff permissions, so ownership is enforced here directly.
 */

import Decimal from 'decimal.js';
import { prisma, withTransaction } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import {
  generateReference,
  calculateReducingBalanceSchedule,
  calculateFlatRateSchedule,
} from '@/lib/utils';
import { createNotificationForUsers, getUsersWithAnyPermission } from '@/lib/notifications';
import type { ActionResult } from '@/types';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

async function requireCustomer(): Promise<string> {
  const { user } = await getSession();
  if (user.userType !== 'customer') throw new Error('This area is for customers only');
  return user.id;
}

export async function getMyPortalData() {
  const customerId = await requireCustomer();

  const [customer, loans, savings, fixedDeposits] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        customerNumber: true, title: true, firstName: true, lastName: true,
        email: true, phone: true, address: true, city: true, state: true,
        occupation: true, status: true,
      },
    }),
    prisma.loan.findMany({
      where: { customerId, isDeleted: false },
      select: {
        id: true, loanNumber: true, principalAmount: true, interestRate: true,
        tenure: true, status: true, applicationDate: true,
        product: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.savingsAccount.findMany({
      where: { customerId, isDeleted: false },
      select: {
        id: true, accountNumber: true, currentBalance: true, interestAccrued: true,
        totalDeposits: true, status: true, maturityDate: true, monthsRemaining: true,
        product: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.fixedDeposit.findMany({
      where: { customerId },
      select: {
        id: true, certificateNumber: true, principalAmount: true, interestRate: true,
        maturityAmount: true, status: true, maturityDate: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const num = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : 0);

  return {
    customer,
    loans: loans.map((l) => ({
      id: l.id, loanNumber: l.loanNumber, product: l.product.name,
      principalAmount: num(l.principalAmount), interestRate: num(l.interestRate),
      tenure: l.tenure, status: l.status, applicationDate: l.applicationDate.toISOString(),
    })),
    savings: savings.map((s) => ({
      id: s.id, accountNumber: s.accountNumber, product: s.product.name,
      currentBalance: num(s.currentBalance), interestAccrued: num(s.interestAccrued),
      totalDeposits: num(s.totalDeposits), status: s.status,
      maturityDate: s.maturityDate?.toISOString() ?? null, monthsRemaining: s.monthsRemaining,
    })),
    fixedDeposits: fixedDeposits.map((f) => ({
      id: f.id, certificateNumber: f.certificateNumber, principalAmount: num(f.principalAmount),
      interestRate: num(f.interestRate), maturityAmount: num(f.maturityAmount),
      status: f.status, maturityDate: f.maturityDate.toISOString(),
    })),
  };
}

export async function updateMyProfile(data: {
  phone?: string; email?: string; address?: string; city?: string; state?: string;
}): Promise<ActionResult> {
  try {
    const customerId = await requireCustomer();
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return { success: false, error: 'Invalid email address' };
    }
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        phone: data.phone?.trim() || undefined,
        email: data.email?.trim() || undefined,
        address: data.address?.trim() || undefined,
        city: data.city?.trim() || undefined,
        state: data.state?.trim() || undefined,
      },
    });
    return { success: true, message: 'Profile updated' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update profile' };
  }
}

export async function requestMyWithdrawal(data: {
  accountId: string; amount: number; reason?: string;
}): Promise<ActionResult> {
  try {
    const customerId = await requireCustomer();
    if (!data.amount || data.amount <= 0) return { success: false, error: 'Enter a valid amount' };

    // Ownership check
    const account = await prisma.savingsAccount.findFirst({
      where: { id: data.accountId, customerId, isDeleted: false },
      select: { id: true, accountNumber: true, availableBalance: true, status: true },
    });
    if (!account) return { success: false, error: 'Account not found' };
    if (account.status !== 'ACTIVE') return { success: false, error: 'Account is not active' };
    if (new Decimal(data.amount).gt(account.availableBalance)) {
      return { success: false, error: 'Amount exceeds available balance' };
    }

    // requestedById is a Staff FK; attribute customer-initiated requests to a
    // system officer and mark the source in the reason.
    const sysAdmin = await prisma.staff.findFirst({
      where: { status: 'ACTIVE', role: { code: 'SUPER_ADMIN' } }, select: { id: true },
    });
    if (!sysAdmin) return { success: false, error: 'Requests are temporarily unavailable' };

    const requestNumber = await generateReference('WITHDRAWAL_REQ');
    await prisma.withdrawalRequest.create({
      data: {
        requestNumber,
        accountId: account.id,
        amount: data.amount,
        reason: `[Customer portal] ${data.reason?.trim() || 'Withdrawal request'}`,
        status: 'PENDING',
        requestedById: sysAdmin.id,
      },
    });

    // Notify staff who approve withdrawals
    const approvers = await getUsersWithAnyPermission(['SAVINGS:APPROVE', 'SAVINGS:MANAGE']);
    await createNotificationForUsers(approvers, {
      type: 'APPROVAL_REQUIRED',
      title: 'Customer withdrawal request',
      message: `A customer requested a withdrawal of ${data.amount.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })} from ${account.accountNumber}.`,
      entityType: 'WITHDRAWAL_REQUEST',
      actionUrl: '/savings/withdrawals',
    });

    return { success: true, message: 'Withdrawal request submitted for approval' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to submit request' };
  }
}

export async function getPortalLoanProducts() {
  await requireCustomer();
  const products = await prisma.loanProduct.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, code: true, minAmount: true, maxAmount: true,
      minTenure: true, maxTenure: true, interestRate: true, interestType: true,
    },
    orderBy: { name: 'asc' },
  });
  return products.map((p) => ({
    ...p,
    minAmount: p.minAmount.toNumber(), maxAmount: p.maxAmount.toNumber(),
    interestRate: p.interestRate.toNumber(),
  }));
}

export async function applyForLoan(data: {
  productId: string; amount: number; tenure: number; purpose?: string;
}): Promise<ActionResult<{ loanNumber: string }>> {
  try {
    const customerId = await requireCustomer();

    const product = await prisma.loanProduct.findUnique({ where: { id: data.productId } });
    if (!product || !product.isActive) return { success: false, error: 'Loan product unavailable' };

    const amt = Number(data.amount);
    if (amt < product.minAmount.toNumber() || amt > product.maxAmount.toNumber()) {
      return { success: false, error: `Amount must be between ${product.minAmount} and ${product.maxAmount}` };
    }
    if (data.tenure < product.minTenure || data.tenure > product.maxTenure) {
      return { success: false, error: `Tenure must be between ${product.minTenure} and ${product.maxTenure} months` };
    }

    const rate = product.interestRate.toNumber();
    const start = new Date();
    const calc = product.interestType === 'REDUCING_BALANCE'
      ? calculateReducingBalanceSchedule(amt, rate, data.tenure, start)
      : calculateFlatRateSchedule(amt, rate, data.tenure, start);

    const processingFee = new Decimal(amt).times(product.processingFee).div(100).toDecimalPlaces(2).toNumber();
    const insuranceFee = product.insuranceFee
      ? new Decimal(amt).times(product.insuranceFee).div(100).toDecimalPlaces(2).toNumber() : 0;

    // Self-service applications are attributed to a system officer for the
    // required createdById; staff pick them up from DRAFT.
    const sysAdmin = await prisma.staff.findFirst({
      where: { status: 'ACTIVE', role: { code: 'SUPER_ADMIN' } }, select: { id: true },
    });
    if (!sysAdmin) return { success: false, error: 'Applications are temporarily unavailable' };

    const loanNumber = await generateReference('LOAN');
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { branchId: true } });

    await withTransaction(async (tx) => {
      const loan = await tx.loan.create({
        data: {
          loanNumber, customerId, productId: data.productId, branchId: customer?.branchId,
          principalAmount: amt, interestRate: rate, tenure: data.tenure,
          processingFee, insuranceFee, totalFees: processingFee + insuranceFee,
          totalInterest: calc.totalInterest, totalRepayment: calc.totalRepayment,
          monthlyInstalment: calc.monthlyInstalment,
          purpose: data.purpose?.trim() || 'Customer self-service application',
          status: 'DRAFT', createdById: sysAdmin.id,
        },
      });
      for (const item of calc.schedule) {
        await tx.loanSchedule.create({
          data: {
            loanId: loan.id, installmentNumber: item.installmentNumber, dueDate: item.dueDate,
            principalDue: item.principalDue, interestDue: item.interestDue,
            totalDue: item.totalDue, outstandingBalance: item.outstandingBalance, status: 'PENDING',
          },
        });
      }
    });

    await auditLog({
      userId: sysAdmin.id, userRole: 'CUSTOMER',
      action: 'CREATE', module: 'LOANS', entityType: 'LOAN', entityId: loanNumber,
      description: `Customer self-service loan application ${loanNumber} for ${amt} (customer ${customerId})`,
    });

    const officers = await getUsersWithAnyPermission(['LOANS:CREATE', 'LOANS:MANAGE_ALL']);
    await createNotificationForUsers(officers, {
      type: 'INFO',
      title: 'New customer loan application',
      message: `A customer submitted a loan application (${loanNumber}) for ${amt.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}.`,
      entityType: 'LOAN', actionUrl: '/loans',
    });

    return { success: true, message: `Application ${loanNumber} submitted`, data: { loanNumber } };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to submit application' };
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * The saver's own notifications — chiefly the daily interest credits.
 *
 * Scoped to the signed-in customer by `requireCustomer`, so one saver can never
 * read another's.
 */
export async function getMyNotifications(limit = 30) {
  const customerId = await requireCustomer();

  const [items, unread] = await Promise.all([
    prisma.customerNotification.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    }),
    prisma.customerNotification.count({ where: { customerId, isRead: false } }),
  ]);

  return {
    unread,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      entityType: n.entityType,
      entityId: n.entityId,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

/** Mark one notification, or all of them, as read. */
export async function markMyNotificationsRead(id?: string): Promise<ActionResult> {
  try {
    const customerId = await requireCustomer();

    await prisma.customerNotification.updateMany({
      // The customerId in the filter is what stops a crafted id from marking
      // somebody else's notification.
      where: { customerId, isRead: false, ...(id ? { id } : {}) },
      data: { isRead: true, readAt: new Date() },
    });

    return { success: true, message: id ? 'Marked as read' : 'All caught up' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
