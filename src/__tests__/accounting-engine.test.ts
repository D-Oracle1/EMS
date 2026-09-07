/**
 * Double-entry accounting engine.
 *
 * Every financial transaction in the system funnels through
 * `createJournalEntry`, so these tests pin the invariants the ledger depends
 * on: debits must equal credits, closed periods reject postings, header and
 * inactive accounts are unpostable, and balances move according to each
 * account's normal balance.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dec } from './helpers/fixtures';

const h = vi.hoisted(() => {
  const state = {
    accounts: new Map<string, any>(),
    period: null as any,
    entries: new Map<string, any>(),
    created: [] as any[],
    lines: [] as any[],
    entryUpdates: [] as any[],
    balanceUpdates: [] as any[],
    periodUpserts: [] as any[],
    entryNumber: 0,
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;

  const chartOfAccounts = {
    findMany: vi.fn(async (args: any) => {
      const all = [...state.accounts.values()];
      const ids: string[] | undefined = args?.where?.id?.in;
      if (ids) {
        return all
          .filter((a) => ids.includes(a.id) && a.isActive && !a.isHeader)
          .map((a) => ({ id: a.id }));
      }
      return all
        .filter((a) => a.isActive && !a.isHeader)
        .sort((x, y) => x.accountCode.localeCompare(y.accountCode));
    }),
    findUnique: vi.fn(async (args: any) => {
      if (args.where.accountCode) {
        return [...state.accounts.values()].find((a) => a.accountCode === args.where.accountCode) ?? null;
      }
      return state.accounts.get(args.where.id) ?? null;
    }),
    update: vi.fn(async (args: any) => {
      const account = state.accounts.get(args.where.id);
      state.balanceUpdates.push({ id: args.where.id, ...args.data });
      if (account) account.currentBalance = dec(args.data.currentBalance);
      return account;
    }),
  };

  const journalEntry = {
    create: vi.fn(async (args: any) => {
      const entry = { id: `je-${++state.entryNumber}`, ...args.data };
      state.created.push(entry);
      state.entries.set(entry.id, entry);
      return entry;
    }),
    findUnique: vi.fn(async (args: any) => state.entries.get(args.where.id) ?? null),
    update: vi.fn(async (args: any) => {
      state.entryUpdates.push({ id: args.where.id, ...args.data });
      const entry = state.entries.get(args.where.id);
      if (entry) Object.assign(entry, args.data);
      return entry;
    }),
  };

  const journalEntryLine = {
    create: vi.fn(async (args: any) => {
      state.lines.push(args.data);
      return args.data;
    }),
  };

  const tx = { journalEntry, journalEntryLine, chartOfAccounts };

  return {
    prisma: {
      chartOfAccounts,
      journalEntry,
      journalEntryLine,
      financialPeriod: {
        findUnique: vi.fn(async () => state.period),
        upsert: vi.fn(async (args: any) => {
          state.periodUpserts.push(args);
          return args.create;
        }),
      },
    },
    withTransaction: vi.fn(async (fn: any) => fn(tx)),
  };
});

vi.mock('@/lib/utils', () => ({
  generateReference: vi.fn(async () => 'JNL000001'),
  // Real implementation - trivial, and the engine's period lookup depends on it.
  getFinancialPeriod: (date: Date) => ({ year: date.getFullYear(), month: date.getMonth() + 1 }),
}));

import {
  createJournalEntry,
  postJournalEntry,
  reverseJournalEntry,
  generateTrialBalance,
  closePeriod,
} from '@/lib/accounting-engine';

const { state } = h;

function addAccount(overrides: Record<string, any> & { id: string }) {
  const account = {
    accountCode: overrides.id,
    accountName: `Account ${overrides.id}`,
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    currentBalance: dec(0),
    isActive: true,
    isHeader: false,
    ...overrides,
  };
  state.accounts.set(account.id, account);
  return account;
}

const ENTRY_DATE = new Date('2026-05-20');

function baseEntry(lines: any[], extra: Record<string, unknown> = {}) {
  return {
    entryDate: ENTRY_DATE,
    description: 'Test entry',
    lines,
    createdById: 'staff-1',
    ...extra,
  } as any;
}

beforeEach(() => {
  state.accounts.clear();
  state.entries.clear();
  state.period = null;
  state.created = [];
  state.lines = [];
  state.entryUpdates = [];
  state.balanceUpdates = [];
  state.periodUpserts = [];
  state.entryNumber = 0;
  vi.clearAllMocks();

  addAccount({ id: 'cash', accountCode: '1120', normalBalance: 'DEBIT', currentBalance: dec(1000) });
  addAccount({ id: 'loans', accountCode: '1310', normalBalance: 'DEBIT', currentBalance: dec(500) });
  addAccount({ id: 'deposits', accountCode: '2110', accountType: 'LIABILITY', normalBalance: 'CREDIT', currentBalance: dec(2000) });
  addAccount({ id: 'income', accountCode: '4110', accountType: 'INCOME', normalBalance: 'CREDIT', currentBalance: dec(0) });
});

// ---------------------------------------------------------------------------
// Balance validation - the core double-entry invariant
// ---------------------------------------------------------------------------
describe('createJournalEntry - balance validation', () => {
  it('rejects an entry whose debits do not equal credits', async () => {
    await expect(
      createJournalEntry(baseEntry([
        { accountId: 'cash', debitAmount: 100 },
        { accountId: 'deposits', creditAmount: 99 },
      ]))
    ).rejects.toThrow(/Unbalanced entry/);

    expect(state.created).toHaveLength(0);
  });

  it('names both totals in the unbalanced error', async () => {
    await expect(
      createJournalEntry(baseEntry([
        { accountId: 'cash', debitAmount: 100 },
        { accountId: 'deposits', creditAmount: 60 },
      ]))
    ).rejects.toThrow(/\(100\).*\(60\)/);
  });

  it('rejects a zero-value entry', async () => {
    await expect(
      createJournalEntry(baseEntry([
        { accountId: 'cash', debitAmount: 0 },
        { accountId: 'deposits', creditAmount: 0 },
      ]))
    ).rejects.toThrow(/cannot be zero value/);
  });

  it('rejects an entry with no lines at all', async () => {
    await expect(createJournalEntry(baseEntry([]))).rejects.toThrow(/cannot be zero value/);
  });

  it('accepts a split entry where fractional lines sum exactly', async () => {
    // 33.33 + 33.33 + 33.34 === 100.00 only under decimal arithmetic;
    // binary floating point sums this to 100.00000000000001.
    const result = await createJournalEntry(baseEntry([
      { accountId: 'cash', debitAmount: 33.33 },
      { accountId: 'loans', debitAmount: 33.33 },
      { accountId: 'income', debitAmount: 33.34 },
      { accountId: 'deposits', creditAmount: 100 },
    ]));

    expect(result.totalDebit).toBe(100);
    expect(result.totalCredit).toBe(100);
  });

  it('ignores negative amounts rather than netting them into the totals', async () => {
    // A negative "debit" must not be silently treated as a credit; the entry
    // is unbalanced and must be refused.
    await expect(
      createJournalEntry(baseEntry([
        { accountId: 'cash', debitAmount: -50 },
        { accountId: 'deposits', creditAmount: 50 },
      ]))
    ).rejects.toThrow(/Unbalanced entry/);
  });
});

// ---------------------------------------------------------------------------
// Period gating
// ---------------------------------------------------------------------------
describe('createJournalEntry - period gating', () => {
  const balanced = [
    { accountId: 'cash', debitAmount: 100 },
    { accountId: 'deposits', creditAmount: 100 },
  ];

  it('refuses to post into a HARD_CLOSE period', async () => {
    state.period = { year: 2026, month: 5, status: 'HARD_CLOSE' };

    await expect(createJournalEntry(baseEntry(balanced))).rejects.toThrow(/2026-05 is closed/);
    expect(state.created).toHaveLength(0);
  });

  it('allows posting into a SOFT_CLOSE period', async () => {
    state.period = { year: 2026, month: 5, status: 'SOFT_CLOSE' };

    await expect(createJournalEntry(baseEntry(balanced))).resolves.toMatchObject({ totalDebit: 100 });
  });

  it('allows posting when the period row does not exist yet', async () => {
    state.period = null;

    await expect(createJournalEntry(baseEntry(balanced))).resolves.toMatchObject({ totalDebit: 100 });
  });
});

// ---------------------------------------------------------------------------
// Account validation
// ---------------------------------------------------------------------------
describe('createJournalEntry - account validation', () => {
  it('rejects a posting to a header account and names it', async () => {
    addAccount({ id: 'header', accountCode: '1000', isHeader: true });

    await expect(
      createJournalEntry(baseEntry([
        { accountId: 'header', debitAmount: 100 },
        { accountId: 'deposits', creditAmount: 100 },
      ]))
    ).rejects.toThrow(/Invalid or inactive accounts: header/);
  });

  it('rejects a posting to an inactive account', async () => {
    addAccount({ id: 'retired', accountCode: '1999', isActive: false });

    await expect(
      createJournalEntry(baseEntry([
        { accountId: 'retired', debitAmount: 100 },
        { accountId: 'deposits', creditAmount: 100 },
      ]))
    ).rejects.toThrow(/Invalid or inactive accounts: retired/);
  });

  it('rejects an unknown account id', async () => {
    await expect(
      createJournalEntry(baseEntry([
        { accountId: 'ghost', debitAmount: 100 },
        { accountId: 'deposits', creditAmount: 100 },
      ]))
    ).rejects.toThrow(/Invalid or inactive accounts: ghost/);
  });
});

// ---------------------------------------------------------------------------
// Entry + line persistence
// ---------------------------------------------------------------------------
describe('createJournalEntry - persistence', () => {
  const balanced = [
    { accountId: 'cash', debitAmount: 250, description: 'Cash in' },
    { accountId: 'deposits', creditAmount: 250, description: 'Customer deposit' },
  ];

  it('creates a DRAFT entry and leaves balances untouched when autoPost is off', async () => {
    const result = await createJournalEntry(baseEntry(balanced));

    expect(result.status).toBe('DRAFT');
    expect(state.created[0].postedAt).toBeUndefined();
    expect(state.balanceUpdates).toHaveLength(0);
  });

  it('creates a POSTED entry and moves balances when autoPost is on', async () => {
    const result = await createJournalEntry(baseEntry(balanced, { autoPost: true }));

    expect(result.status).toBe('POSTED');
    expect(state.created[0].postedAt).toBeInstanceOf(Date);
    expect(state.balanceUpdates).toHaveLength(2);
  });

  it('numbers lines sequentially from 1 and defaults the unused side to 0', async () => {
    await createJournalEntry(baseEntry(balanced));

    expect(state.lines.map((l) => l.lineNumber)).toEqual([1, 2]);
    expect(state.lines[0]).toMatchObject({ accountId: 'cash', debitAmount: 250, creditAmount: 0 });
    expect(state.lines[1]).toMatchObject({ accountId: 'deposits', debitAmount: 0, creditAmount: 250 });
  });

  it('carries the generated entry number and source linkage onto the entry', async () => {
    const result = await createJournalEntry(baseEntry(balanced, {
      sourceModule: 'SAVINGS',
      sourceType: 'DEPOSIT',
      savingsAccountId: 'sav-1',
    }));

    expect(result.entryNumber).toBe('JNL000001');
    expect(state.created[0]).toMatchObject({
      sourceModule: 'SAVINGS',
      sourceType: 'DEPOSIT',
      savingsAccountId: 'sav-1',
    });
  });
});

// ---------------------------------------------------------------------------
// Normal-balance arithmetic
// ---------------------------------------------------------------------------
describe('account balance movement', () => {
  it('increases a DEBIT-normal account on debit and decreases it on credit', async () => {
    await createJournalEntry(baseEntry([
      { accountId: 'cash', debitAmount: 300 },
      { accountId: 'loans', creditAmount: 300 },
    ], { autoPost: true }));

    const byId = Object.fromEntries(state.balanceUpdates.map((u) => [u.id, u.currentBalance]));
    expect(byId.cash).toBe(1300);  // 1000 + 300
    expect(byId.loans).toBe(200);  // 500 - 300
  });

  it('increases a CREDIT-normal account on credit and decreases it on debit', async () => {
    await createJournalEntry(baseEntry([
      { accountId: 'deposits', debitAmount: 500 },
      { accountId: 'income', creditAmount: 500 },
    ], { autoPost: true }));

    const byId = Object.fromEntries(state.balanceUpdates.map((u) => [u.id, u.currentBalance]));
    expect(byId.deposits).toBe(1500); // 2000 - 500
    expect(byId.income).toBe(500);    // 0 + 500
  });

  it('keeps fractional balances exact across a posting', async () => {
    addAccount({ id: 'fees', accountCode: '4210', normalBalance: 'CREDIT', currentBalance: dec('0.1') });

    await createJournalEntry(baseEntry([
      { accountId: 'cash', debitAmount: 0.2 },
      { accountId: 'fees', creditAmount: 0.2 },
    ], { autoPost: true }));

    const byId = Object.fromEntries(state.balanceUpdates.map((u) => [u.id, u.currentBalance]));
    expect(byId.fees).toBe(0.3); // not 0.30000000000000004
  });
});

// ---------------------------------------------------------------------------
// postJournalEntry
// ---------------------------------------------------------------------------
describe('postJournalEntry', () => {
  function seedEntry(status: string) {
    const entry = {
      id: 'je-seed',
      entryNumber: 'JNL000009',
      entryDate: ENTRY_DATE,
      status,
      lines: [
        { accountId: 'cash', debitAmount: dec(400), creditAmount: dec(0) },
        { accountId: 'deposits', debitAmount: dec(0), creditAmount: dec(400) },
      ],
    };
    state.entries.set(entry.id, entry);
    return entry;
  }

  it('throws when the entry does not exist', async () => {
    await expect(postJournalEntry('nope', 'staff-2')).rejects.toThrow(/not found/);
  });

  it('refuses to post an already POSTED entry', async () => {
    seedEntry('POSTED');
    await expect(postJournalEntry('je-seed', 'staff-2')).rejects.toThrow(/Cannot post entry with status POSTED/);
  });

  it('refuses to post a REVERSED entry', async () => {
    seedEntry('REVERSED');
    await expect(postJournalEntry('je-seed', 'staff-2')).rejects.toThrow(/Cannot post entry with status REVERSED/);
  });

  it('refuses to post a DRAFT entry into a hard-closed period', async () => {
    seedEntry('DRAFT');
    state.period = { year: 2026, month: 5, status: 'HARD_CLOSE' };

    await expect(postJournalEntry('je-seed', 'staff-2')).rejects.toThrow(/is closed/);
    expect(state.balanceUpdates).toHaveLength(0);
  });

  it('posts a DRAFT entry, stamps the approver, and moves balances', async () => {
    seedEntry('DRAFT');

    await postJournalEntry('je-seed', 'staff-2');

    expect(state.entryUpdates[0]).toMatchObject({ id: 'je-seed', status: 'POSTED', approvedById: 'staff-2' });
    const byId = Object.fromEntries(state.balanceUpdates.map((u) => [u.id, u.currentBalance]));
    expect(byId.cash).toBe(1400);
    expect(byId.deposits).toBe(2400);
  });
});

// ---------------------------------------------------------------------------
// reverseJournalEntry
// ---------------------------------------------------------------------------
describe('reverseJournalEntry', () => {
  function seedPosted(overrides: Record<string, unknown> = {}) {
    const entry = {
      id: 'je-posted',
      entryNumber: 'JNL000005',
      entryDate: ENTRY_DATE,
      status: 'POSTED',
      isReversed: false,
      sourceModule: 'LOANS',
      loanId: 'loan-1',
      savingsAccountId: null,
      fixedDepositId: null,
      branchId: 'branch-1',
      lines: [
        { accountId: 'cash', debitAmount: dec(700), creditAmount: dec(0), description: 'Cash in' },
        { accountId: 'deposits', debitAmount: dec(0), creditAmount: dec(700), description: 'Deposit' },
      ],
      ...overrides,
    };
    state.entries.set(entry.id, entry);
    return entry;
  }

  it('refuses to reverse an entry that is not POSTED', async () => {
    seedPosted({ status: 'DRAFT' });
    await expect(reverseJournalEntry('je-posted', 'error', 'staff-2')).rejects.toThrow(/Only posted entries/);
  });

  it('refuses to reverse the same entry twice', async () => {
    seedPosted({ isReversed: true });
    await expect(reverseJournalEntry('je-posted', 'error', 'staff-2')).rejects.toThrow(/already reversed/);
  });

  it('swaps debits and credits on the reversal entry', async () => {
    seedPosted();

    await reverseJournalEntry('je-posted', 'Wrong customer', 'staff-2');

    expect(state.lines[0]).toMatchObject({ accountId: 'cash', debitAmount: 0, creditAmount: 700 });
    expect(state.lines[1]).toMatchObject({ accountId: 'deposits', debitAmount: 700, creditAmount: 0 });
  });

  it('auto-posts the reversal so balances unwind immediately', async () => {
    seedPosted();

    await reverseJournalEntry('je-posted', 'Wrong customer', 'staff-2');

    const reversal = state.created.find((e) => e.entryType === 'REVERSAL');
    expect(reversal.status).toBe('POSTED');
    const byId = Object.fromEntries(state.balanceUpdates.map((u) => [u.id, u.currentBalance]));
    // Reversal is Cr cash / Dr deposits, so both accounts move against their
    // normal balance: the original Dr cash / Cr deposits posting is unwound.
    expect(byId.cash).toBe(300);      // 1000 - 700 (DEBIT-normal, credited)
    expect(byId.deposits).toBe(1300); // 2000 - 700 (CREDIT-normal, debited)
  });

  it('marks the original entry reversed with the reason and back-reference', async () => {
    seedPosted();

    const reversal = await reverseJournalEntry('je-posted', 'Wrong customer', 'staff-2');

    const update = state.entryUpdates.find((u) => u.id === 'je-posted');
    expect(update).toMatchObject({
      isReversed: true,
      reversalReason: 'Wrong customer',
      reversalEntryId: reversal.id,
    });
  });
});

// ---------------------------------------------------------------------------
// Trial balance
// ---------------------------------------------------------------------------
describe('generateTrialBalance', () => {
  it('balances when every posting was double-entry', async () => {
    state.accounts.get('cash').currentBalance = dec(3000);
    state.accounts.get('loans').currentBalance = dec(0);
    state.accounts.get('deposits').currentBalance = dec(2000);
    state.accounts.get('income').currentBalance = dec(1000);

    const tb = await generateTrialBalance();

    expect(tb.totalDebits).toBe(3000);
    expect(tb.totalCredits).toBe(3000);
    expect(tb.isBalanced).toBe(true);
  });

  it('omits zero-balance accounts from the rows', async () => {
    state.accounts.get('loans').currentBalance = dec(0);

    const tb = await generateTrialBalance();

    expect(tb.rows.map((r) => r.accountCode)).not.toContain('1310');
  });

  it('reports a contra (negative) balance in the opposite column', async () => {
    state.accounts.get('cash').currentBalance = dec(-250);
    state.accounts.get('loans').currentBalance = dec(0);
    state.accounts.get('deposits').currentBalance = dec(0);
    state.accounts.get('income').currentBalance = dec(0);

    const tb = await generateTrialBalance();
    const cash = tb.rows.find((r) => r.accountCode === '1120')!;

    expect(cash.debit).toBe(0);
    expect(cash.credit).toBe(250);
  });

  it('flags an out-of-balance ledger instead of silently reporting it', async () => {
    state.accounts.get('cash').currentBalance = dec(3000);
    state.accounts.get('loans').currentBalance = dec(0);
    state.accounts.get('deposits').currentBalance = dec(10);
    state.accounts.get('income').currentBalance = dec(0);

    const tb = await generateTrialBalance();

    expect(tb.isBalanced).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Period closing
// ---------------------------------------------------------------------------
describe('closePeriod', () => {
  it('refuses to re-close a hard-closed period', async () => {
    state.period = { year: 2026, month: 4, status: 'HARD_CLOSE' };

    await expect(closePeriod(2026, 4, 'SOFT_CLOSE', 'staff-1')).rejects.toThrow(/already hard closed/);
    expect(state.periodUpserts).toHaveLength(0);
  });

  it('upgrades a soft-closed period to a hard close', async () => {
    state.period = { year: 2026, month: 4, status: 'SOFT_CLOSE' };

    await closePeriod(2026, 4, 'HARD_CLOSE', 'staff-1', 'Year-end');

    expect(state.periodUpserts[0].update).toMatchObject({ status: 'HARD_CLOSE', closingNotes: 'Year-end' });
  });

  it('creates the period row with the correct month boundaries when absent', async () => {
    state.period = null;

    await closePeriod(2026, 2, 'SOFT_CLOSE', 'staff-1');

    const { create } = state.periodUpserts[0];
    expect(create.startDate).toEqual(new Date(2026, 1, 1));
    expect(create.endDate).toEqual(new Date(2026, 2, 0)); // 28 Feb 2026
  });
});
