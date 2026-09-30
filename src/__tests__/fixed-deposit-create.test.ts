/**
 * Opening a fixed deposit.
 *
 * The bug this guards against: the form asked staff to type a raw customer
 * ID, and its funding and maturity options sent values the database rejects.
 * A fixed deposit is now opened like a savings account — for an existing
 * customer or one registered on the spot, in one transaction.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  customer: null as any,
  fdData: null as any,
  registered: null as any,
  scope: null as string | null,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customer: { findUnique: vi.fn(async () => h.customer) },
  },
  withTransaction: vi.fn(async (fn: any) =>
    fn({
      fixedDeposit: {
        create: vi.fn(async ({ data }: any) => { h.fdData = data; return { id: 'fd-1', ...data }; }),
      },
    })
  ),
}));
vi.mock('@/lib/auth-utils', () => ({
  requirePermission: vi.fn(async () => ({ id: 'staff-1', branchId: 'branch-a', permissions: ['FIXED_DEPOSITS:CREATE'] })),
  requireAnyPermission: vi.fn(),
}));
vi.mock('@/lib/branch-scope', () => ({
  branchScopeFor: vi.fn(async () => h.scope),
  inScope: (scope: string | null, b: string | null) => scope === null || scope === b,
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateReference: vi.fn(async (code: string) => (code === 'CUSTOMER' ? 'CUS0099' : 'FD0007')),
}));
vi.mock('@/lib/accounting-engine', () => ({
  getAccountByCode: vi.fn(async () => null),
  createJournalEntry: vi.fn(async () => ({ id: 'je-1' })),
}));
vi.mock('@/lib/customer-registration', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createCustomerInTx: vi.fn(async (_tx: any, nc: any, ctx: any) => {
    h.registered = { nc, ctx };
    return { id: 'cust-new' };
  }),
}));
vi.mock('@/lib/customer-auth', () => ({ provisionCustomerLogin: vi.fn(async () => undefined) }));

import { createFixedDeposit } from '@/actions/fixed-deposit.actions';
import { provisionCustomerLogin } from '@/lib/customer-auth';

const terms = { principalAmount: 500_000, tenure: 180, interestRate: 12, fundingMode: 'BANK_TRANSFER' };
const newCustomer = { firstName: 'Ada', lastName: 'Obi', phone: '08030000000', address: '1 Allen Ave, Ikeja' };

beforeEach(() => {
  h.customer = { id: 'cust-1', status: 'ACTIVE', branchId: 'branch-a', firstName: 'Bola', lastName: 'Ade' };
  h.fdData = null;
  h.registered = null;
  h.scope = null;
  vi.mocked(provisionCustomerLogin).mockClear();
});

describe('createFixedDeposit', () => {
  it('opens for an existing customer', async () => {
    const result = await createFixedDeposit({ customerId: 'cust-1', ...terms });
    expect(result.success).toBe(true);
    expect(h.fdData).toMatchObject({ customerId: 'cust-1', principalAmount: 500_000, fundingMode: 'BANK_TRANSFER' });
  });

  it('registers a new customer and opens the deposit for them', async () => {
    const result = await createFixedDeposit({ newCustomer, ...terms });
    expect(result.success).toBe(true);
    expect(h.registered.ctx).toMatchObject({ customerNumber: 'CUS0099', branchId: 'branch-a', createdBy: 'staff-1' });
    expect(h.fdData.customerId).toBe('cust-new');
    expect(provisionCustomerLogin).toHaveBeenCalledWith('cust-new');
  });

  it('refuses a new customer missing the required details', async () => {
    const result = await createFixedDeposit({ newCustomer: { ...newCustomer, phone: '' }, ...terms });
    expect(result.success).toBe(false);
    expect(h.fdData).toBeNull();
  });

  it('refuses when neither a customer nor new details are given', async () => {
    expect((await createFixedDeposit({ ...terms })).success).toBe(false);
  });

  it('refuses an inactive customer', async () => {
    h.customer = { ...h.customer, status: 'BLACKLISTED' };
    expect((await createFixedDeposit({ customerId: 'cust-1', ...terms })).success).toBe(false);
  });

  it('refuses another branch\'s customer', async () => {
    h.scope = 'branch-b';
    expect((await createFixedDeposit({ customerId: 'cust-1', ...terms })).success).toBe(false);
  });

  it('refuses the funding and maturity values the old form sent', async () => {
    expect((await createFixedDeposit({ customerId: 'cust-1', ...terms, fundingMode: 'TRANSFER' })).success).toBe(false);
    expect((await createFixedDeposit({ customerId: 'cust-1', ...terms, maturityInstruction: 'PAYOUT' })).success).toBe(false);
    expect((await createFixedDeposit({ customerId: 'cust-1', ...terms, maturityInstruction: 'ROLLOVER_PRINCIPAL' })).success).toBe(false);
  });

  it('accepts the database\'s own maturity values', async () => {
    for (const maturityInstruction of ['ROLLOVER_PRINCIPAL_ONLY', 'PAY_OUT', 'TRANSFER_TO_SAVINGS']) {
      expect((await createFixedDeposit({ customerId: 'cust-1', ...terms, maturityInstruction })).success).toBe(true);
    }
  });

  it('refuses a zero principal, tenure or rate', async () => {
    expect((await createFixedDeposit({ customerId: 'cust-1', ...terms, principalAmount: 0 })).success).toBe(false);
    expect((await createFixedDeposit({ customerId: 'cust-1', ...terms, tenure: 0 })).success).toBe(false);
    expect((await createFixedDeposit({ customerId: 'cust-1', ...terms, interestRate: 0 })).success).toBe(false);
  });
});
