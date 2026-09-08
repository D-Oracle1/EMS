/**
 * Fixed-term savings projection.
 *
 * These tests pin the schedule to what the interest engine actually does, so
 * the figure quoted to a saver when the account is opened is the figure that
 * lands at maturity. Where the two rules of the engine — the opening balance
 * rule and the calculation method — make the real return differ from the
 * headline rate, that difference is asserted here rather than glossed over.
 */
import { describe, it, expect } from 'vitest';
import { projectSchedule, explainProjection } from '@/lib/savings-projection';

const PLAN_12M = { principal: 1_000_000, monthlyRate: 1.416667, durationMonths: 12 };

// ── The opening balance rule ────────────────────────────────────────────────

describe('opening balance rule', () => {
  it('pays nothing in the first month', () => {
    // The deposit sits in pendingDeposits and only starts earning on the next
    // monthly run, so the first row must be zero.
    const p = projectSchedule({ ...PLAN_12M, method: 'MATURITY_ONLY' });
    expect(p.rows[0].openingEligible).toBe(0);
    expect(p.rows[0].interest).toBe(0);
  });

  it('earns over one month fewer than the term', () => {
    const p = projectSchedule({ ...PLAN_12M, method: 'MATURITY_ONLY' });
    expect(p.rows).toHaveLength(12);
    expect(p.earningMonths).toBe(11);
  });

  it('starts earning on the full deposit from the second month', () => {
    const p = projectSchedule({ ...PLAN_12M, method: 'MATURITY_ONLY' });
    expect(p.rows[1].openingEligible).toBe(1_000_000);
    expect(p.rows[1].interest).toBeCloseTo(14_166.67, 2);
  });
});

// ── Calculation methods ─────────────────────────────────────────────────────

describe('MATURITY_ONLY', () => {
  const p = projectSchedule({ ...PLAN_12M, method: 'MATURITY_ONLY', headlineRate: 17 });

  it('accrues a flat amount every earning month', () => {
    const amounts = new Set(p.rows.slice(1).map((r) => r.interest));
    expect(amounts.size).toBe(1);
  });

  it('pays 11 months of simple interest, not the headline 17%', () => {
    // 11 x 14,166.67 = 155,833.37
    expect(p.totalInterest).toBeCloseTo(155_833.37, 2);
    expect(p.effectiveRate).toBeCloseTo(15.58, 2);
    expect(p.maturityValue).toBeCloseTo(1_155_833.37, 2);
  });
});

describe('COMPOUND', () => {
  const p = projectSchedule({ ...PLAN_12M, method: 'COMPOUND', headlineRate: 17 });

  it('grows the earning base each month', () => {
    expect(p.rows[2].openingEligible).toBeGreaterThan(p.rows[1].openingEligible);
  });

  it('earns more than the same plan without compounding', () => {
    const simple = projectSchedule({ ...PLAN_12M, method: 'MATURITY_ONLY' });
    expect(p.totalInterest).toBeGreaterThan(simple.totalInterest);
  });

  it('lands close to, but not exactly on, the headline rate', () => {
    // Compounding recovers most of the dormant first month but not all of it.
    expect(p.effectiveRate).toBeGreaterThan(16);
    expect(p.effectiveRate).toBeLessThan(17);
  });
});

describe('MONTHLY_ALLOCATION', () => {
  it('credits interest without letting it earn further interest', () => {
    const monthly = projectSchedule({ ...PLAN_12M, method: 'MONTHLY_ALLOCATION' });
    const simple = projectSchedule({ ...PLAN_12M, method: 'MATURITY_ONLY' });
    // Same total as accrual; the difference is only where the money sits.
    expect(monthly.totalInterest).toBeCloseTo(simple.totalInterest, 2);
  });
});

// ── The schedule holds together ─────────────────────────────────────────────

describe('schedule integrity', () => {
  for (const method of ['MATURITY_ONLY', 'MONTHLY_ALLOCATION', 'COMPOUND'] as const) {
    it(`${method}: rows sum to the total interest`, () => {
      const p = projectSchedule({ ...PLAN_12M, method });
      const summed = p.rows.reduce((s, r) => s + r.interest, 0);
      expect(summed).toBeCloseTo(p.totalInterest, 2);
    });

    it(`${method}: the last closing value is the maturity value`, () => {
      const p = projectSchedule({ ...PLAN_12M, method });
      expect(p.rows[p.rows.length - 1].closingValue).toBeCloseTo(p.maturityValue, 2);
    });

    it(`${method}: cumulative interest never goes backwards`, () => {
      const p = projectSchedule({ ...PLAN_12M, method });
      for (let i = 1; i < p.rows.length; i++) {
        expect(p.rows[i].cumulativeInterest).toBeGreaterThanOrEqual(
          p.rows[i - 1].cumulativeInterest
        );
      }
    });
  }

  it('maturity value is always principal plus total interest', () => {
    const p = projectSchedule({ ...PLAN_12M, method: 'COMPOUND' });
    expect(p.maturityValue).toBeCloseTo(p.principal + p.totalInterest, 2);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('returns an empty schedule for a zero-month term', () => {
    const p = projectSchedule({ principal: 100_000, monthlyRate: 1, durationMonths: 0 });
    expect(p.rows).toEqual([]);
    expect(p.maturityValue).toBe(100_000);
    expect(p.totalInterest).toBe(0);
  });

  it('handles a zero deposit without dividing by it', () => {
    const p = projectSchedule({ principal: 0, monthlyRate: 1.5, durationMonths: 6 });
    expect(p.totalInterest).toBe(0);
    expect(p.effectiveRate).toBe(0);
  });

  it('pays nothing at a zero rate', () => {
    const p = projectSchedule({ principal: 500_000, monthlyRate: 0, durationMonths: 12 });
    expect(p.totalInterest).toBe(0);
    expect(p.maturityValue).toBe(500_000);
    expect(p.earningMonths).toBe(0);
  });

  it('dates each row from the start date when one is given', () => {
    const p = projectSchedule({
      ...PLAN_12M,
      method: 'COMPOUND',
      startDate: '2026-09-08',
    });
    expect(p.rows[0].date).toBe('2026-10-08');
    expect(p.rows[11].date).toBe('2027-09-08');
  });

  it('leaves dates null when no start date is given', () => {
    const p = projectSchedule({ ...PLAN_12M });
    expect(p.rows[0].date).toBeNull();
  });
});

// ── The explanation shown to the officer ────────────────────────────────────

describe('explainProjection', () => {
  it('says nothing when there is no headline to compare against', () => {
    const p = projectSchedule({ ...PLAN_12M, method: 'COMPOUND' });
    expect(explainProjection(p)).toBeNull();
  });

  it('explains the gap between the headline and what is really paid', () => {
    const p = projectSchedule({ ...PLAN_12M, method: 'MATURITY_ONLY', headlineRate: 17 });
    const note = explainProjection(p);
    expect(note).toMatch(/15\.58/);
    expect(note).toMatch(/11 of 12 months/);
    expect(note).toMatch(/below the headline 17%/);
  });

  it('mentions compounding when the method compounds', () => {
    const p = projectSchedule({ ...PLAN_12M, method: 'COMPOUND', headlineRate: 17 });
    expect(explainProjection(p)).toMatch(/compounds/);
  });

  it('stays silent when the figures agree', () => {
    // A rate and term that happen to land on the headline exactly.
    const p = projectSchedule({
      principal: 100_000,
      monthlyRate: 0,
      durationMonths: 12,
      headlineRate: 0,
    });
    expect(explainProjection(p)).toBeNull();
  });
});
