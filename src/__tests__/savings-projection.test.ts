/**
 * Fixed-term savings projection.
 *
 * The promise these tests defend: a plan advertised at 17% over 12 months pays
 * exactly 17%, no more and no less, while interest still starts counting the
 * month AFTER the deposit.
 *
 * Those two things only coexist because the rate is spread across the earning
 * window rather than the whole term. The dormant first month is not paid for
 * with a shortfall at the end; it is priced into the daily rate.
 */
import { describe, it, expect } from 'vitest';
import { projectSchedule, explainProjection } from '@/lib/savings-projection';

/** 1,000,000 on a 12-month plan at 17%, opened 8 September. */
const PLAN = {
  principal: 1_000_000,
  totalRate: 17,
  durationMonths: 12,
  startDate: '2026-09-08',
};

// ── The promise ─────────────────────────────────────────────────────────────

describe('the contracted rate is paid exactly', () => {
  const p = projectSchedule(PLAN);

  it('pays 17% of the deposit, to the kobo', () => {
    expect(p.totalInterest).toBe(170_000);
    expect(p.maturityValue).toBe(1_170_000);
  });

  it('reports an effective rate equal to the headline', () => {
    expect(p.effectiveRate).toBe(17);
    expect(p.headlineRate).toBe(17);
  });

  it('holds for other plans too', () => {
    const four = projectSchedule({
      principal: 250_000, totalRate: 5, durationMonths: 4, startDate: '2026-01-31',
    });
    expect(four.totalInterest).toBe(12_500);

    const eight = projectSchedule({
      principal: 725_000, totalRate: 11, durationMonths: 8, startDate: '2026-06-15',
    });
    expect(eight.totalInterest).toBe(79_750);
  });

  it('holds for awkward amounts where rounding could bite', () => {
    const odd = projectSchedule({
      principal: 333_333.33, totalRate: 17, durationMonths: 12, startDate: '2026-09-08',
    });
    expect(odd.totalInterest).toBeCloseTo(56_666.67, 2);
  });
});

// ── Interest starts the month after the deposit ─────────────────────────────

describe('the dormant first month', () => {
  const p = projectSchedule(PLAN);

  it('pays nothing in the first month', () => {
    expect(p.rows[0].earningDays).toBe(0);
    expect(p.rows[0].interest).toBe(0);
  });

  it('starts exactly one month after the start date', () => {
    expect(p.earningStartDate).toBe('2026-10-08');
  });

  it('earns in every month after the first', () => {
    expect(p.earningMonths).toBe(11);
    for (const row of p.rows.slice(1)) {
      expect(row.earningDays).toBeGreaterThan(0);
      expect(row.interest).toBeGreaterThan(0);
    }
  });

  it('spreads the rate over the earning days, not the whole term', () => {
    expect(p.earningDays).toBe(335);
    expect(p.dailyRate).toBeCloseTo(17 / 335, 9);
  });
});

// ── The daily credit ────────────────────────────────────────────────────────

describe('daily credit', () => {
  const p = projectSchedule(PLAN);

  it('tops up a predictable amount each day', () => {
    expect(p.dailyAmount).toBeCloseTo(507.46, 2);
  });

  it('would fall short without the final top-up', () => {
    // 335 x 507.46 = 169,999.10 — ninety kobo short of the promise.
    const naive = p.dailyAmount * p.earningDays;
    expect(naive).toBeLessThan(170_000);
    expect(170_000 - naive).toBeCloseTo(0.9, 2);
  });

  it('closes that gap in the final month', () => {
    const last = p.rows[p.rows.length - 1];
    const others = p.rows.slice(0, -1).reduce((s, r) => s + r.interest, 0);
    expect(others + last.interest).toBe(170_000);
  });
});

// ── The schedule holds together ─────────────────────────────────────────────

describe('schedule integrity', () => {
  const p = projectSchedule(PLAN);

  it('has one row per month of the term', () => {
    expect(p.rows).toHaveLength(12);
  });

  it('rows sum to the total interest', () => {
    const summed = p.rows.reduce((s, r) => s + r.interest, 0);
    expect(summed).toBeCloseTo(p.totalInterest, 2);
  });

  it('cumulative interest never goes backwards', () => {
    for (let i = 1; i < p.rows.length; i++) {
      expect(p.rows[i].cumulativeInterest).toBeGreaterThanOrEqual(
        p.rows[i - 1].cumulativeInterest
      );
    }
  });

  it('ends on the maturity value', () => {
    expect(p.rows[p.rows.length - 1].closingValue).toBe(p.maturityValue);
  });

  it('dates each row and ends on the maturity date', () => {
    expect(p.rows[0].date).toBe('2026-10-08');
    expect(p.rows[11].date).toBe('2027-09-08');
  });

  it('leaves dates null when no start date is given', () => {
    const noDate = projectSchedule({ principal: 100_000, totalRate: 5, durationMonths: 4 });
    expect(noDate.rows[0].date).toBeNull();
    expect(noDate.earningStartDate).toBeNull();
    // The money is still right without a date.
    expect(noDate.totalInterest).toBe(5_000);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('returns an empty schedule for a zero-month term', () => {
    const p = projectSchedule({ principal: 100_000, totalRate: 5, durationMonths: 0 });
    expect(p.rows).toEqual([]);
    expect(p.maturityValue).toBe(100_000);
    expect(p.totalInterest).toBe(0);
  });

  it('handles a zero deposit without dividing by it', () => {
    const p = projectSchedule({ principal: 0, totalRate: 17, durationMonths: 12 });
    expect(p.totalInterest).toBe(0);
    expect(p.effectiveRate).toBe(0);
  });

  it('pays nothing at a zero rate', () => {
    const p = projectSchedule({ principal: 500_000, totalRate: 0, durationMonths: 12 });
    expect(p.totalInterest).toBe(0);
    expect(p.maturityValue).toBe(500_000);
  });

  it('handles a one-month plan, which never earns', () => {
    // Interest starts a month in, and the plan ends there, so nothing accrues.
    const p = projectSchedule({
      principal: 100_000, totalRate: 2, durationMonths: 1, startDate: '2026-09-08',
    });
    expect(p.earningDays).toBe(0);
    expect(p.rows).toHaveLength(1);
  });

  it('clamps a month-end start rather than overshooting', () => {
    // 31 January plus one month is 28 February, not 3 March.
    const p = projectSchedule({
      principal: 100_000, totalRate: 5, durationMonths: 4, startDate: '2026-01-31',
    });
    expect(p.earningStartDate).toBe('2026-02-28');
    expect(p.totalInterest).toBe(5_000);
  });
});

// ── The explanation shown to the saver ──────────────────────────────────────

describe('explainProjection', () => {
  it('explains the dormant month, the daily rate and the exact total', () => {
    const note = explainProjection(projectSchedule(PLAN));
    expect(note).toMatch(/starts the month after the deposit/i);
    expect(note).toMatch(/2026-10-08/);
    expect(note).toMatch(/335 earning days/);
    expect(note).toMatch(/credited to the account daily/i);
    expect(note).toMatch(/exactly 17%/);
  });

  it('says nothing for an empty schedule', () => {
    expect(explainProjection(projectSchedule({
      principal: 100_000, totalRate: 5, durationMonths: 0,
    }))).toBeNull();
  });
});
