/**
 * Fixed-term savings maturity payout.
 *
 * The rule this file defends: a matured account pays out everything it holds,
 * whichever side of the account the interest was booked to.
 *
 * The two calculation methods book interest in different places. Accrual
 * methods (MATURITY_ONLY, FLAT) leave the balance at the deposits and pile
 * interest into `interestAccrued`. Balance-crediting methods
 * (MONTHLY_ALLOCATION, COMPOUND) do the opposite: interest goes straight into
 * `currentBalance` and `interestAccrued` stays at zero.
 *
 * A payout computed as `totalDeposits + interestAccrued` is therefore correct
 * for the first pair and pays nothing but principal for the second — while
 * zeroing the balance the interest was sitting in. Every seeded plan uses
 * COMPOUND, so that is the case these tests pin hardest.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dec } from './helpers/fixtures';

const h = vi.hoisted(() => {
  const state = {
    accounts: [] as any[],
    accountUpdates: [] as any[],
    transactions: [] as any[],
    journalEntries: [] as any[],
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;
  const savingsAccount = {
    findMany: vi.fn(async () => state.accounts),
    update: vi.fn(async (args: any) => {
      state.accountUpdates.push({ id: args.where.id, ...args.data });
      return args.data;
    }),
  };
  const savingsTransaction = {
    create: vi.fn(async (args: any) => {
      state.transactions.push(args.data);
      return { id: `txn-${state.transactions.length}`, ...args.data };
    }),
  };
  const tx = { savingsAccount, savingsTransaction };
  return {
    prisma: {
      savingsAccount,
      savingsTransaction,
      staff: { findFirst: vi.fn(async () => ({ id: 'sys-1' })) },
    },
    withTransaction: vi.fn(async (fn: any) => fn(tx)),
    withRetry: vi.fn(async (fn: any) => fn()),
  };
});

vi.mock('@/lib/accounting-engine', () => {
  const { state } = h;
  return {
    getAccountByCode: vi.fn(async (code: string) => ({ id: `gl-${code}`, code })),
    createJournalEntry: vi.fn(async (entry: any) => {
      state.journalEntries.push(entry);
      return { id: `je-${state.journalEntries.length}` };
    }),
  };
});

vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateReference: vi.fn(async () => 'STX000001'),
}));

import { processMaturedAccounts } from '@/lib/savings-interest-engine';

const { state } = h;

/** An account that has run its full term. */
function maturedAccount(over: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    accountNumber: 'SAV0001',
    customerId: 'cust-1',
    currentBalance: dec(1_000_000),
    availableBalance: dec(1_000_000),
    interestAccrued: dec(0),
    totalDeposits: dec(1_000_000),
    monthsCompleted: 12,
    startDate: new Date('2025-09-01'),
    maturityDate: new Date('2026-09-01'),
    product: { durationMonths: 12 },
    contractedDurationMonths: 12,
    customer: { id: 'cust-1' },
    ...over,
  };
}

/** Total debits and credits across a journal entry's lines. */
function entryTotals(entry: any) {
  const sum = (k: string) =>
    entry.lines.reduce((t: number, l: any) => t + Number(l[k] ?? 0), 0);
  return { debits: sum('debitAmount'), credits: sum('creditAmount') };
}

beforeEach(() => {
  state.accounts = [];
  state.accountUpdates = [];
  state.transactions = [];
  state.journalEntries = [];
});

// ── Balance-crediting methods (COMPOUND, MONTHLY_ALLOCATION) ────────────────

