/**
 * Fees and loan default charges.
 *
 * The lines this file holds:
 *  - A form's fee is a fixed amount or a percentage of what was applied for
 *    (the loan's 7%), fixed when the form is submitted.
 *  - A payment never exceeds what is owed, and books Dr Cash, Cr fee income.
 *    Only the product's officers record payments.
 *  - Only managers and admins discount a fee or reverse a payment, always with
 *    a reason, and money already paid cannot be discounted away.
 *  - Default charges accrue once a day per overdue instalment after the grace
 *    period, are never back-dated onto loans overdue before they began, and
 *    a repayment clears them first, booked to penalty income.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  user: { id: 'off-1', email: 'o@x.com', roleCode: 'SAVINGS_OFFICER', roleLevel: 40, permissions: ['SAVINGS:CREATE'] } as any,
  response: null as any,
  payments: [] as any[],
  journals: [] as any[],
  reversedJournals: [] as string[],
  created: [] as any[],
  updates: [] as any[],
  schedules: [] as any[],
  loan: null as any,
  chargesMade: [] as any[],
  dupDays: new Set<string>(),
}));

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    formResponse: {
      findUnique: vi.fn(async () => h.response),
      findMany: vi.fn(async () => (h.response ? [{
        id: h.response.id, feeDue: h.response.feeDue, feeBasis: 'x', feeDiscount: h.response.feeDiscount,
        discountReason: null, discountBy: null, feePayments: h.payments,
      }] : [])),
      update: vi.fn(async (args: any) => { h.updates.push(args); return {}; }),
    },
    feePayment: {
      create: vi.fn(async (args: any) => { h.created.push(args.data); return { id: 'pay-new' }; }),
      findUnique: vi.fn(async () => h.payments[0] ?? null),
      updateMany: vi.fn(async (args: any) => { h.updates.push(args); return { count: 1 }; }),
      update: vi.fn(async () => ({})),
    },
    loan: { findUnique: vi.fn(async () => h.loan), update: vi.fn(async () => ({})) },
    loanSchedule: {
      findMany: vi.fn(async () => h.schedules),
      update: vi.fn(async (args: any) => { h.updates.push({ schedule: args }); return {}; }),
      count: vi.fn(async () => 1),
    },
    loanRepayment: { create: vi.fn(async (args: any) => { h.created.push(args.data); return {}; }) },
    loanPenaltyCharge: {
      create: vi.fn((args: any) => ({ op: 'charge', args })),
    },
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === 'function') return ops(prisma);
      const charge = ops.find((o: any) => o?.op === 'charge');
      if (charge) {
        const key = `${charge.args.data.scheduleId}:${charge.args.data.chargeDate.toISOString().slice(0, 10)}`;
        if (h.dupDays.has(key)) throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
        h.chargesMade.push(charge.args.data);
      }
      return ops;
    }),
  };
  prisma.loanSchedule.update.mockImplementation(async (args: any) => { h.updates.push({ schedule: args }); return { op: 'schedule' }; });
  return { prisma, withTransaction: async (fn: any) => fn(prisma) };
});
vi.mock('@/lib/auth-utils', () => ({ getSession: vi.fn(async () => ({ user: h.user })) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/branch-scope', async (orig) => ({
  ...(await orig<typeof import('@/lib/branch-scope')>()),
  branchScopeFor: vi.fn(async () => 'br-1'),
}));
vi.mock('@/lib/utils', async (orig) => ({
  ...(await orig<typeof import('@/lib/utils')>()),
  generateReference: vi.fn(async () => 'RCP0001'),
}));
vi.mock('@/lib/accounting-engine', () => ({
  getAccountByCode: vi.fn(async (code: string) => ({ id: `acct-${code}` })),
  createJournalEntry: vi.fn(async (p: any) => { h.journals.push(p); return { id: `jnl-${h.journals.length}` }; }),
  reverseJournalEntry: vi.fn(async (id: string) => { h.reversedJournals.push(id); }),
}));

import {
  computeFee, feePosition, canDiscount, dailyPenalty, firstChargeDay, daysToCharge, allocateToInstalment, feeSettingProblem,
  penaltyOwed, MAX_CATCH_UP_DAYS,
} from '@/lib/fees';
import { recordFeePayment, setFeeDiscount, reverseFeePayment } from '@/actions/fee.actions';
import { postLoanRepayment } from '@/lib/money-posting';
import { runDailyLoanPenalties } from '@/lib/loan-penalties';

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const officer = { id: 'off-1', email: 'o@x.com', roleCode: 'SAVINGS_OFFICER', roleLevel: 40, permissions: ['SAVINGS:CREATE'] };
const manager = { id: 'mgr-1', email: 'm@x.com', roleCode: 'MANAGER', roleLevel: 70, permissions: ['SAVINGS:CREATE', 'SAVINGS:APPROVE'] };

beforeEach(() => {
  h.user = { ...officer };
  h.response = {
    id: 'app-1', reference: 'SV-ABC234', onboardingStatus: 'PENDING', customerId: null,
    answers: { firstName: 'Ada', lastName: 'Obi' },
    feeDue: new Prisma.Decimal(1000), feeDiscount: new Prisma.Decimal(0),
    form: { purpose: 'SAVINGS_APPLICATION', branchId: null }, customer: null,
  };
  h.payments = [];
  h.journals = [];
  h.reversedJournals = [];
  h.created = [];
  h.updates = [];
  h.chargesMade = [];
  h.dupDays = new Set();
});

// ─── The rules ──────────────────────────────────────────────────────────────

describe('working out a fee', () => {
  it('charges a fixed registration fee, or a percentage of what was applied for', () => {
    expect(computeFee({ kind: 'FLAT', amount: 1000, isActive: true }, null)).toEqual({ due: 1000, basis: 'Registration fee' });
    expect(computeFee({ kind: 'PERCENT', amount: 7, isActive: true }, 500_000)?.due).toBe(35_000);
    expect(computeFee({ kind: 'PERCENT', amount: 7, isActive: true }, 333_333)?.due).toBe(23_333.31);
  });

  it('charges nothing when the fee is off, zero, or a percentage of nothing', () => {
    expect(computeFee({ kind: 'FLAT', amount: 1000, isActive: false }, null)).toBeNull();
    expect(computeFee({ kind: 'FLAT', amount: 0, isActive: true }, null)).toBeNull();
    expect(computeFee({ kind: 'PERCENT', amount: 7, isActive: true }, null)).toBeNull();
  });

  it('knows where a fee stands', () => {
    expect(feePosition(1000, 0, 0).state).toBe('UNPAID');
    expect(feePosition(1000, 200, 300)).toMatchObject({ state: 'PART_PAID', balance: 500 });
    expect(feePosition(1000, 200, 800)).toMatchObject({ state: 'PAID', balance: 0 });
    expect(feePosition(1000, 1000, 0).state).toBe('WAIVED');
    expect(feePosition(null, 0, 0).state).toBe('NONE');
  });

  it('refuses a percentage over 100 or a negative fee', () => {
    expect(feeSettingProblem({ kind: 'PERCENT', amount: 120 })).not.toBeNull();
    expect(feeSettingProblem({ kind: 'FLAT', amount: -5 })).not.toBeNull();
    expect(feeSettingProblem({ kind: 'PERCENT', amount: 7 })).toBeNull();
  });

  it('lets only managers and admins discount', () => {
    expect(canDiscount({ permissions: ['SAVINGS:CREATE'], roleLevel: 40 })).toBe(false);
    expect(canDiscount({ permissions: ['LOANS:CREATE'], roleLevel: 50 })).toBe(false);
    expect(canDiscount({ permissions: [], roleLevel: 70 })).toBe(true);
    expect(canDiscount({ permissions: ['ADMIN:SYSTEM'], roleLevel: 0 })).toBe(true);
  });
});

describe('default charge arithmetic', () => {
  it('charges the daily rate on what is overdue', () => {
    expect(dailyPenalty(50_000, 1)).toBe(500);
    expect(dailyPenalty(0, 1)).toBe(0);
    expect(dailyPenalty(50_000, 0)).toBe(0);
  });

  it('starts the day after the due date and the grace period', () => {
    expect(firstChargeDay(day('2026-10-01'), 3).toISOString().slice(0, 10)).toBe('2026-10-05');
  });

  it('never back-dates charges onto a loan already overdue when charging began', () => {
    const days = daysToCharge(day('2026-10-20'), day('2026-09-01'), null);
    expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-20']);
  });

  it('catches up the days a missed run skipped, but no further than a month', () => {
    const days = daysToCharge(day('2026-10-20'), day('2026-09-01'), day('2026-10-17'));
    expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-18', '2026-10-19', '2026-10-20']);
    expect(daysToCharge(day('2026-12-31'), day('2026-01-01'), day('2026-01-02'))).toHaveLength(MAX_CATCH_UP_DAYS);
  });

  it('charges nothing inside the grace period', () => {
    expect(daysToCharge(day('2026-10-03'), day('2026-10-05'), null)).toEqual([]);
  });

  it('splits a payment: charges, then interest, then principal', () => {
    expect(allocateToInstalment(1000, { penalty: 300, interest: 500, principal: 2000 })).toEqual({ penalty: 300, interest: 500, principal: 200, remaining: 0 });
    expect(allocateToInstalment(100, { penalty: 300, interest: 500, principal: 2000 })).toEqual({ penalty: 100, interest: 0, principal: 0, remaining: 0 });
    expect(penaltyOwed({ penaltyDue: 900, penaltyPaid: 300, penaltyWaived: 100 })).toBe(500);
  });
});

// ─── Payments ───────────────────────────────────────────────────────────────

describe('recording a fee payment', () => {
  it('records it with a receipt and books Dr Cash, Cr fee income', async () => {
    const result = await recordFeePayment({ responseId: 'app-1', amount: 1000, paymentMode: 'CASH' });
    expect(result).toMatchObject({ success: true, data: { receiptNumber: 'RCP0001' } });
    expect(h.created[0]).toMatchObject({ responseId: 'app-1', amount: 1000, paymentMode: 'CASH', receivedById: 'off-1', journalEntryId: 'jnl-1' });
    const lines = h.journals[0].lines;
    expect(lines[0]).toMatchObject({ accountId: 'acct-1120', debitAmount: 1000 });
    expect(lines[1]).toMatchObject({ accountId: 'acct-4210', creditAmount: 1000 });
  });

  it('refuses more than is owed', async () => {
    h.payments = [{ id: 'p1', amount: new Prisma.Decimal(600), reversedAt: null, receivedBy: null, reversedBy: null, receivedAt: new Date(), paymentMode: 'CASH' }];
    const result = await recordFeePayment({ responseId: 'app-1', amount: 500, paymentMode: 'CASH' });
    expect(result.success).toBe(false);
    expect(h.created).toEqual([]);
    expect(h.journals).toEqual([]);
  });

  it('refuses an officer of another product', async () => {
    h.user = { ...officer, permissions: ['LOANS:CREATE'] };
    expect(await recordFeePayment({ responseId: 'app-1', amount: 1000, paymentMode: 'CASH' })).toMatchObject({ success: false });
  });

  it('reverses the ledger entry when the payment cannot be saved', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.feePayment.create as any).mockRejectedValueOnce(new Error('db down'));
    const result = await recordFeePayment({ responseId: 'app-1', amount: 1000, paymentMode: 'CASH' });
    expect(result.success).toBe(false);
    expect(h.reversedJournals).toEqual(['jnl-1']);
  });
});

describe('discounts and reversals', () => {
  it('are not for officers', async () => {
    expect(await setFeeDiscount('app-1', 200, 'Loyal customer')).toMatchObject({ success: false });
    h.payments = [{ id: 'p1', receiptNumber: 'RCP1', responseId: 'app-1', amount: new Prisma.Decimal(1000), journalEntryId: 'jnl-9', reversedAt: null }];
    expect(await reverseFeePayment('p1', 'Typed twice')).toMatchObject({ success: false });
  });

  it('need a reason', async () => {
    h.user = { ...manager };
    expect(await setFeeDiscount('app-1', 200, '')).toMatchObject({ success: false, error: 'Give the reason for the discount' });
  });

  it('let a manager discount what is not yet paid', async () => {
    h.user = { ...manager };
    expect(await setFeeDiscount('app-1', 250, 'Staff referral')).toMatchObject({ success: true });
    expect(h.updates.at(-1)).toMatchObject({ data: { feeDiscount: 250, discountReason: 'Staff referral', discountById: 'mgr-1' } });
  });

  it('cannot discount money already paid: fees are non-refundable', async () => {
    h.user = { ...manager };
    h.payments = [{ id: 'p1', amount: new Prisma.Decimal(800), reversedAt: null, receivedBy: null, reversedBy: null, receivedAt: new Date(), paymentMode: 'CASH' }];
    expect(await setFeeDiscount('app-1', 500, 'Late request')).toMatchObject({ success: false });
  });

  it('let a manager reverse a mistaken payment and its ledger entry', async () => {
    h.user = { ...manager };
    h.payments = [{ id: 'p1', receiptNumber: 'RCP1', responseId: 'app-1', amount: new Prisma.Decimal(1000), journalEntryId: 'jnl-9', reversedAt: null }];
    expect(await reverseFeePayment('p1', 'Recorded twice')).toMatchObject({ success: true });
    expect(h.reversedJournals).toEqual(['jnl-9']);
  });
});

// ─── Default charges ────────────────────────────────────────────────────────

const D = (n: number) => new Prisma.Decimal(n);

describe('the daily default charge job', () => {
  const schedule = (over: Partial<any> = {}) => ({
    id: 'sch-1', loanId: 'loan-1', dueDate: day('2026-10-01'),
    principalDue: D(40_000), interestDue: D(10_000), principalPaid: D(0), interestPaid: D(0),
    loan: { product: { penaltyRate: D(1), gracePeriodDays: 3 } },
    penaltyCharges: [] as any[],
    ...over,
  });

  it('charges an overdue instalment once for today', async () => {
    h.schedules = [schedule()];
    const result = await runDailyLoanPenalties(day('2026-10-10'));
    expect(result).toMatchObject({ instalments: 1, charges: 1, amount: 500 });
    expect(h.chargesMade[0]).toMatchObject({ scheduleId: 'sch-1', overdueAmount: 50_000, rate: 1, amount: 500 });
  });

  it('charges on what is still unpaid', async () => {
    h.schedules = [schedule({ principalPaid: D(20_000), interestPaid: D(10_000) })];
    await runDailyLoanPenalties(day('2026-10-10'));
    expect(h.chargesMade[0]).toMatchObject({ overdueAmount: 20_000, amount: 200 });
  });

  it('never charges a day twice when the job runs again', async () => {
    h.schedules = [schedule()];
    h.dupDays.add('sch-1:2026-10-10');
    const result = await runDailyLoanPenalties(day('2026-10-10'));
    expect(result.charges).toBe(0);
  });

  it('leaves the grace period alone', async () => {
    h.schedules = [schedule()];
    expect((await runDailyLoanPenalties(day('2026-10-03'))).charges).toBe(0);
  });
});

describe('a repayment on a loan with default charges', () => {
  beforeEach(() => {
    h.loan = {
      id: 'loan-1', loanNumber: 'LN0001', status: 'OVERDUE', customerId: 'cus-1', createdById: 'lo-1',
      customer: {},
      schedule: [{
        id: 'sch-1', installmentNumber: 1, status: 'OVERDUE',
        principalDue: D(40_000), interestDue: D(10_000), principalPaid: D(0), interestPaid: D(0), totalDue: D(50_000),
        penaltyDue: D(1_500), penaltyPaid: D(0), penaltyWaived: D(500),
      }],
    };
  });

  it('clears the charges first and books them to penalty income', async () => {
    const result = await postLoanRepayment({ id: 'teller-1' }, { loanId: 'loan-1', amount: 6_000, paymentMode: 'CASH' });
    expect(result).toMatchObject({ success: true, data: { penaltyPaid: 1_000, interestPaid: 5_000, principalPaid: 0 } });
    expect(h.created.at(-1)).toMatchObject({ penaltyPortion: 1_000, interestPortion: 5_000, principalPortion: 0 });
    const lines = h.journals.at(-1).lines;
    expect(lines).toContainEqual(expect.objectContaining({ accountId: 'acct-4220', creditAmount: 1_000 }));
    expect(lines).toContainEqual(expect.objectContaining({ accountId: 'acct-4110', creditAmount: 5_000 }));
  });

  it('keeps an instalment open while its charges are unpaid', async () => {
    h.loan.schedule[0].penaltyDue = D(3_000);
    await postLoanRepayment({ id: 'teller-1' }, { loanId: 'loan-1', amount: 50_000, paymentMode: 'CASH' });
    const update = h.updates.find((u) => u.schedule)?.schedule;
    expect(update.data).toMatchObject({ penaltyPaid: 2_500, status: 'PARTIAL' });
  });
});
