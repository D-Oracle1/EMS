/**
 * A loan application's processing fee is paid upfront (lib/fees).
 *
 * The lines this file holds:
 *  - A loan cannot be created from an application until its fee is settled.
 *  - A loan created from a settled application charges no processing fee,
 *    so disbursement does not deduct it a second time.
 *  - One application makes one loan.
 *  - A loan created in the office without an application keeps the
 *    product's processing fee, deducted at disbursement as before.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  app: null as any,
  payments: [] as any[],
  loans: [] as any[],
  claimed: 1,
}));

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    formResponse: {
      findUnique: vi.fn(async () => h.app),
      findMany: vi.fn(async () => (h.app ? [{
        id: h.app.id, feeDue: h.app.feeDue, feeBasis: '7% of NGN 500,000.00', feeDiscount: new Prisma.Decimal(0),
        discountReason: null, discountBy: null, feePayments: h.payments,
      }] : [])),
      updateMany: vi.fn(async () => ({ count: h.claimed })),
    },
    customer: { findUnique: vi.fn(async () => ({ id: 'cus-1', status: 'ACTIVE', firstName: 'Ada', lastName: 'Obi' })) },
    loan: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: any) => { h.loans.push(args.data); return { id: 'loan-1', ...args.data }; }),
    },
    loanProduct: {
      findUnique: vi.fn(async () => ({
        id: 'prod-1', isActive: true, minAmount: new Prisma.Decimal(1000), maxAmount: new Prisma.Decimal(5_000_000),
        minTenure: 1, maxTenure: 24, interestRate: new Prisma.Decimal(30), interestType: 'FLAT',
        processingFee: new Prisma.Decimal(7), insuranceFee: null,
      })),
    },
    guarantor: { create: vi.fn(async () => ({})) },
    loanSchedule: { create: vi.fn(async () => ({})) },
  };
  return { prisma, withTransaction: async (fn: any) => fn(prisma) };
});
vi.mock('@/lib/auth-utils', () => ({
  requirePermission: vi.fn(async () => ({ id: 'lo-1', email: 'lo@x.com', roleCode: 'LOAN_OFFICER', branchId: 'br-1', permissions: ['LOANS:CREATE'] })),
  requireAnyPermission: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('@/lib/branch-scope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/branch-scope')>()),
  branchForNewRecord: vi.fn(async (_u: unknown, o?: { requested?: string | null }) => o?.requested || 'br-1'),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/approval-history', () => ({ recordApprovalHistory: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({ notifyCustomerByEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/customer-auth', () => ({ provisionCustomerLogin: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(), createNotificationForUsers: vi.fn(), getUsersWithPermission: vi.fn(async () => []), getUsersWithAnyPermission: vi.fn(async () => []),
}));
vi.mock('@/lib/utils', async (orig) => ({
  ...(await orig<typeof import('@/lib/utils')>()),
  generateReference: vi.fn(async () => 'LN0001'),
}));

import { createLoan } from '@/actions/loan.actions';

const loanInput = { customerId: 'cus-1', productId: 'prod-1', principalAmount: 500_000, tenure: 6 };
const paid = (amount: number) => ({
  id: 'p1', amount: new Prisma.Decimal(amount), reversedAt: null, receivedBy: null, reversedBy: null, receivedAt: new Date(), paymentMode: 'CASH',
});

beforeEach(() => {
  h.app = {
    id: 'app-1', reference: 'LA-ABC234', customerId: 'cus-1', loanId: null, onboardingStatus: 'APPROVED',
    feeDue: new Prisma.Decimal(35_000), form: { purpose: 'LOAN_APPLICATION' },
  };
  h.payments = [];
  h.loans = [];
  h.claimed = 1;
});

describe('a loan from an application', () => {
  it('waits until the processing fee is paid', async () => {
    h.payments = [paid(20_000)];
    const result = await createLoan({ ...loanInput, applicationId: 'app-1' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not fully paid/);
    expect(h.loans).toEqual([]);
  });

  it('charges no processing fee once it was paid upfront', async () => {
    h.payments = [paid(35_000)];
    const result = await createLoan({ ...loanInput, applicationId: 'app-1' });
    expect(result.success).toBe(true);
    expect(h.loans[0]).toMatchObject({ processingFee: 0, totalFees: 0 });
  });

  it('makes only one loan', async () => {
    h.payments = [paid(35_000)];
    h.app.loanId = 'loan-0';
    expect((await createLoan({ ...loanInput, applicationId: 'app-1' })).success).toBe(false);
    h.app.loanId = null;
    h.claimed = 0;
    expect((await createLoan({ ...loanInput, applicationId: 'app-1' })).success).toBe(false);
  });

  it('must be for the applicant', async () => {
    h.payments = [paid(35_000)];
    const result = await createLoan({ ...loanInput, customerId: 'cus-2', applicationId: 'app-1' });
    expect(result.success).toBe(false);
  });
});

describe('a loan created in the office', () => {
  it('keeps the product processing fee, deducted at disbursement', async () => {
    const result = await createLoan(loanInput);
    expect(result.success).toBe(true);
    expect(h.loans[0]).toMatchObject({ processingFee: 35_000 });
  });
});
