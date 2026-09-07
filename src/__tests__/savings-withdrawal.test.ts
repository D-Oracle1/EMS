/**
 * Savings withdrawals: balance guards, daily limits, and the approval hold.
 *
 * The hold is the part most worth pinning down — an approval request must ring-
 * fence the money on `holdAmount`/`availableBalance`, a rejection must release
 * exactly that hold, and an approval must release it while debiting the
 * balance once (never twice).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dec, sessionUser } from './helpers/fixtures';

const h = vi.hoisted(() => {
  const state = {
    account: null as any,
    request: null as any,
    todayWithdrawn: null as any,
    user: null as any,
    permissionError: null as string | null,
    accountUpdates: [] as any[],
    transactions: [] as any[],
    requestsCreated: [] as any[],
    requestUpdates: [] as any[],
    journalEntries: [] as any[],
    notifications: [] as any[],
    glAccounts: new Map<string, any>(),
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;

  const savingsAccount = {
    findUnique: vi.fn(async () => state.account),
    update: vi.fn(async (args: any) => {
      state.accountUpdates.push({ id: args.where.id, ...args.data });
      return args.data;
    }),
  };
  const savingsTransaction = {
    create: vi.fn(async (args: any) => {
      const row = { id: `txn-${state.transactions.length + 1}`, ...args.data };
      state.transactions.push(row);
      return row;
    }),
    aggregate: vi.fn(async () => ({ _sum: { amount: state.todayWithdrawn } })),
  };
  const withdrawalRequest = {
    create: vi.fn(async (args: any) => {
      state.requestsCreated.push(args.data);
      return { id: 'wr-new', ...args.data };
    }),
    findUnique: vi.fn(async () => state.request),
    update: vi.fn(async (args: any) => {
      state.requestUpdates.push({ id: args.where.id, ...args.data });
      return args.data;
    }),
  };

  const tx = { savingsAccount, savingsTransaction, withdrawalRequest };

  return {
    prisma: {
      savingsAccount,
      savingsTransaction,
      withdrawalRequest,
      staff: { findMany: vi.fn(async () => [{ id: 'mgr-1' }]), findFirst: vi.fn(async () => ({ id: 'mgr-1' })) },
      $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
    },
    withTransaction: vi.fn(async (fn: any) => fn(tx)),
    withRetry: vi.fn(async (fn: any) => fn()),
  };
});

vi.mock('@/lib/auth-utils', () => {
  const { state } = h;
  const resolve = async () => {
    if (state.permissionError) throw new Error(state.permissionError);
    return state.user;
  };
  return {
    requirePermission: vi.fn(resolve),
    requireAnyPermission: vi.fn(resolve),
    getSession: vi.fn(async () => ({ user: await resolve() })),
  };
});

vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateReference: vi.fn(async (type: string) => (type === 'SAVINGS_TXN' ? 'STX000001' : 'WDR000001')),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({ notifyCustomerByEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/customer-auth', () => ({ provisionCustomerLogin: vi.fn(async () => undefined) }));
vi.mock('@/lib/customer-registration', () => ({
  createCustomerInTx: vi.fn(),
  validateNewCustomer: vi.fn(() => null),
}));
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async (n: any) => {
    h.state.notifications.push(n);
  }),
  createNotificationForUsers: vi.fn(async (ids: string[], n: any) => {
    h.state.notifications.push({ ...n, recipients: ids });
  }),
  getUsersWithPermission: vi.fn(async () => ['mgr-1']),
  getUsersWithAnyPermission: vi.fn(async () => ['mgr-1']),
}));
vi.mock('@/lib/accounting-engine', () => ({
  createJournalEntry: vi.fn(async (entry: any) => {
    h.state.journalEntries.push(entry);
    return { id: 'je-1', entryNumber: 'JNL000001' };
  }),
  getAccountByCode: vi.fn(async (code: string) => h.state.glAccounts.get(code) ?? null),
}));

import { processWithdrawal, requestWithdrawal, processWithdrawalRequest } from '@/actions/savings.actions';

const { state } = h;

function savingsAccount(overrides: Record<string, any> = {}) {
  const { product, ...rest } = overrides;
  return {
    id: 'sav-1',
    accountNumber: 'SAV000001',
    customerId: 'cust-1',
    status: 'ACTIVE',
    currentBalance: dec(100000),
    availableBalance: dec(100000),
    holdAmount: dec(0),
    customer: { id: 'cust-1', firstName: 'Chidi', lastName: 'Eze', email: 'chidi@example.test' },
    product: {
      id: 'prod-1',
      name: 'Regular Savings',
      allowWithdrawal: true,
      minBalance: dec(1000),
      maxDailyWithdrawal: dec(50000),
      ...(product ?? {}),
    },
    ...rest,
  };
}

beforeEach(() => {
  state.account = savingsAccount();
  state.request = null;
  state.todayWithdrawn = null;
  state.permissionError = null;
  state.user = sessionUser({ id: 'teller-1', roleCode: 'ACCOUNTS_OFFICER' });
  state.accountUpdates = [];
  state.transactions = [];
  state.requestsCreated = [];
  state.requestUpdates = [];
  state.journalEntries = [];
  state.notifications = [];
  state.glAccounts = new Map([
    ['1110', { id: 'gl-cash' }],
    ['2110', { id: 'gl-savings' }],
  ]);
  vi.clearAllMocks();
});

const withdrawalInput = { accountId: 'sav-1', amount: 20000, paymentMode: 'CASH' };

// ---------------------------------------------------------------------------
// processWithdrawal — direct debit path
// ---------------------------------------------------------------------------
describe('processWithdrawal', () => {
  it('surfaces a permission failure without touching the balance', async () => {
    state.permissionError = 'Permission denied: SAVINGS:WITHDRAW';

    const result = await processWithdrawal(withdrawalInput);

    expect(result.success).toBe(false);
    expect(state.accountUpdates).toHaveLength(0);
  });

  it('refuses an unknown account', async () => {
    state.account = null;

    const result = await processWithdrawal(withdrawalInput);

    expect(result).toMatchObject({ success: false, error: 'Account not found' });
  });

  it('refuses a dormant account', async () => {
    state.account = savingsAccount({ status: 'DORMANT' });

    const result = await processWithdrawal(withdrawalInput);

    expect(result.error).toMatch(/not active/);
  });

  it('refuses a product that does not permit withdrawals', async () => {
    state.account = savingsAccount({ product: { allowWithdrawal: false } });

    const result = await processWithdrawal(withdrawalInput);

    expect(result.error).toMatch(/Withdrawals not allowed/);
    expect(state.transactions).toHaveLength(0);
  });

  it('refuses a withdrawal that would breach the minimum balance', async () => {
    state.account = savingsAccount({ currentBalance: dec(20500) });

    const result = await processWithdrawal(withdrawalInput); // leaves 500, floor is 1000

    expect(result.error).toMatch(/minimum balance/);
    expect(state.accountUpdates).toHaveLength(0);
  });

  it('allows a withdrawal that lands exactly on the minimum balance', async () => {
    state.account = savingsAccount({ currentBalance: dec(21000), product: { maxDailyWithdrawal: null } });

    const result = await processWithdrawal(withdrawalInput);

    expect(result.success).toBe(true);
    expect(state.accountUpdates[0].currentBalance).toBe(1000);
  });

  it('counts earlier withdrawals the same day against the daily limit', async () => {
    state.todayWithdrawn = dec(35000); // + 20,000 requested > 50,000 limit

    const result = await processWithdrawal(withdrawalInput);

    expect(result.error).toMatch(/Daily withdrawal limit/);
    expect(state.transactions).toHaveLength(0);
  });

  it('allows a withdrawal that exactly reaches the daily limit', async () => {
    state.todayWithdrawn = dec(30000); // + 20,000 === 50,000

    const result = await processWithdrawal(withdrawalInput);

    expect(result.success).toBe(true);
  });

  it('skips the daily-limit check when the product sets no limit', async () => {
    state.account = savingsAccount({ product: { maxDailyWithdrawal: null } });

    const result = await processWithdrawal({ ...withdrawalInput, amount: 90000 });

    expect(result.success).toBe(true);
  });

  it('writes the transaction with before/after balances and syncs available balance', async () => {
    await processWithdrawal(withdrawalInput);

    expect(state.transactions[0]).toMatchObject({
      transactionType: 'WITHDRAWAL',
      amount: 20000,
      balanceBefore: 100000,
      balanceAfter: 80000,
      processedById: 'teller-1',
    });
    expect(state.accountUpdates[0]).toMatchObject({ currentBalance: 80000, availableBalance: 80000 });
  });

  it('posts Dr savings liability / Cr cash for the withdrawal', async () => {
    await processWithdrawal(withdrawalInput);

    const entry = state.journalEntries[0];
    expect(entry.autoPost).toBe(true);
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountId: 'gl-savings', debitAmount: 20000 }),
      expect.objectContaining({ accountId: 'gl-cash', creditAmount: 20000 }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// requestWithdrawal — routing between direct debit and approval hold
// ---------------------------------------------------------------------------
describe('requestWithdrawal', () => {
  it('processes immediately when the amount is within the approval threshold', async () => {
    const result = await requestWithdrawal({ accountId: 'sav-1', amount: 20000, paymentMode: 'CASH' });

    expect(result.success).toBe(true);
    expect(state.transactions).toHaveLength(1);
    expect(state.requestsCreated).toHaveLength(0);
  });

  it('raises an approval request above the threshold instead of paying out', async () => {
    const result = await requestWithdrawal({ accountId: 'sav-1', amount: 60000, paymentMode: 'CASH' });

    expect(result.message).toMatch(/submitted for approval/);
    expect(state.transactions).toHaveLength(0);
    expect(state.requestsCreated[0]).toMatchObject({ amount: 60000, requestedById: 'teller-1' });
  });

  it('places a hold that ring-fences the requested amount', async () => {
    await requestWithdrawal({ accountId: 'sav-1', amount: 60000, paymentMode: 'CASH' });

    expect(state.accountUpdates[0]).toMatchObject({
      id: 'sav-1',
      holdAmount: { increment: 60000 },
      availableBalance: { decrement: 60000 },
    });
  });

  it('leaves the ledger balance alone while the request is pending', async () => {
    await requestWithdrawal({ accountId: 'sav-1', amount: 60000, paymentMode: 'CASH' });

    expect(state.accountUpdates[0].currentBalance).toBeUndefined();
    expect(state.journalEntries).toHaveLength(0);
  });

  it('falls back to a 50,000 threshold when the product sets no daily limit', async () => {
    state.account = savingsAccount({ product: { maxDailyWithdrawal: null } });

    await requestWithdrawal({ accountId: 'sav-1', amount: 50001, paymentMode: 'CASH' });

    expect(state.requestsCreated).toHaveLength(1);
  });

  it('still enforces the minimum balance before raising a request', async () => {
    state.account = savingsAccount({ currentBalance: dec(60500) });

    const result = await requestWithdrawal({ accountId: 'sav-1', amount: 60000, paymentMode: 'CASH' });

    expect(result.error).toMatch(/minimum balance/);
    expect(state.requestsCreated).toHaveLength(0);
  });

  it('alerts the approvers that a request is waiting', async () => {
    await requestWithdrawal({ accountId: 'sav-1', amount: 60000, paymentMode: 'CASH' });

    expect(state.notifications[0]).toMatchObject({ userId: 'mgr-1', title: 'Withdrawal Approval Required' });
  });
});

// ---------------------------------------------------------------------------
// processWithdrawalRequest — releasing the hold
// ---------------------------------------------------------------------------
describe('processWithdrawalRequest', () => {
  function pendingRequest(overrides: Record<string, any> = {}) {
    return {
      id: 'wr-1',
      requestNumber: 'WDR000001',
      accountId: 'sav-1',
      amount: dec(60000),
      status: 'PENDING',
      paymentMode: 'CASH',
      paymentReference: null,
      requestedById: 'teller-1',
      account: savingsAccount({ holdAmount: dec(60000), availableBalance: dec(40000) }),
      ...overrides,
    };
  }

  beforeEach(() => {
    state.request = pendingRequest();
    state.user = sessionUser({ id: 'mgr-1', roleCode: 'BRANCH_MANAGER' });
  });

  it('refuses an unknown request', async () => {
    state.request = null;

    const result = await processWithdrawalRequest({ requestId: 'wr-1', decision: 'APPROVED' });

    expect(result).toMatchObject({ success: false, error: 'Request not found' });
  });

  it('refuses a request that was already processed', async () => {
    state.request = pendingRequest({ status: 'PROCESSED' });

    const result = await processWithdrawalRequest({ requestId: 'wr-1', decision: 'APPROVED' });

    expect(result.error).toMatch(/not pending/);
    expect(state.accountUpdates).toHaveLength(0);
  });

  it('blocks the requester from approving their own request', async () => {
    state.user = sessionUser({ id: 'teller-1' });

    const result = await processWithdrawalRequest({ requestId: 'wr-1', decision: 'APPROVED' });

    expect(result.error).toMatch(/cannot approve your own withdrawal request/i);
    expect(state.transactions).toHaveLength(0);
  });

  it('releases the hold in full on rejection without moving money', async () => {
    const result = await processWithdrawalRequest({
      requestId: 'wr-1',
      decision: 'REJECTED',
      rejectionReason: 'Signature mismatch',
    });

    expect(result.success).toBe(true);
    expect(state.accountUpdates[0]).toMatchObject({
      holdAmount: { decrement: state.request.amount },
      availableBalance: { increment: state.request.amount },
    });
    expect(state.transactions).toHaveLength(0);
    expect(state.journalEntries).toHaveLength(0);
  });

  it('records the rejection reason and notifies the requester', async () => {
    await processWithdrawalRequest({ requestId: 'wr-1', decision: 'REJECTED', rejectionReason: 'Signature mismatch' });

    expect(state.requestUpdates[0]).toMatchObject({ status: 'REJECTED', rejectionReason: 'Signature mismatch' });
    expect(state.notifications[0]).toMatchObject({ userId: 'teller-1', title: 'Withdrawal Rejected' });
  });

  it('debits the balance once and clears the hold on approval', async () => {
    const result = await processWithdrawalRequest({ requestId: 'wr-1', decision: 'APPROVED' });

    expect(result.success).toBe(true);
    expect(state.accountUpdates).toHaveLength(1);
    expect(state.accountUpdates[0]).toMatchObject({
      currentBalance: 40000,   // 100,000 - 60,000
      availableBalance: 40000, // hold released, balance debited
      holdAmount: { decrement: state.request.amount },
    });
  });

  it('links the resulting transaction to the request', async () => {
    await processWithdrawalRequest({ requestId: 'wr-1', decision: 'APPROVED' });

    expect(state.transactions[0]).toMatchObject({ transactionType: 'WITHDRAWAL', balanceBefore: 100000, balanceAfter: 40000 });
    expect(state.requestUpdates[0]).toMatchObject({ status: 'PROCESSED', approvedById: 'mgr-1', transactionId: 'txn-1' });
  });

  it('posts the approved withdrawal to the ledger', async () => {
    await processWithdrawalRequest({ requestId: 'wr-1', decision: 'APPROVED' });

    const entry = state.journalEntries[0];
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountId: 'gl-savings', debitAmount: 60000 }),
      expect.objectContaining({ accountId: 'gl-cash', creditAmount: 60000 }),
    ]);
  });
});
