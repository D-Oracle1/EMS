/**
 * Marketing sales.
 *
 * The lines this file holds:
 *  - Only Marketing staff report sales; only senior staff (level 85+ or the
 *    superuser) confirm them; nobody confirms their own.
 *  - Nothing is posted until a sale is confirmed. A field collection is then
 *    posted exactly once, through the ordinary deposit or repayment path.
 *  - If posting fails, the sale goes back to the queue untouched.
 *  - Commission is on the amount reported, except loans and fixed deposits,
 *    where it is on the principal actually booked.
 *  - A record is credited to one marketer once.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: { user: {} as any },
  department: 'MARKETING' as string | null,
  sale: null as any,
  claimCount: 1,
  updates: [] as any[],
  created: null as any,
  existingClaim: null as any,
  records: {} as Record<string, any>,
  rate: 1,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    staff: {
      findUnique: vi.fn(async () => ({ branchId: 'branch-a', department: h.department ? { code: h.department } : null })),
      findMany: vi.fn(async () => [{ id: 'boss-1' }]),
      findFirst: vi.fn(async () => ({ firstName: 'Mo', lastName: 'Marketer' })),
    },
    savingsAccount: { findUnique: vi.fn(async () => h.records.savings ?? null) },
    loan: { findUnique: vi.fn(async () => h.records.loan ?? null) },
    fixedDeposit: { findUnique: vi.fn(async () => h.records.fd ?? null) },
    marketingSale: {
      findFirst: vi.fn(async () => h.existingClaim),
      findUnique: vi.fn(async () => h.sale),
      create: vi.fn(async ({ data }: any) => { h.created = data; return { id: 'sale-new', ...data }; }),
      updateMany: vi.fn(async (args: any) => { h.updates.push({ kind: 'updateMany', ...args }); return { count: h.claimCount }; }),
      update: vi.fn(async (args: any) => { h.updates.push({ kind: 'update', ...args }); return {}; }),
    },
  },
}));
vi.mock('@/lib/auth-utils', () => ({ getSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async () => undefined),
  createNotificationForUsers: vi.fn(async () => undefined),
}));
vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateReference: vi.fn(async () => 'MKT0001'),
}));
vi.mock('@/lib/system-config', () => ({ getConfigNumber: vi.fn(async () => h.rate) }));
vi.mock('@/actions/savings.actions', () => ({
  processDeposit: vi.fn(async () => ({ success: true, data: { transactionRef: 'STX0042' } })),
}));
vi.mock('@/actions/loan.actions', () => ({
  processRepayment: vi.fn(async () => ({ success: true, data: { receiptNumber: 'RCP0007' } })),
}));

import { reportSale, confirmSale, rejectSale } from '@/actions/marketing.actions';
import { processDeposit } from '@/actions/savings.actions';
import { processRepayment } from '@/actions/loan.actions';
import {
  canConfirmSales, commissionFor, validateSaleLinks, isMarketer, monthRange, SALE_CONFIRM_ROLE_LEVEL,
} from '@/lib/marketing-access';

const marketer = { id: 'mkt-1', firstName: 'Mo', lastName: 'Marketer', permissions: [], roleLevel: 35, departmentCode: 'MARKETING' };
const gm = { id: 'gm-1', firstName: 'Gee', lastName: 'Em', permissions: [], roleLevel: 85, departmentCode: 'MANAGEMENT' };

const pendingSale = (over: Record<string, unknown> = {}) => ({
  id: 'sale-1', reference: 'MKT0001', type: 'FIELD_COLLECTION', status: 'PENDING', marketerId: 'mkt-1',
  savingsAccountId: 'sav-1', loanId: null, fixedDepositId: null,
  amount: 50_000, paymentMode: 'CASH', paymentReference: null,
  loan: null, fixedDeposit: null, savingsAccount: { status: 'ACTIVE' },
  ...over,
});

beforeEach(() => {
  h.session = { user: marketer };
  h.department = 'MARKETING';
  h.sale = pendingSale();
  h.claimCount = 1;
  h.updates = [];
  h.created = null;
  h.existingClaim = null;
  h.records = { savings: { customerId: 'cust-1', status: 'ACTIVE' } };
  h.rate = 1;
  vi.mocked(processDeposit).mockClear();
  vi.mocked(processRepayment).mockClear();
});

// ── Rules ───────────────────────────────────────────────────────────────────

describe('who confirms', () => {
  it('is level 85 and above, or the superuser', () => {
    expect(SALE_CONFIRM_ROLE_LEVEL).toBe(85);
    expect(canConfirmSales({ permissions: [], roleLevel: 85 })).toBe(true);  // General Manager
    expect(canConfirmSales({ permissions: [], roleLevel: 90 })).toBe(true);  // Director
    expect(canConfirmSales({ permissions: ['ADMIN:SYSTEM'], roleLevel: 0 })).toBe(true);
  });

  it('is not HR (80) or a branch manager (70)', () => {
    expect(canConfirmSales({ permissions: [], roleLevel: 80 })).toBe(false);
    expect(canConfirmSales({ permissions: [], roleLevel: 70 })).toBe(false);
  });

  it('marketers are the Marketing department', () => {
    expect(isMarketer({ departmentCode: 'MARKETING' })).toBe(true);
    expect(isMarketer({ departmentCode: 'SAVINGS' })).toBe(false);
  });
});

describe('commissionFor', () => {
  it('takes the percentage, rounded to kobo', () => {
    expect(commissionFor(50_000, 1)).toBe(500);
    expect(commissionFor(33_333, 0.5)).toBe(166.67);
  });

  it('is never negative or NaN', () => {
    expect(commissionFor(-100, 1)).toBe(0);
    expect(commissionFor(100, -1)).toBe(0);
    expect(commissionFor(Number.NaN, 1)).toBe(0);
  });
});

describe('validateSaleLinks', () => {
  it('needs exactly one link of the right kind', () => {
    expect(validateSaleLinks('SAVINGS', { savingsAccountId: 's' })).toBeNull();
    expect(validateSaleLinks('SAVINGS', { loanId: 'l' })).not.toBeNull();
    expect(validateSaleLinks('LOAN', { loanId: 'l', savingsAccountId: 's' })).not.toBeNull();
    expect(validateSaleLinks('FIXED_DEPOSIT', {})).not.toBeNull();
  });

  it('lets a field collection go to savings or a loan, never a fixed deposit', () => {
    expect(validateSaleLinks('FIELD_COLLECTION', { savingsAccountId: 's' })).toBeNull();
    expect(validateSaleLinks('FIELD_COLLECTION', { loanId: 'l' })).toBeNull();
    expect(validateSaleLinks('FIELD_COLLECTION', { fixedDepositId: 'f' })).not.toBeNull();
  });
});

describe('monthRange', () => {
  it('spans the calendar month', () => {
    const { from, to } = monthRange('2026-12');
    expect(from).toEqual(new Date(2026, 11, 1));
    expect(to).toEqual(new Date(2027, 0, 1));
  });

  it('rejects anything else', () => {
    expect(() => monthRange('2026-13')).toThrow();
    expect(() => monthRange('Sept')).toThrow();
  });
});

// ── Reporting ───────────────────────────────────────────────────────────────

describe('reportSale', () => {
  const collection = { type: 'FIELD_COLLECTION' as const, customerId: 'cust-1', savingsAccountId: 'sav-1', amount: 50_000 };

  it('refuses anyone outside Marketing', async () => {
    h.department = 'SAVINGS';
    const result = await reportSale(collection);
    expect(result.success).toBe(false);
    expect(h.created).toBeNull();
  });

  it('records a pending sale on the marketer and their branch, and posts nothing', async () => {
    const result = await reportSale(collection);
    expect(result.success).toBe(true);
    // Status is left to the database default, PENDING.
    expect(h.created).not.toHaveProperty('status');
    expect(h.created).toMatchObject({ marketerId: 'mkt-1', branchId: 'branch-a', amount: 50_000 });
    expect(processDeposit).not.toHaveBeenCalled();
  });

  it('refuses an account that belongs to someone else', async () => {
    h.records.savings = { customerId: 'cust-OTHER', status: 'ACTIVE' };
    expect((await reportSale(collection)).success).toBe(false);
  });

  it('refuses a zero or negative amount', async () => {
    expect((await reportSale({ ...collection, amount: 0 })).success).toBe(false);
    expect((await reportSale({ ...collection, amount: -5 })).success).toBe(false);
  });

  it('refuses a future date', async () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    expect((await reportSale({ ...collection, collectedAt: future })).success).toBe(false);
  });

  it('credits a loan to one marketer only', async () => {
    h.records.loan = { customerId: 'cust-1', status: 'ACTIVE' };
    h.existingClaim = { reference: 'MKT0000' };
    const result = await reportSale({ type: 'LOAN', customerId: 'cust-1', loanId: 'loan-1', amount: 100_000 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('MKT0000');
  });

  it('refuses a loan sale before the loan is disbursed', async () => {
    h.records.loan = { customerId: 'cust-1', status: 'PENDING_APPROVAL' };
    expect((await reportSale({ type: 'LOAN', customerId: 'cust-1', loanId: 'loan-1', amount: 100_000 })).success).toBe(false);
  });
});

// ── Confirming ──────────────────────────────────────────────────────────────

describe('confirmSale', () => {
  beforeEach(() => { h.session = { user: gm }; h.department = 'MANAGEMENT'; });

  it('refuses staff below level 85', async () => {
    h.session = { user: { ...gm, roleLevel: 80 } };
    expect((await confirmSale('sale-1')).success).toBe(false);
    expect(processDeposit).not.toHaveBeenCalled();
  });

  it('refuses a confirmer\'s own sale', async () => {
    h.sale = pendingSale({ marketerId: 'gm-1' });
    const result = await confirmSale('sale-1');
    expect(result.success).toBe(false);
    expect(processDeposit).not.toHaveBeenCalled();
  });

  it('posts a savings collection as a deposit, then records commission', async () => {
    const result = await confirmSale('sale-1');
    expect(result.success).toBe(true);
    expect(processDeposit).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'sav-1', amount: 50_000 }));
    const final = h.updates.find((u) => u.kind === 'update');
    expect(final.data).toMatchObject({ status: 'CONFIRMED', postedReference: 'STX0042', commissionAmount: 500, commissionRate: 1 });
  });

  it('posts a loan collection as a repayment', async () => {
    h.sale = pendingSale({ savingsAccountId: null, loanId: 'loan-1' });
    await confirmSale('sale-1');
    expect(processRepayment).toHaveBeenCalledWith(expect.objectContaining({ loanId: 'loan-1', amount: 50_000 }));
    expect(processDeposit).not.toHaveBeenCalled();
  });

  it('claims the sale before posting, so it cannot be posted twice', async () => {
    h.claimCount = 0; // someone else claimed it first
    const result = await confirmSale('sale-1');
    expect(result.success).toBe(false);
    expect(processDeposit).not.toHaveBeenCalled();
  });

  it('puts the sale back in the queue when posting fails', async () => {
    vi.mocked(processDeposit).mockResolvedValueOnce({ success: false, error: 'Account is not active' });
    const result = await confirmSale('sale-1');
    expect(result.success).toBe(false);
    expect(h.updates.at(-1)).toMatchObject({ kind: 'update', data: { status: 'PENDING', reviewedById: null } });
  });

  it('posts nothing for a loan sale and pays commission on the booked principal', async () => {
    h.sale = pendingSale({
      type: 'LOAN', savingsAccountId: null, loanId: 'loan-1', amount: 999_999,
      loan: { principalAmount: 200_000, status: 'ACTIVE' },
    });
    await confirmSale('sale-1');
    expect(processDeposit).not.toHaveBeenCalled();
    expect(processRepayment).not.toHaveBeenCalled();
    const final = h.updates.find((u) => u.kind === 'update');
    expect(final.data.commissionAmount).toBe(2_000); // 1% of 200,000, not of the 999,999 reported
  });

  it('refuses to confirm a sale that is no longer pending', async () => {
    h.sale = pendingSale({ status: 'CONFIRMED' });
    expect((await confirmSale('sale-1')).success).toBe(false);
  });
});

describe('rejectSale', () => {
  beforeEach(() => { h.session = { user: gm }; });

  it('needs a reason', async () => {
    expect((await rejectSale('sale-1', '  ')).success).toBe(false);
  });

  it('rejects a pending sale without posting anything', async () => {
    const result = await rejectSale('sale-1', 'Customer denies paying');
    expect(result.success).toBe(true);
    expect(processDeposit).not.toHaveBeenCalled();
    expect(h.updates[0]).toMatchObject({ where: { id: 'sale-1', status: 'PENDING' }, data: { status: 'REJECTED' } });
  });
});