describe('a COMPOUND account, where interest was credited to the balance', () => {
  beforeEach(() => {
    // 1,000,000 deposited; 168,000 of interest credited into the balance over
    // the term, exactly as runMonthlySavingsInterest does for this method.
    state.accounts = [
      maturedAccount({
        currentBalance: dec(1_168_000),
        availableBalance: dec(1_168_000),
        interestAccrued: dec(0),
        totalDeposits: dec(1_000_000),
      }),
    ];
  });

  it('pays out the deposits AND the credited interest', async () => {
    await processMaturedAccounts({ asOf: new Date('2026-09-02') });
    const payout = state.transactions.find((t) => t.transactionType === 'MATURITY_PAYOUT');
    expect(Number(payout.amount)).toBe(1_168_000);
  });

  it('does not silently drop the interest and pay principal only', async () => {
    await processMaturedAccounts({ asOf: new Date('2026-09-02') });
    const payout = state.transactions.find((t) => t.transactionType === 'MATURITY_PAYOUT');
    expect(Number(payout.amount)).not.toBe(1_000_000);
  });

  it('describes the split honestly in the narration', async () => {
    await processMaturedAccounts({ asOf: new Date('2026-09-02') });
    const payout = state.transactions.find((t) => t.transactionType === 'MATURITY_PAYOUT');
    expect(payout.narration).toContain('1000000.00');
    expect(payout.narration).toContain('168000.00');
  });

  it('clears the savings liability for the whole balance it was carrying', async () => {
    await processMaturedAccounts({ asOf: new Date('2026-09-02') });
    const entry = state.journalEntries[0];
    const liability = entry.lines.find((l: any) => l.accountId === 'gl-2110');
    expect(Number(liability.debitAmount)).toBe(1_168_000);
  });

  it('does not touch interest payable, which never held this interest', async () => {
    await processMaturedAccounts({ asOf: new Date('2026-09-02') });
    const entry = state.journalEntries[0];
    expect(entry.lines.find((l: any) => l.accountId === 'gl-2120')).toBeUndefined();
  });

  it('posts a balanced journal entry', async () => {
    await processMaturedAccounts({ asOf: new Date('2026-09-02') });
    const { debits, credits } = entryTotals(state.journalEntries[0]);
    expect(debits).toBe(credits);
    expect(debits).toBe(1_168_000);
  });
});

// ── Accrual methods (MATURITY_ONLY, FLAT) ───────────────────────────────────

describe('a MATURITY_ONLY account, where interest was accrued separately', () => {
  beforeEach(() => {
    state.accounts = [
      maturedAccount({
        currentBalance: dec(1_000_000),
        availableBalance: dec(1_000_000),
        interestAccrued: dec(155_833.37),
        totalDeposits: dec(1_000_000),
      }),
    ];
  });

  it('pays deposits plus the accrued interest', async () => {
    await processMaturedAccounts({ asOf: new Date('2026-09-02') });
    const payout = state.transactions.find((t) => t.transactionType === 'MATURITY_PAYOUT');
    expect(Number(payout.amount)).toBeCloseTo(1_155_833.37, 2);
  });

  it('splits the journal entry between liability and interest payable', async () => {
    await processMaturedAccounts({ asOf: new Date('2026-09-02') });
    const entry = state.journalEntries[0];
    const liability = entry.lines.find((l: any) => l.accountId === 'gl-2110');
    const payable = entry.lines.find((l: any) => l.accountId === 'gl-2120');
    expect(Number(liability.debitAmount)).toBe(1_000_000);
    expect(Number(payable.debitAmount)).toBeCloseTo(155_833.37, 2);
  });

  it('posts a balanced journal entry', async () => {
    await processMaturedAccounts({ asOf: new Date('2026-09-02') });
    const { debits, credits } = entryTotals(state.journalEntries[0]);
    expect(debits).toBeCloseTo(credits, 2);
  });
});

// ── Common behaviour ────────────────────────────────────────────────────────

describe('closing the account', () => {
  beforeEach(() => {
    state.accounts = [maturedAccount({ currentBalance: dec(1_168_000), totalDeposits: dec(1_000_000) })];
  });

  it('marks it completed and zeroes the balance', async () => {
    const result = await processMaturedAccounts({ asOf: new Date('2026-09-02') });
    expect(result.matured).toBe(1);
    const update = state.accountUpdates[0];
    expect(update.status).toBe('COMPLETED');
    expect(update.currentBalance).toBe(0);
    expect(update.monthsRemaining).toBe(0);
  });

  it('leaves nothing behind when there is no interest at all', async () => {
    state.accounts = [
      maturedAccount({
        currentBalance: dec(1_000_000),
        interestAccrued: dec(0),
        totalDeposits: dec(1_000_000),
      }),
    ];
    await processMaturedAccounts({ asOf: new Date('2026-09-02') });
    const payout = state.transactions.find((t) => t.transactionType === 'MATURITY_PAYOUT');
    expect(Number(payout.amount)).toBe(1_000_000);
    const { debits, credits } = entryTotals(state.journalEntries[0]);
    expect(debits).toBe(credits);
  });
});
