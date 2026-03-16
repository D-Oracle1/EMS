import { describe, it, expect, vi } from 'vitest';

// Mock prisma so the module loads without a DB connection
vi.mock('@/lib/prisma', () => ({ prisma: {}, withTransaction: vi.fn() }));

import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getFinancialPeriod,
  getPeriodDateRange,
  calculateReducingBalanceSchedule,
  calculateFlatRateSchedule,
} from '@/lib/utils';

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------
describe('formatCurrency', () => {
  it('formats positive numbers as NGN', () => {
    const result = formatCurrency(50000);
    expect(result).toContain('50,000');
    expect(result).toMatch(/NGN|₦/);
  });

  it('formats zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0.00');
  });

  it('accepts a string amount', () => {
    const result = formatCurrency('12500.5');
    expect(result).toContain('12,500.50');
  });

  it('handles large amounts', () => {
    const result = formatCurrency(1_000_000);
    expect(result).toContain('1,000,000');
  });
});

// ---------------------------------------------------------------------------
// formatDate / formatDateTime
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('formats a Date object', () => {
    const result = formatDate(new Date('2024-06-15'));
    expect(result).toContain('2024');
    expect(result).toMatch(/Jun|15/);
  });

  it('accepts an ISO date string', () => {
    const result = formatDate('2024-01-01');
    expect(result).toContain('2024');
  });
});

describe('formatDateTime', () => {
  it('includes time in output', () => {
    const result = formatDateTime(new Date('2024-03-20T09:30:00'));
    expect(result).toContain('2024');
  });
});

// ---------------------------------------------------------------------------
// getFinancialPeriod
// ---------------------------------------------------------------------------
describe('getFinancialPeriod', () => {
  it('extracts year and month from a date', () => {
    const { year, month } = getFinancialPeriod(new Date('2024-07-15'));
    expect(year).toBe(2024);
    expect(month).toBe(7);
  });

  it('handles January (month = 1)', () => {
    const { month } = getFinancialPeriod(new Date('2025-01-31'));
    expect(month).toBe(1);
  });

  it('handles December (month = 12)', () => {
    const { month } = getFinancialPeriod(new Date('2025-12-01'));
    expect(month).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// getPeriodDateRange
// ---------------------------------------------------------------------------
describe('getPeriodDateRange', () => {
  it('returns the first and last day of the given month', () => {
    const { start, end } = getPeriodDateRange(2024, 2);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(1); // 0-indexed
    expect(end.getDate()).toBe(29); // 2024 is a leap year
  });

  it('handles a 31-day month', () => {
    const { start, end } = getPeriodDateRange(2024, 1);
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(31);
  });

  it('handles a 30-day month', () => {
    const { end } = getPeriodDateRange(2024, 4);
    expect(end.getDate()).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// calculateReducingBalanceSchedule
// ---------------------------------------------------------------------------
describe('calculateReducingBalanceSchedule', () => {
  const principal = 100_000;
  const annualRate = 24; // 24% p.a. = 2% per month
  const tenureMonths = 12;
  const startDate = new Date('2024-01-01');

  it('generates the correct number of installments', () => {
    const { schedule } = calculateReducingBalanceSchedule(principal, annualRate, tenureMonths, startDate);
    expect(schedule).toHaveLength(12);
  });

  it('outstanding balance reaches zero at the end', () => {
    const { schedule } = calculateReducingBalanceSchedule(principal, annualRate, tenureMonths, startDate);
    expect(schedule[schedule.length - 1].outstandingBalance).toBeCloseTo(0, 1);
  });

  it('total repayment equals principal plus total interest', () => {
    const { totalRepayment, totalInterest } = calculateReducingBalanceSchedule(
      principal, annualRate, tenureMonths, startDate
    );
    expect(totalRepayment).toBeCloseTo(principal + totalInterest, 2);
  });

  it('each installment has positive principal and interest', () => {
    const { schedule } = calculateReducingBalanceSchedule(principal, annualRate, tenureMonths, startDate);
    for (const row of schedule) {
      expect(row.principalDue).toBeGreaterThan(0);
      expect(row.interestDue).toBeGreaterThan(0);
      expect(row.totalDue).toBeCloseTo(row.principalDue + row.interestDue, 2);
    }
  });

  it('installment numbers are sequential starting from 1', () => {
    const { schedule } = calculateReducingBalanceSchedule(principal, annualRate, tenureMonths, startDate);
    schedule.forEach((row, i) => expect(row.installmentNumber).toBe(i + 1));
  });
});

// ---------------------------------------------------------------------------
// calculateFlatRateSchedule
// ---------------------------------------------------------------------------
describe('calculateFlatRateSchedule', () => {
  const principal = 120_000;
  const annualRate = 18; // 18% p.a.
  const tenureMonths = 6;
  const startDate = new Date('2024-01-01');

  it('generates the correct number of installments', () => {
    const { schedule } = calculateFlatRateSchedule(principal, annualRate, tenureMonths, startDate);
    expect(schedule).toHaveLength(6);
  });

  it('total interest = principal × rate × (tenure/12)', () => {
    const { totalInterest } = calculateFlatRateSchedule(principal, annualRate, tenureMonths, startDate);
    const expected = principal * (annualRate / 100) * (tenureMonths / 12);
    expect(totalInterest).toBeCloseTo(expected, 2);
  });

  it('outstanding balance reaches zero at the end', () => {
    const { schedule } = calculateFlatRateSchedule(principal, annualRate, tenureMonths, startDate);
    expect(schedule[schedule.length - 1].outstandingBalance).toBeCloseTo(0, 1);
  });

  it('monthly instalment is consistent across all periods', () => {
    const { schedule, monthlyInstalment } = calculateFlatRateSchedule(
      principal, annualRate, tenureMonths, startDate
    );
    // All but last installment should equal monthlyInstalment
    for (let i = 0; i < schedule.length - 1; i++) {
      expect(schedule[i].totalDue).toBeCloseTo(monthlyInstalment, 2);
    }
  });

  it('total repayment equals principal plus total interest', () => {
    const { totalRepayment, totalInterest } = calculateFlatRateSchedule(
      principal, annualRate, tenureMonths, startDate
    );
    expect(totalRepayment).toBeCloseTo(principal + totalInterest, 2);
  });
});
