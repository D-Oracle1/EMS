/**
 * Personal form links.
 *
 * The lines this file holds:
 *  - A staff member's link credits the application to them; an unknown code
 *    is ignored, never an error.
 *  - When what was applied for is opened (or a loan paid out), a sale is
 *    recorded in the referrer's name, pending confirmation: once per record,
 *    and only for staff who sell (Marketing, or on sales targets).
 *  - An account opens from an application only once, for its own applicant.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  response: null as any,
  claimed: null as any,
  sales: [] as any[],
  notices: [] as any[],
  claimCount: 1,
  staff: null as any,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    formResponse: {
      findUnique: vi.fn(async () => h.response),
      updateMany: vi.fn(async () => ({ count: h.claimCount })),
    },
    marketingSale: {
      findFirst: vi.fn(async () => h.claimed),
      create: vi.fn(async (args: any) => { h.sales.push(args.data); return { id: 'sale-1' }; }),
    },
    staff: {
      findMany: vi.fn(async () => [{ id: 'gm-1' }, { id: 'mk-1' }]),
      findFirst: vi.fn(async (args: any) => (h.staff && args.where.employeeId.equals === h.staff.employeeId ? h.staff : null)),
    },
  },
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async (n: any) => { h.notices.push({ to: [n.userId], ...n }); }),
  createNotificationForUsers: vi.fn(async (ids: string[], n: any) => { h.notices.push({ to: ids, ...n }); }),
}));
vi.mock('@/lib/utils', async (orig) => ({
  ...(await orig<typeof import('@/lib/utils')>()),
  generateReference: vi.fn(async () => 'MKT0099'),
}));

import { normalizeReferralCode, isSeller, findReferrer, recordReferralSale, linkOpenedAccount, openingApplicationProblem } from '@/lib/referrals';

const marketer = {
  id: 'mk-1', firstName: 'Bola', lastName: 'Ade', branchId: 'br-1', status: 'ACTIVE', isDeleted: false,
  onSalesTarget: false, department: { code: 'MARKETING' },
};

beforeEach(() => {
  h.response = { reference: 'LA-ABC234', referredBy: marketer };
  h.claimed = null;
  h.sales = [];
  h.notices = [];
  h.claimCount = 1;
  h.staff = null;
});

const sale = (over: Partial<Parameters<typeof recordReferralSale>[0]> = {}) => recordReferralSale({
  responseId: 'app-1', type: 'LOAN', customerId: 'cus-1', link: { loanId: 'loan-1' }, amount: 500_000, recordedById: 'lo-1', ...over,
});

describe('referral codes', () => {
  it('reads a code however it was written, and refuses junk', () => {
    expect(normalizeReferralCode(' emp0042 ')).toBe('EMP0042');
    expect(normalizeReferralCode('x')).toBeNull();
    expect(normalizeReferralCode('<script>')).toBeNull();
    expect(normalizeReferralCode(undefined)).toBeNull();
  });

  it('finds only an active staff member', async () => {
    h.staff = { id: 'mk-1', firstName: 'Bola', lastName: 'Ade', employeeId: 'EMP0042' };
    expect(await findReferrer('emp0042')).toMatchObject({ id: 'mk-1' });
    expect(await findReferrer('EMP9999')).toBeNull();
  });

  it('knows who earns commission', () => {
    expect(isSeller({ onSalesTarget: false, department: { code: 'MARKETING' } })).toBe(true);
    expect(isSeller({ onSalesTarget: true, department: { code: 'LOANS' } })).toBe(true);
    expect(isSeller({ onSalesTarget: false, department: { code: 'LOANS' } })).toBe(false);
  });
});

describe('the sale a referral earns', () => {
  it('is recorded in the referrer\'s name, pending, and both sides are told', async () => {
    expect(await sale()).toBe('MKT0099');
    expect(h.sales[0]).toMatchObject({
      type: 'LOAN', marketerId: 'mk-1', reportedById: 'lo-1', branchId: 'br-1', customerId: 'cus-1', loanId: 'loan-1', amount: 500_000,
    });
    expect(h.sales[0].status).toBeUndefined(); // the model's default: PENDING
    expect(h.notices.find((n) => n.title === 'Sale awaiting confirmation')?.to).toEqual(['gm-1']);
    expect(h.notices.find((n) => n.title === 'Your referral became a sale')?.to).toEqual(['mk-1']);
  });

  it('is not recorded for staff who do not sell', async () => {
    h.response.referredBy = { ...marketer, department: { code: 'LOANS' } };
    expect(await sale()).toBeNull();
    expect(h.sales).toEqual([]);
  });

  it('is never recorded twice for the same loan', async () => {
    h.claimed = { id: 'existing' };
    expect(await sale()).toBeNull();
    expect(h.sales).toEqual([]);
  });

  it('is not recorded without a referrer, or for one who has left', async () => {
    h.response.referredBy = null;
    expect(await sale()).toBeNull();
    h.response.referredBy = { ...marketer, status: 'TERMINATED' };
    expect(await sale()).toBeNull();
  });
});

describe('opening an account from an application', () => {
  const app = (over: any = {}) => ({
    id: 'app-1', customerId: 'cus-1', onboardingStatus: 'APPROVED', savingsAccountId: null, fixedDepositId: null, reference: 'SV-K7Q2MX',
    form: { purpose: 'SAVINGS_APPLICATION' }, referredBy: marketer, ...over,
  });

  it('refuses another customer, an unapproved application, or a second account', async () => {
    h.response = app({ customerId: 'cus-2' });
    expect(await openingApplicationProblem('app-1', 'cus-1', 'SAVINGS')).toMatch(/not for the applicant/);
    h.response = app({ onboardingStatus: 'PENDING' });
    expect(await openingApplicationProblem('app-1', 'cus-1', 'SAVINGS')).toMatch(/not approved/);
    h.response = app({ savingsAccountId: 'sav-0' });
    expect(await openingApplicationProblem('app-1', 'cus-1', 'SAVINGS')).toMatch(/already opened/);
    h.response = app({ form: { purpose: 'LOAN_APPLICATION' } });
    expect(await openingApplicationProblem('app-1', 'cus-1', 'SAVINGS')).toMatch(/not found/);
    h.response = app();
    expect(await openingApplicationProblem('app-1', 'cus-1', 'SAVINGS')).toBeNull();
  });

  it('links the account and records the savings sale', async () => {
    h.response = app();
    expect(await linkOpenedAccount({ applicationId: 'app-1', customerId: 'cus-1', kind: 'SAVINGS', accountId: 'sav-1', amount: 50_000, recordedById: 'so-1' })).toBeNull();
    expect(h.sales[0]).toMatchObject({ type: 'SAVINGS', savingsAccountId: 'sav-1', amount: 50_000, marketerId: 'mk-1' });
  });

  it('records nothing when another officer already opened one from it', async () => {
    h.response = app();
    h.claimCount = 0;
    expect(await linkOpenedAccount({ applicationId: 'app-1', customerId: 'cus-1', kind: 'SAVINGS', accountId: 'sav-1', amount: 50_000, recordedById: 'so-1' }))
      .toMatch(/already opened/);
    expect(h.sales).toEqual([]);
  });
});
