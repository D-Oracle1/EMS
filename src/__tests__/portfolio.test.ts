/**
 * The customer's portfolio.
 *
 * The lines this file holds:
 *  - Figures add up from the records: credited interest is not counted twice,
 *    accrued interest is, money already paid out is not "with Hy-Link".
 *  - A loan shows what is left (instalments plus default charges), the next
 *    payment, and what is overdue; one not yet paid out owes nothing.
 *  - A customer only ever reads their own records: every lookup is keyed to
 *    their own id, and staff sessions are refused.
 *  - Staff give portal access only to customers in their branch, and the
 *    one-time password is never stored readable.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'cus-1', userType: 'customer', permissions: [] } as any,
  queries: [] as any[],
  updates: [] as any[],
  customer: null as any,
  sameNumber: 0,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    savingsAccount: { findFirst: vi.fn(async (args: any) => { h.queries.push(args); return null; }) },
    fixedDeposit: { findFirst: vi.fn(async (args: any) => { h.queries.push(args); return null; }) },
    loan: { findFirst: vi.fn(async (args: any) => { h.queries.push(args); return null; }) },
    customer: {
      findFirst: vi.fn(async (args: any) => { h.queries.push(args); return h.customer; }),
      update: vi.fn(async (args: any) => { h.updates.push(args); return {}; }),
      count: vi.fn(async () => h.sameNumber),
    },
  },
}));
vi.mock('@/lib/auth-utils', () => ({ getSession: vi.fn(async () => ({ user: h.user })) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ ok: true })), renderAlertEmail: vi.fn(() => '') }));
vi.mock('@/lib/branch-scope', async (orig) => ({
  ...(await orig<typeof import('@/lib/branch-scope')>()),
  branchScopeFor: vi.fn(async () => 'br-1'),
}));

import { savingsPosition, depositPosition, loanPosition, loanStage, portfolioTotals, termProgress } from '@/lib/portfolio';
import { getMySavings, getMyDeposit, getMyLoan } from '@/actions/portfolio.actions';
import { issuePortalAccess } from '@/actions/portal-access.actions';

const inst = (o: Partial<any> = {}) => ({
  installmentNumber: 1, dueDate: '2026-10-01', principalDue: 40_000, interestDue: 10_000, principalPaid: 0, interestPaid: 0,
  penaltyDue: 0, penaltyPaid: 0, penaltyWaived: 0, status: 'PENDING', ...o,
});

beforeEach(() => {
  h.user = { id: 'cus-1', userType: 'customer', permissions: [] };
  h.queries = [];
  h.updates = [];
  h.customer = null;
  h.sameNumber = 0;
});

describe('portfolio figures', () => {
  it('counts credited interest once (it is in the balance) and accrued interest on top', () => {
    const p = savingsPosition({ currentBalance: 105_000, totalDeposits: 100_000, interestAccrued: 0, interestPaidToDate: 5_000, interestTargetTotal: 17_000, status: 'ACTIVE' });
    expect(p).toMatchObject({ held: true, value: 105_000, earned: 5_000, atMaturity: 117_000 });
    const q = savingsPosition({ currentBalance: 100_000, totalDeposits: 100_000, interestAccrued: 3_000, interestPaidToDate: 0, interestTargetTotal: null, status: 'ACTIVE' });
    expect(q).toMatchObject({ value: 103_000, earned: 3_000, atMaturity: 103_000 });
  });

  it('does not count money already paid out', () => {
    expect(savingsPosition({ currentBalance: 0, totalDeposits: 100_000, interestAccrued: 0, interestPaidToDate: 17_000, interestTargetTotal: 17_000, status: 'COMPLETED' }).value).toBe(0);
    expect(depositPosition({ principalAmount: 1_500_000, accruedInterest: 225_000, maturityAmount: 1_725_000, status: 'WITHDRAWN' }).value).toBe(0);
    expect(depositPosition({ principalAmount: 1_500_000, accruedInterest: 50_000, maturityAmount: 1_725_000, status: 'ACTIVE' })).toMatchObject({ value: 1_550_000, atMaturity: 1_725_000 });
  });

  it('shows what is left on a loan, the next payment and what is overdue', () => {
    const now = new Date('2026-10-20T10:00:00');
    const p = loanPosition(
      { status: 'OVERDUE', principalAmount: 120_000, totalRepayment: 150_000 },
      [
        inst({ installmentNumber: 1, dueDate: '2026-09-01', principalPaid: 40_000, interestPaid: 10_000, status: 'PAID' }),
        inst({ installmentNumber: 2, dueDate: '2026-10-01', interestPaid: 10_000, penaltyDue: 3_000, penaltyWaived: 1_000, status: 'PARTIAL' }),
        inst({ installmentNumber: 3, dueDate: '2026-11-01' }),
      ],
      60_000,
      now
    );
    expect(p).toMatchObject({ outstanding: 92_000, chargesOwed: 2_000, overdue: 42_000, repaid: 60_000, instalmentsPaid: 1, instalments: 3 });
    expect(p.next).toMatchObject({ installmentNumber: 2, amount: 42_000 });
    expect(p.progress).toBeCloseTo(40_000 / 120_000);
  });

  it('owes nothing on a loan not yet paid out', () => {
    const p = loanPosition({ status: 'PENDING_APPROVAL', principalAmount: 120_000, totalRepayment: 150_000 }, [inst()], 0);
    expect(p).toMatchObject({ repaying: false, outstanding: 0, next: null });
    expect(loanStage('PENDING_APPROVAL')).toMatchObject({ step: 1, label: 'Being checked' });
    expect(loanStage('OVERDUE').tone).toBe('bad');
  });

  it('adds the portfolio up, with each holding\'s share', () => {
    const t = portfolioTotals(
      [
        { kind: 'SAVINGS', value: 100_000, earned: 5_000, atMaturity: 117_000 },
        { kind: 'PARTNERSHIP', value: 200_000, earned: 0, atMaturity: 240_000 },
        { kind: 'FIXED_DEPOSIT', value: 700_000, earned: 20_000, atMaturity: 805_000 },
      ],
      [150_000]
    );
    expect(t).toMatchObject({ invested: 1_000_000, earned: 25_000, atMaturity: 1_162_000, owed: 150_000, net: 850_000 });
    expect(t.allocation.map((a) => [a.kind, a.share])).toEqual([['SAVINGS', 0.1], ['PARTNERSHIP', 0.2], ['FIXED_DEPOSIT', 0.7]]);
  });

  it('measures how far through a term', () => {
    expect(termProgress('2026-01-01', '2026-12-31', new Date('2026-07-02'))).toBeCloseTo(0.5, 1);
    expect(termProgress('2026-01-01', '2026-12-31', new Date('2027-03-01'))).toBe(1);
    expect(termProgress(null, '2026-12-31')).toBeNull();
  });
});

describe('a customer sees only their own records', () => {
  it('keys every lookup to their own id', async () => {
    expect(await getMySavings('sav-of-someone-else')).toBeNull();
    expect(await getMyDeposit('fd-of-someone-else')).toBeNull();
    expect(await getMyLoan('loan-of-someone-else')).toBeNull();
    expect(h.queries).toHaveLength(3);
    for (const q of h.queries) expect(q.where.customerId).toBe('cus-1');
  });

  it('refuses a staff session', async () => {
    h.user = { id: 'staff-1', userType: 'staff', permissions: ['ADMIN:SYSTEM'] };
    await expect(getMyLoan('loan-1')).rejects.toThrow('customers only');
  });
});

describe('giving portal access', () => {
  const officer = { id: 'off-1', email: 'o@x.com', roleCode: 'SAVINGS_OFFICER', userType: 'staff', permissions: ['SAVINGS:CREATE'] };
  const customer = {
    id: 'cus-9', customerNumber: 'CUS0009', firstName: 'Ada', lastName: 'Obi', email: null, phone: '08031234567', status: 'ACTIVE',
    portalEnabled: false, passwordHash: null, mustResetPassword: true, portalLastLoginAt: null, portalLockedUntil: null,
  };

  it('issues a one-time password, stores only its hash, and names the phone to sign in with', async () => {
    h.user = officer;
    h.customer = customer;
    const result = await issuePortalAccess('cus-9');
    expect(result.success).toBe(true);
    const password = result.data!.password;
    expect(password).toMatch(/^[A-Z2-9]{6}$/);
    expect(result.data!.signInWith).toEqual(['08031234567']);
    const saved = h.updates[0].data;
    expect(saved).toMatchObject({ portalEnabled: true, mustResetPassword: true, portalFailedAttempts: 0 });
    expect(saved.passwordHash).not.toContain(password);
    expect(h.queries[0].where.branchId).toBe('br-1');
  });

  it('warns when another portal customer has the same phone', async () => {
    h.user = officer;
    h.customer = customer;
    h.sameNumber = 1;
    const result = await issuePortalAccess('cus-9');
    expect(result.data).toMatchObject({ phoneShared: true, signInWith: [] });
  });

  it('is refused to staff who do not open accounts', async () => {
    h.user = { ...officer, permissions: ['ACCOUNTS:REPORTS_VIEW'] };
    h.customer = customer;
    expect((await issuePortalAccess('cus-9')).success).toBe(false);
    expect(h.updates).toEqual([]);
  });
});
