/**
 * The savings accounts console.
 *
 * The bug this guards against: the list was hard-filtered to
 * `maturityDate != null`, so ordinary savings accounts were invisible on the
 * only page that lists them. An officer could open an account and then never
 * find it again.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dec } from './helpers/fixtures';

const h = vi.hoisted(() => {
  const state = { lastWhere: null as any, rows: [] as any[] };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;
  return {
    prisma: {
      savingsAccount: {
        findMany: vi.fn(async (args: any) => {
          state.lastWhere = args.where;
          return state.rows;
        }),
        count: vi.fn(async () => state.rows.length),
      },
    },
    withTransaction: vi.fn(async (fn: any) => fn({})),
    withRetry: vi.fn(async (fn: any) => fn()),
  };
});

vi.mock('@/lib/auth-utils', () => ({
  requirePermission: vi.fn(async () => ({ id: 'staff-1', permissions: [] })),
  requireAnyPermission: vi.fn(async () => ({ id: 'staff-1', permissions: [] })),
  getSession: vi.fn(async () => ({ user: { id: 'staff-1' } })),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({ notifyCustomerByEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/customer-auth', () => ({ provisionCustomerLogin: vi.fn(async () => undefined) }));
vi.mock('@/lib/customer-registration', () => ({
  createCustomerInTx: vi.fn(),
  validateNewCustomer: vi.fn(() => null),
}));
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async () => undefined),
  createNotificationForUsers: vi.fn(async () => undefined),
  getUsersWithPermission: vi.fn(async () => []),
  getUsersWithAnyPermission: vi.fn(async () => []),
}));
vi.mock('@/lib/accounting-engine', () => ({
  getAccountByCode: vi.fn(async () => null),
  createJournalEntry: vi.fn(async () => ({ id: 'je-1' })),
}));
vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateReference: vi.fn(async () => 'SAV0005'),
}));

import { getSavingsAccountsList } from '@/actions/fixed-savings.actions';

const { state } = h;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    accountNumber: 'SAV0004',
    currentBalance: dec(19_000),
    availableBalance: dec(19_000),
    holdAmount: dec(0),
    eligibleBalance: dec(0),
    pendingDeposits: dec(0),
    totalDeposits: dec(0),
    interestAccrued: dec(0),
    maturityDate: null,
    customer: { customerNumber: 'CUS0005', firstName: 'Ada', lastName: 'Obi', phone: '080' },
    product: { name: 'Regular Savings Account', code: 'SAV-REG', durationMonths: null, totalInterestRate: null, monthlyInterestRate: null },
    ...over,
  };
}

beforeEach(() => {
  state.lastWhere = null;
  state.rows = [];
});

describe('getSavingsAccountsList', () => {
  it('does not filter by maturity date by default', async () => {
    // This is the whole bug: an ordinary account has no maturity date, so any
    // condition on it here hides every one of them.
    await getSavingsAccountsList();
    expect(state.lastWhere.maturityDate).toBeUndefined();
  });

  it('returns ordinary savings accounts', async () => {
    state.rows = [row()];
    const result = await getSavingsAccountsList();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].accountNumber).toBe('SAV0004');
  });

  it('excludes deleted accounts', async () => {
    await getSavingsAccountsList();
    expect(state.lastWhere.isDeleted).toBe(false);
  });

  it('narrows to fixed-term accounts when asked', async () => {
    await getSavingsAccountsList({ kind: 'FIXED' });
    expect(state.lastWhere.maturityDate).toEqual({ not: null });
  });

  it('narrows to ordinary accounts when asked', async () => {
    await getSavingsAccountsList({ kind: 'ORDINARY' });
    expect(state.lastWhere.maturityDate).toBeNull();
  });

  it('still filters by customer, product and status', async () => {
    await getSavingsAccountsList({ customerId: 'c1', productId: 'p1', status: 'ACTIVE' });
    expect(state.lastWhere.customerId).toBe('c1');
    expect(state.lastWhere.productId).toBe('p1');
    expect(state.lastWhere.status).toBe('ACTIVE');
  });
});
