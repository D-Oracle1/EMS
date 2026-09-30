/**
 * Expenses.
 *
 * The lines this file holds:
 *  - Only the accountant records; only an admin (level 85+ or the superuser)
 *    approves; nobody approves what they recorded.
 *  - Nothing reaches the ledger until approval. Approval posts exactly one
 *    balanced entry: Dr the expense account, Cr the cash/bank account, tagged
 *    with the expense's branch.
 *  - A failed posting (a closed period, say) returns the expense to the queue.
 *  - Categories must be expense accounts; "paid from" must be cash or bank.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: { user: {} as any },
  accounts: {} as Record<string, any>,
  expense: null as any,
  created: null as any,
  claimCount: 1,
  updates: [] as any[],
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chartOfAccounts: { findUnique: vi.fn(async ({ where }: any) => h.accounts[where.id] ?? null) },
    branch: { findUnique: vi.fn(async () => ({ id: 'branch-a' })) },
    staff: { findMany: vi.fn(async () => [{ id: 'boss-1' }]) },
    expense: {
      create: vi.fn(async ({ data }: any) => { h.created = data; return { id: 'exp-new', ...data }; }),
      findUnique: vi.fn(async () => h.expense),
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
  generateReference: vi.fn(async () => 'EXP0001'),
}));
vi.mock('@/lib/accounting-engine', () => ({
  createJournalEntry: vi.fn(async () => ({ id: 'je-9', entryNumber: 'JNL0009' })),
}));

import { recordExpense, approveExpense, rejectExpense } from '@/actions/expense.actions';
import { createJournalEntry } from '@/lib/accounting-engine';
import { canRecordExpenses, canApproveExpenses, isPaymentAccountCode } from '@/lib/expense-access';

const accountant = { id: 'acct-1', firstName: 'Ann', lastName: 'Acct', permissions: ['ACCOUNTS:JOURNAL_CREATE', 'ACCOUNTS:JOURNAL_POST'], roleLevel: 60 };
const gm = { id: 'gm-1', firstName: 'Gee', lastName: 'Em', permissions: [], roleLevel: 85 };

const input = {
  expenseDate: '2026-09-15', amount: 45_000, payee: 'Ikeja Electric', description: 'September power bill',
  expenseAccountId: 'acc-rent', paymentAccountId: 'acc-bank', paymentMode: 'BANK_TRANSFER', branchId: 'branch-a',
};

beforeEach(() => {
  h.session = { user: accountant };
  h.accounts = {
    'acc-rent': { id: 'acc-rent', accountCode: '5210', accountName: 'Rent & Utilities', accountType: 'EXPENSE', isHeader: false, isActive: true },
    'acc-bank': { id: 'acc-bank', accountCode: '1120', accountName: 'Cash at Bank', accountType: 'ASSET', isHeader: false, isActive: true },
    'acc-loans': { id: 'acc-loans', accountCode: '1310', accountName: 'Loans Receivable', accountType: 'ASSET', isHeader: false, isActive: true },
    'acc-admin-header': { id: 'acc-admin-header', accountCode: '5200', accountName: 'Administrative', accountType: 'EXPENSE', isHeader: true, isActive: true },
  };
  h.expense = {
    id: 'exp-1', reference: 'EXP0001', status: 'PENDING', recordedById: 'acct-1', amount: 45_000,
    expenseDate: new Date('2026-09-15'), payee: 'Ikeja Electric', description: 'September power bill',
    expenseAccountId: 'acc-rent', paymentAccountId: 'acc-bank', branchId: 'branch-a',
    expenseAccount: h.accounts['acc-rent'], paymentAccount: h.accounts['acc-bank'],
  };
  h.created = null;
  h.claimCount = 1;
  h.updates = [];
  vi.mocked(createJournalEntry).mockClear();
});

describe('rules', () => {
  it('the accountant records; admins at 85+ or the superuser approve', () => {
    expect(canRecordExpenses(accountant)).toBe(true);
    expect(canApproveExpenses(accountant)).toBe(false);
    expect(canApproveExpenses(gm)).toBe(true);
    expect(canApproveExpenses({ permissions: ['ADMIN:SYSTEM'], roleLevel: 0 })).toBe(true);
    expect(canApproveExpenses({ permissions: [], roleLevel: 80 })).toBe(false);
  });

  it('pays only from cash and bank accounts (11xx, not the 1100 header)', () => {
    expect(isPaymentAccountCode('1110')).toBe(true);
    expect(isPaymentAccountCode('1120')).toBe(true);
    expect(isPaymentAccountCode('1100')).toBe(false);
    expect(isPaymentAccountCode('1310')).toBe(false);
  });
});

describe('recordExpense', () => {
  it('refuses anyone who is not the accountant', async () => {
    h.session = { user: gm };
    expect((await recordExpense(input)).success).toBe(false);
    expect(h.created).toBeNull();
  });

  it('records a pending expense and posts nothing', async () => {
    const result = await recordExpense(input);
    expect(result.success).toBe(true);
    expect(h.created).toMatchObject({ amount: 45_000, branchId: 'branch-a', recordedById: 'acct-1' });
    expect(h.created).not.toHaveProperty('status');
    expect(createJournalEntry).not.toHaveBeenCalled();
  });

  it('records head office when no branch is given', async () => {
    await recordExpense({ ...input, branchId: null });
    expect(h.created.branchId).toBeNull();
  });

  it('refuses a header account or a non-expense account as the category', async () => {
    expect((await recordExpense({ ...input, expenseAccountId: 'acc-admin-header' })).success).toBe(false);
    expect((await recordExpense({ ...input, expenseAccountId: 'acc-bank' })).success).toBe(false);
  });

  it('refuses paying from anything but cash or bank', async () => {
    expect((await recordExpense({ ...input, paymentAccountId: 'acc-loans' })).success).toBe(false);
  });

  it('refuses a zero amount, a missing payee or a future date', async () => {
    expect((await recordExpense({ ...input, amount: 0 })).success).toBe(false);
    expect((await recordExpense({ ...input, payee: ' ' })).success).toBe(false);
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    expect((await recordExpense({ ...input, expenseDate: future })).success).toBe(false);
  });
});

describe('approveExpense', () => {
  beforeEach(() => { h.session = { user: gm }; });

  it('refuses the accountant', async () => {
    h.session = { user: accountant };
    expect((await approveExpense('exp-1')).success).toBe(false);
    expect(createJournalEntry).not.toHaveBeenCalled();
  });

  it('refuses an expense the approver recorded', async () => {
    h.expense = { ...h.expense, recordedById: 'gm-1' };
    expect((await approveExpense('exp-1')).success).toBe(false);
    expect(createJournalEntry).not.toHaveBeenCalled();
  });

  it('posts one balanced entry: Dr expense, Cr cash/bank, on the expense\'s branch and date', async () => {
    const result = await approveExpense('exp-1');
    expect(result.success).toBe(true);
    expect(createJournalEntry).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(createJournalEntry).mock.calls[0][0] as any;
    expect(entry).toMatchObject({ branchId: 'branch-a', entryDate: new Date('2026-09-15'), sourceModule: 'EXPENSES', autoPost: true });
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountId: 'acc-rent', debitAmount: 45_000 }),
      expect.objectContaining({ accountId: 'acc-bank', creditAmount: 45_000 }),
    ]);
    expect(h.updates.at(-1).data).toMatchObject({ status: 'APPROVED', journalEntryId: 'je-9' });
  });

  it('claims the expense first, so it cannot be posted twice', async () => {
    h.claimCount = 0;
    expect((await approveExpense('exp-1')).success).toBe(false);
    expect(createJournalEntry).not.toHaveBeenCalled();
  });

  it('returns the expense to the queue when posting fails', async () => {
    vi.mocked(createJournalEntry).mockRejectedValueOnce(new Error('Accounting period 2026-09 is closed'));
    const result = await approveExpense('exp-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('closed');
    expect(h.updates.at(-1)).toMatchObject({ kind: 'update', data: { status: 'PENDING', reviewedById: null } });
  });
});

describe('rejectExpense', () => {
  beforeEach(() => { h.session = { user: gm }; });

  it('needs a reason and posts nothing', async () => {
    expect((await rejectExpense('exp-1', '')).success).toBe(false);
    const result = await rejectExpense('exp-1', 'No receipt attached');
    expect(result.success).toBe(true);
    expect(createJournalEntry).not.toHaveBeenCalled();
    expect(h.updates[0]).toMatchObject({ where: { id: 'exp-1', status: 'PENDING' }, data: { status: 'REJECTED' } });
  });
});
