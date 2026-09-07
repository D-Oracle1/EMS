/**
 * Customer portal server actions.
 *
 * Customers hold no staff permissions, so every one of these actions carries
 * its own guard: the session must be a customer session, and each record must
 * belong to that customer. These tests pin both, plus the product-limit checks
 * on a self-service loan application.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dec } from './helpers/fixtures';

const h = vi.hoisted(() => {
  const state = {
    sessionUser: null as any,
    sessionError: null as string | null,
    customer: null as any,
    accounts: [] as any[],
    product: null as any,
    sysAdmin: { id: 'sysadmin-1' } as any,
    customerUpdates: [] as any[],
    requestsCreated: [] as any[],
    loansCreated: [] as any[],
    schedules: [] as any[],
    notifications: [] as any[],
    queries: [] as any[],
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;

  const tx = {
    loan: {
      create: vi.fn(async (args: any) => {
        const row = { id: 'loan-new', ...args.data };
        state.loansCreated.push(row);
        return row;
      }),
    },
    loanSchedule: {
      create: vi.fn(async (args: any) => {
        state.schedules.push(args.data);
        return args.data;
      }),
    },
  };

  return {
    prisma: {
      customer: {
        findUnique: vi.fn(async (args: any) => {
          state.queries.push({ model: 'customer.findUnique', where: args.where });
          return state.customer;
        }),
        update: vi.fn(async (args: any) => {
          state.customerUpdates.push({ id: args.where.id, ...args.data });
          return args.data;
        }),
      },
      savingsAccount: {
        findMany: vi.fn(async (args: any) => {
          state.queries.push({ model: 'savingsAccount.findMany', where: args.where });
          return [];
        }),
        findFirst: vi.fn(async (args: any) => {
          state.queries.push({ model: 'savingsAccount.findFirst', where: args.where });
          return state.accounts.find(
            (a) => a.id === args.where.id && a.customerId === args.where.customerId
          ) ?? null;
        }),
      },
      loan: {
        findMany: vi.fn(async (args: any) => {
          state.queries.push({ model: 'loan.findMany', where: args.where });
          return [];
        }),
      },
      fixedDeposit: {
        findMany: vi.fn(async (args: any) => {
          state.queries.push({ model: 'fixedDeposit.findMany', where: args.where });
          return [];
        }),
      },
      loanProduct: {
        findUnique: vi.fn(async () => state.product),
        findMany: vi.fn(async () => (state.product ? [state.product] : [])),
      },
      staff: { findFirst: vi.fn(async () => state.sysAdmin) },
      withdrawalRequest: {
        create: vi.fn(async (args: any) => {
          state.requestsCreated.push(args.data);
          return { id: 'wr-new', ...args.data };
        }),
      },
    },
    withTransaction: vi.fn(async (fn: any) => fn(tx)),
    withRetry: vi.fn(async (fn: any) => fn()),
  };
});

vi.mock('@/lib/auth-utils', () => ({
  getSession: vi.fn(async () => {
    if (h.state.sessionError) throw new Error(h.state.sessionError);
    return { user: h.state.sessionUser };
  }),
  requirePermission: vi.fn(),
  requireAnyPermission: vi.fn(),
}));

vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateReference: vi.fn(async (type: string) => (type === 'LOAN' ? 'LN000777' : 'WDR000777')),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async (n: any) => {
    h.state.notifications.push(n);
  }),
  createNotificationForUsers: vi.fn(async (ids: string[], n: any) => {
    h.state.notifications.push({ ...n, recipients: ids });
  }),
  getUsersWithPermission: vi.fn(async () => ['mgr-1']),
  getUsersWithAnyPermission: vi.fn(async () => ['mgr-1', 'mgr-2']),
}));

import {
  getMyPortalData,
  updateMyProfile,
  requestMyWithdrawal,
  getPortalLoanProducts,
  applyForLoan,
} from '@/actions/portal.actions';

const { state } = h;

const customerSession = { id: 'cust-1', userType: 'customer', email: 'chidi@example.test', firstName: 'Chidi', lastName: 'Eze' };
const staffSession = { id: 'staff-1', userType: 'staff', email: 'ada@hylink.test', firstName: 'Ada', lastName: 'Obi' };

function portalAccount(overrides: Record<string, any> = {}) {
  return {
    id: 'sav-1',
    customerId: 'cust-1',
    accountNumber: 'SAV000001',
    availableBalance: dec(80000),
    status: 'ACTIVE',
    ...overrides,
  };
}

function portalProduct(overrides: Record<string, any> = {}) {
  return {
    id: 'prod-1',
    name: 'Personal Loan',
    code: 'PL',
    isActive: true,
    minAmount: dec(50000),
    maxAmount: dec(2000000),
    minTenure: 3,
    maxTenure: 24,
    interestRate: dec(24),
    interestType: 'REDUCING_BALANCE',
    processingFee: dec(1),
    insuranceFee: dec(0),
    ...overrides,
  };
}

beforeEach(() => {
  state.sessionUser = customerSession;
  state.sessionError = null;
  state.customer = { id: 'cust-1', customerNumber: 'CUS000001', firstName: 'Chidi', branchId: 'branch-1' };
  state.accounts = [portalAccount()];
  state.product = portalProduct();
  state.sysAdmin = { id: 'sysadmin-1' };
  state.customerUpdates = [];
  state.requestsCreated = [];
  state.loansCreated = [];
  state.schedules = [];
  state.notifications = [];
  state.queries = [];
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Session gating
// ---------------------------------------------------------------------------
describe('customer-only gating', () => {
  it('refuses a staff session on the portal dashboard', async () => {
    state.sessionUser = staffSession;

    await expect(getMyPortalData()).rejects.toThrow(/for customers only/);
  });

  it('refuses a staff session on the loan product list', async () => {
    state.sessionUser = staffSession;

    await expect(getPortalLoanProducts()).rejects.toThrow(/for customers only/);
  });

  it('returns the guard as an error result on the write actions', async () => {
    state.sessionUser = staffSession;

    expect(await updateMyProfile({ phone: '0803' })).toMatchObject({ success: false });
    expect((await requestMyWithdrawal({ accountId: 'sav-1', amount: 100 })).error).toMatch(/for customers only/);
    expect((await applyForLoan({ productId: 'prod-1', amount: 100000, tenure: 6 })).error).toMatch(/for customers only/);
  });

  it('propagates an unauthenticated session as a failure, never as data', async () => {
    state.sessionError = 'Not authenticated';

    await expect(getMyPortalData()).rejects.toThrow(/Not authenticated/);
    expect(await updateMyProfile({ phone: '0803' })).toMatchObject({ success: false });
  });
});

// ---------------------------------------------------------------------------
// getMyPortalData — scoping
// ---------------------------------------------------------------------------
describe('getMyPortalData', () => {
  it('scopes every query to the session customer', async () => {
    await getMyPortalData();

    const scoped = state.queries.filter((q) => q.model !== 'customer.findUnique');
    expect(scoped).toHaveLength(3);
    for (const q of scoped) {
      expect(q.where.customerId).toBe('cust-1');
    }
    expect(state.queries.find((q) => q.model === 'customer.findUnique').where.id).toBe('cust-1');
  });

  it('excludes soft-deleted loans and savings accounts', async () => {
    await getMyPortalData();

    expect(state.queries.find((q) => q.model === 'loan.findMany').where.isDeleted).toBe(false);
    expect(state.queries.find((q) => q.model === 'savingsAccount.findMany').where.isDeleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateMyProfile
// ---------------------------------------------------------------------------
describe('updateMyProfile', () => {
  it('rejects a malformed email address', async () => {
    const result = await updateMyProfile({ email: 'not-an-email' });

    expect(result).toMatchObject({ success: false, error: 'Invalid email address' });
    expect(state.customerUpdates).toHaveLength(0);
  });

  it('trims the values it stores', async () => {
    await updateMyProfile({ phone: '  08030000000  ', city: ' Lagos ' });

    expect(state.customerUpdates[0]).toMatchObject({ phone: '08030000000', city: 'Lagos' });
  });

  it('leaves a field untouched when it is submitted empty', async () => {
    await updateMyProfile({ phone: '08030000000', address: '   ' });

    expect(state.customerUpdates[0].address).toBeUndefined();
  });

  it('only ever updates the session customer', async () => {
    await updateMyProfile({ phone: '08030000000' });

    expect(state.customerUpdates[0].id).toBe('cust-1');
  });
});

// ---------------------------------------------------------------------------
// requestMyWithdrawal
// ---------------------------------------------------------------------------
describe('requestMyWithdrawal', () => {
  it('rejects a zero or negative amount', async () => {
    expect((await requestMyWithdrawal({ accountId: 'sav-1', amount: 0 })).error).toMatch(/valid amount/);
    expect((await requestMyWithdrawal({ accountId: 'sav-1', amount: -500 })).error).toMatch(/valid amount/);
  });

  it("refuses an account belonging to another customer", async () => {
    state.accounts = [portalAccount({ id: 'sav-9', customerId: 'cust-other' })];

    const result = await requestMyWithdrawal({ accountId: 'sav-9', amount: 1000 });

    expect(result).toMatchObject({ success: false, error: 'Account not found' });
    expect(state.requestsCreated).toHaveLength(0);
  });

  it('refuses an account that is not active', async () => {
    state.accounts = [portalAccount({ status: 'DORMANT' })];

    const result = await requestMyWithdrawal({ accountId: 'sav-1', amount: 1000 });

    expect(result.error).toMatch(/not active/);
  });

  it('refuses an amount above the available balance', async () => {
    const result = await requestMyWithdrawal({ accountId: 'sav-1', amount: 80001 });

    expect(result.error).toMatch(/exceeds available balance/);
    expect(state.requestsCreated).toHaveLength(0);
  });

  it('allows a request for exactly the available balance', async () => {
    const result = await requestMyWithdrawal({ accountId: 'sav-1', amount: 80000 });

    expect(result.success).toBe(true);
  });

  it('files a PENDING request tagged as customer-initiated', async () => {
    await requestMyWithdrawal({ accountId: 'sav-1', amount: 25000, reason: 'School fees' });

    expect(state.requestsCreated[0]).toMatchObject({
      status: 'PENDING',
      amount: 25000,
      accountId: 'sav-1',
      requestedById: 'sysadmin-1',
    });
    expect(state.requestsCreated[0].reason).toMatch(/^\[Customer portal\] School fees/);
  });

  it('alerts the staff who approve withdrawals', async () => {
    await requestMyWithdrawal({ accountId: 'sav-1', amount: 25000 });

    expect(state.notifications[0]).toMatchObject({ type: 'APPROVAL_REQUIRED', recipients: ['mgr-1', 'mgr-2'] });
  });

  it('fails cleanly when no system officer exists to attribute the request to', async () => {
    state.sysAdmin = null;

    const result = await requestMyWithdrawal({ accountId: 'sav-1', amount: 25000 });

    expect(result.error).toMatch(/temporarily unavailable/);
    expect(state.requestsCreated).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyForLoan
// ---------------------------------------------------------------------------
describe('applyForLoan', () => {
  const application = { productId: 'prod-1', amount: 500000, tenure: 12, purpose: 'Shop expansion' };

  it('refuses an unknown or inactive product', async () => {
    state.product = null;
    expect((await applyForLoan(application)).error).toMatch(/unavailable/);

    state.product = portalProduct({ isActive: false });
    expect((await applyForLoan(application)).error).toMatch(/unavailable/);
  });

  it('enforces the product amount band', async () => {
    expect((await applyForLoan({ ...application, amount: 10000 })).error).toMatch(/Amount must be between/);
    expect((await applyForLoan({ ...application, amount: 3000000 })).error).toMatch(/Amount must be between/);
    expect(state.loansCreated).toHaveLength(0);
  });

  it('enforces the product tenure band', async () => {
    expect((await applyForLoan({ ...application, tenure: 1 })).error).toMatch(/Tenure must be between/);
    expect((await applyForLoan({ ...application, tenure: 36 })).error).toMatch(/Tenure must be between/);
  });

  it('creates the application in DRAFT for staff to pick up', async () => {
    const result = await applyForLoan(application);

    expect(result).toMatchObject({ success: true, data: { loanNumber: 'LN000777' } });
    expect(state.loansCreated[0]).toMatchObject({
      status: 'DRAFT',
      customerId: 'cust-1',
      principalAmount: 500000,
      tenure: 12,
      createdById: 'sysadmin-1',
    });
  });

  it('inherits the customer branch and computes the product fees', async () => {
    await applyForLoan(application);

    expect(state.loansCreated[0]).toMatchObject({ branchId: 'branch-1', processingFee: 5000, insuranceFee: 0 });
  });

  it('writes the full repayment schedule up front', async () => {
    await applyForLoan(application);

    expect(state.schedules).toHaveLength(12);
    expect(state.schedules.at(-1)).toMatchObject({ installmentNumber: 12 });
  });

  it('defaults the purpose when the customer leaves it blank', async () => {
    await applyForLoan({ ...application, purpose: '   ' });

    expect(state.loansCreated[0].purpose).toBe('Customer self-service application');
  });

  it('notifies loan officers that an application arrived', async () => {
    await applyForLoan(application);

    expect(state.notifications[0]).toMatchObject({ title: 'New customer loan application' });
  });

  it('fails cleanly when no system officer exists', async () => {
    state.sysAdmin = null;

    const result = await applyForLoan(application);

    expect(result.error).toMatch(/temporarily unavailable/);
    expect(state.loansCreated).toHaveLength(0);
  });
});
