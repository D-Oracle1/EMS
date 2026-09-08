/**
 * Daily savings interest.
 *
 * What these tests hold in place:
 *   - nothing accrues before the earning start, a month after the deposit;
 *   - the final earning day tops up the rounding so the term pays the
 *     contracted rate exactly;
 *   - credited interest does not itself earn interest, which is what keeps the
 *     total on the contracted rate rather than above it;
 *   - a saver can never be paid twice for the same day.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dec } from './helpers/fixtures';

const h = vi.hoisted(() => {
  const state = {
    accounts: [] as any[],
    dailyRows: [] as any[],
    accountUpdates: [] as any[],
    transactions: [] as any[],
    journalEntries: [] as any[],
    customerNotifications: [] as any[],
    duplicateDay: false,
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;

  const savingsDailyInterest = {
    create: vi.fn(async (args: any) => {
      if (state.duplicateDay) {
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
      }
      state.dailyRows.push(args.data);
      return { id: `di-${state.dailyRows.length}`, ...args.data };
    }),
    update: vi.fn(async (args: any) => args.data),
  };
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
  const customerNotification = {
    create: vi.fn(async (args: any) => {
      state.customerNotifications.push(args.data);
      return { id: `cn-${state.customerNotifications.length}`, ...args.data };
    }),
  };

  const tx = { savingsDailyInterest, savingsAccount, savingsTransaction };

  return {
    prisma: {
      savingsAccount,
      savingsTransaction,
      savingsDailyInterest,
      customerNotification,
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

import {
  runDailySavingsInterest,
  deriveEarningTerms,
  dailyAmountFor,
  addMonthsClamped,
  daysBetween,
  interestTargetFor,
} from '@/lib/savings-daily-interest';

const { state } = h;
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// ── Date arithmetic ─────────────────────────────────────────────────────────

describe('addMonthsClamped', () => {
  it('adds a month normally', () => {
    expect(addMonthsClamped(d('2026-09-08'), 1).toISOString().slice(0, 10)).toBe('2026-10-08');
  });

  it('clamps to the end of a shorter month', () => {
    // 31 January plus one month must be 28 February, not 3 March, or the
    // saver's dormant month is silently stretched.
    expect(addMonthsClamped(d('2026-01-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('handles a leap February', () => {
    expect(addMonthsClamped(d('2028-01-31'), 1).toISOString().slice(0, 10)).toBe('2028-02-29');
  });

  it('rolls across a year', () => {
    expect(addMonthsClamped(d('2026-09-08'), 12).toISOString().slice(0, 10)).toBe('2027-09-08');
  });
});

// ── The earning window ──────────────────────────────────────────────────────

describe('deriveEarningTerms', () => {
  const terms = deriveEarningTerms({
    startDate: d('2026-09-08'), durationMonths: 12, totalRate: 17,
  });

  it('starts earning a month after the deposit', () => {
    expect(terms.earningStartDate.toISOString().slice(0, 10)).toBe('2026-10-08');
  });

  it('matures at the end of the term', () => {
    expect(terms.maturityDate.toISOString().slice(0, 10)).toBe('2027-09-08');
  });

  it('spreads the rate across the earning days only', () => {
    expect(terms.earningDays).toBe(335);
    expect(terms.dailyRate).toBeCloseTo(17 / 335, 9);
  });

  it('sums back to the contracted rate', () => {
    expect(terms.dailyRate * terms.earningDays).toBeCloseTo(17, 6);
  });

  it('gives a one-month plan no earning days rather than dividing by zero', () => {
    const short = deriveEarningTerms({
      startDate: d('2026-09-08'), durationMonths: 1, totalRate: 5,
    });
    expect(short.earningDays).toBe(0);
    expect(short.dailyRate).toBe(0);
  });
});

// ── What to pay on a given day ──────────────────────────────────────────────

describe('dailyAmountFor', () => {
  const base = {
    earningStartDate: d('2026-10-08'),
    maturityDate: d('2027-09-08'),
    eligibleBalance: 1_000_000,
    dailyRate: 17 / 335,
    interestTargetTotal: 170_000,
    interestPaidToDate: 0,
  };

  it('pays nothing before the earning start', () => {
    expect(dailyAmountFor({ ...base, asOf: d('2026-10-07') })).toBeNull();
  });

  it('pays from the earning start', () => {
    const r = dailyAmountFor({ ...base, asOf: d('2026-10-08') });
    expect(r?.amount).toBeCloseTo(507.46, 2);
    expect(r?.isTrueUp).toBe(false);
  });

  it('pays nothing after maturity', () => {
    expect(dailyAmountFor({ ...base, asOf: d('2027-09-09') })).toBeNull();
  });

  it('tops up the shortfall on the final day', () => {
    // 334 ordinary days have been paid; the last day closes the gap.
    const r = dailyAmountFor({
      ...base,
      asOf: d('2027-09-08'),
      interestPaidToDate: 169_491.64,
    });
    expect(r?.isTrueUp).toBe(true);
    expect(r?.amount).toBeCloseTo(508.36, 2);
    expect(169_491.64 + (r?.amount ?? 0)).toBeCloseTo(170_000, 2);
  });

  it('never pays past the contracted total', () => {
    const r = dailyAmountFor({ ...base, asOf: d('2027-01-01'), interestPaidToDate: 169_800 });
    expect(r?.amount).toBeCloseTo(200, 2);
  });

  it('stops once the total has been reached', () => {
    expect(
      dailyAmountFor({ ...base, asOf: d('2027-01-01'), interestPaidToDate: 170_000 })
    ).toBeNull();
  });

  it('pays nothing on a dormant balance', () => {
    expect(dailyAmountFor({ ...base, asOf: d('2026-10-08'), eligibleBalance: 0 })).toBeNull();
  });
});

describe('interestTargetFor', () => {
  it('is the contracted rate applied to the deposit', () => {
    expect(interestTargetFor(1_000_000, 17)).toBe(170_000);
    expect(interestTargetFor(333_333.33, 17)).toBeCloseTo(56_666.67, 2);
  });
});

// ── The run ─────────────────────────────────────────────────────────────────

function account(over: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    accountNumber: 'SAV0001',
    customerId: 'cust-1',
    currentBalance: dec(1_000_000),
    availableBalance: dec(1_000_000),
    eligibleBalance: dec(1_000_000),
    pendingDeposits: dec(0),
    pendingSince: null,
    interestAccrued: dec(0),
    totalDeposits: dec(1_000_000),
    startDate: d('2026-09-08'),
    earningStartDate: d('2026-10-08'),
    maturityDate: d('2027-09-08'),
    earningDays: 335,
    contractedDailyRate: dec(17 / 335),
    contractedTotalRate: dec(17),
    interestTargetTotal: dec(170_000),
    interestPaidToDate: dec(0),
    product: { name: '12-Month Fixed Savings' },
    ...over,
  };
}

beforeEach(() => {
  state.accounts = [];
  state.dailyRows = [];
  state.accountUpdates = [];
  state.transactions = [];
  state.journalEntries = [];
  state.customerNotifications = [];
  state.duplicateDay = false;
});

describe('runDailySavingsInterest', () => {
  it('credits the day to the balance', async () => {
    state.accounts = [account()];
    const result = await runDailySavingsInterest({ asOf: d('2026-11-01') });

    expect(result.processed).toBe(1);
    expect(result.totalInterest).toBeCloseTo(507.46, 2);

    const update = state.accountUpdates[0];
    expect(Number(update.currentBalance)).toBeCloseTo(1_000_507.46, 2);
    expect(Number(update.interestPaidToDate)).toBeCloseTo(507.46, 2);
  });

  it('does not let credited interest earn interest', async () => {
    // The daily rate is calibrated to land on the contracted total, so
    // compounding on top of it would overshoot the rate.
    state.accounts = [account()];
    await runDailySavingsInterest({ asOf: d('2026-11-01') });
    expect(Number(state.accountUpdates[0].eligibleBalance)).toBe(1_000_000);
  });

  it('records a ledger row for the day', async () => {
    state.accounts = [account()];
    await runDailySavingsInterest({ asOf: d('2026-11-01') });
    expect(state.dailyRows).toHaveLength(1);
    expect(state.dailyRows[0].date.toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(state.dailyRows[0].isTrueUp).toBe(false);
  });

  it('tells the saver what landed and what is still to come', async () => {
    state.accounts = [account()];
    await runDailySavingsInterest({ asOf: d('2026-11-01') });

    expect(state.customerNotifications).toHaveLength(1);
    const note = state.customerNotifications[0];
    expect(note.customerId).toBe('cust-1');
    expect(note.title).toMatch(/interest paid today/i);
    expect(note.message).toContain('SAV0001');
    expect(note.message).toMatch(/still to come/i);
  });

  it('posts a balanced journal entry', async () => {
    state.accounts = [account()];
    await runDailySavingsInterest({ asOf: d('2026-11-01') });

    const entry = state.journalEntries[0];
    const debits = entry.lines.reduce((t: number, l: any) => t + Number(l.debitAmount ?? 0), 0);
    const credits = entry.lines.reduce((t: number, l: any) => t + Number(l.creditAmount ?? 0), 0);
    expect(debits).toBeCloseTo(credits, 2);
  });

  it('pays nothing before the earning start', async () => {
    state.accounts = [account()];
    const result = await runDailySavingsInterest({ asOf: d('2026-09-20') });
    expect(result.processed).toBe(0);
    expect(state.transactions).toHaveLength(0);
  });

  it('never pays the same day twice', async () => {
    state.accounts = [account()];
    state.duplicateDay = true;
    const result = await runDailySavingsInterest({ asOf: d('2026-11-01') });
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(state.transactions).toHaveLength(0);
  });

  it('closes the term on exactly the contracted rate', async () => {
    state.accounts = [account({ interestPaidToDate: dec(169_491.64) })];
    const result = await runDailySavingsInterest({ asOf: d('2027-09-08') });

    expect(state.dailyRows[0].isTrueUp).toBe(true);
    expect(Number(state.accountUpdates[0].interestPaidToDate)).toBeCloseTo(170_000, 2);
    expect(result.totalInterest).toBeCloseTo(508.36, 2);
    expect(state.customerNotifications[0].title).toMatch(/final interest/i);
  });

  it('rolls a dormant top-up in once its own month is up', async () => {
    state.accounts = [
      account({
        eligibleBalance: dec(1_000_000),
        pendingDeposits: dec(500_000),
        pendingSince: d('2026-10-15'),
      }),
    ];
    await runDailySavingsInterest({ asOf: d('2026-11-15') });

    const update = state.accountUpdates[0];
    expect(Number(update.eligibleBalance)).toBe(1_500_000);
    expect(Number(update.pendingDeposits)).toBe(0);
    // And the day is paid on the larger base.
    expect(Number(state.dailyRows[0].eligibleBalance)).toBe(1_500_000);
  });

  it('leaves a top-up dormant until its month has passed', async () => {
    state.accounts = [
      account({
        pendingDeposits: dec(500_000),
        pendingSince: d('2026-10-15'),
      }),
    ];
    await runDailySavingsInterest({ asOf: d('2026-11-01') });
    expect(Number(state.dailyRows[0].eligibleBalance)).toBe(1_000_000);
  });

  it('can be run without notifying, for a backfill', async () => {
    state.accounts = [account()];
    const result = await runDailySavingsInterest({ asOf: d('2026-11-01'), notify: false });
    expect(result.processed).toBe(1);
    expect(state.customerNotifications).toHaveLength(0);
  });
});
