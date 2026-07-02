import { describe, it, expect, vi } from 'vitest';

// The engine imports these modules at load time; mock them so the module can be
// imported without a DB connection or accounting side effects.
vi.mock('@/lib/prisma', () => ({ prisma: {}, withTransaction: vi.fn() }));
vi.mock('@/lib/accounting-engine', () => ({
  createJournalEntry: vi.fn(),
  getAccountByCode: vi.fn(),
}));
vi.mock('@/lib/utils', () => ({ generateReference: vi.fn() }));

import { __test } from '@/lib/savings-interest-engine';

const { monthsBetween, computeMaturityProgress } = __test;

// ---------------------------------------------------------------------------
// monthsBetween — whole calendar months elapsed
// ---------------------------------------------------------------------------
describe('monthsBetween', () => {
  it('returns 0 within the first month', () => {
    expect(monthsBetween(new Date('2026-01-01'), new Date('2026-01-28'))).toBe(0);
  });

  it('counts a full month only once the day-of-month is reached', () => {
    // Jan 15 -> Feb 14 is not yet a full month
    expect(monthsBetween(new Date('2026-01-15'), new Date('2026-02-14'))).toBe(0);
    // Jan 15 -> Feb 15 is exactly one month
    expect(monthsBetween(new Date('2026-01-15'), new Date('2026-02-15'))).toBe(1);
  });

  it('spans across a year boundary', () => {
    expect(monthsBetween(new Date('2025-11-10'), new Date('2026-02-10'))).toBe(3);
  });

  it('handles leap-year February correctly', () => {
    // 2024 is a leap year. Jan 31 -> Feb 29: day-of-month 29 < 31, so not a full month
    expect(monthsBetween(new Date('2024-01-31'), new Date('2024-02-29'))).toBe(0);
    // Jan 29 -> Feb 29 is a full month
    expect(monthsBetween(new Date('2024-01-29'), new Date('2024-02-29'))).toBe(1);
  });

  it('never returns negative for a future start date', () => {
    expect(monthsBetween(new Date('2026-06-01'), new Date('2026-01-01'))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeMaturityProgress — months completed / remaining, capped at term
// ---------------------------------------------------------------------------
describe('computeMaturityProgress', () => {
  it('returns nulls when there is no start date or duration', () => {
    expect(computeMaturityProgress(null, 4, new Date('2026-06-01'))).toEqual({
      monthsCompleted: 0,
      monthsRemaining: null,
    });
    expect(computeMaturityProgress(new Date('2026-01-01'), null, new Date('2026-06-01'))).toEqual({
      monthsCompleted: 0,
      monthsRemaining: null,
    });
  });

  it('tracks progress partway through a 4-month term', () => {
    const start = new Date('2026-01-10');
    const asOf = new Date('2026-03-10'); // 2 whole months in
    expect(computeMaturityProgress(start, 4, asOf)).toEqual({
      monthsCompleted: 2,
      monthsRemaining: 2,
    });
  });

  it('caps completed at the term length and floors remaining at 0', () => {
    const start = new Date('2026-01-10');
    const asOf = new Date('2026-10-10'); // 9 months elapsed, term is only 4
    expect(computeMaturityProgress(start, 4, asOf)).toEqual({
      monthsCompleted: 4,
      monthsRemaining: 0,
    });
  });

  it('is 0/duration at the very start', () => {
    const start = new Date('2026-01-10');
    expect(computeMaturityProgress(start, 6, start)).toEqual({
      monthsCompleted: 0,
      monthsRemaining: 6,
    });
  });
});

// ---------------------------------------------------------------------------
// Interest business rule (documented expectation of the engine formula)
// ---------------------------------------------------------------------------
describe('monthly interest formula', () => {
  // interest = eligibleBalance × (monthlyRate / 100); same-month deposits sit in
  // pendingDeposits and do not earn interest until they roll into eligibleBalance.
  const interestFor = (eligibleBalance: number, monthlyRate: number) =>
    Math.round(((eligibleBalance * monthlyRate) / 100) * 100) / 100;

  it('earns nothing on a zero eligible balance (first month after deposit)', () => {
    expect(interestFor(0, 1.25)).toBe(0);
  });

  it('computes interest only on the eligible balance', () => {
    // 100,000 eligible @ 1.25%/month = 1,250
    expect(interestFor(100000, 1.25)).toBe(1250);
  });
});
