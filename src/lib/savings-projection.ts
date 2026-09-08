/**
 * Fixed-term savings projection.
 * Hylink Finance Limited EMS
 *
 * The month-by-month view of what a saver will be paid, mirroring
 * `savings-daily-interest.ts` so the figure quoted when the account is opened
 * is the figure that lands.
 *
 * The model in one paragraph: interest starts counting the month AFTER the
 * deposit, and the whole contracted rate is then spread evenly across the days
 * between that point and maturity. A 12-month plan at 17% starting 8 September
 * earns from 8 October to 8 September — 335 days — at 17/335 = 0.050746269% a
 * day. Interest is credited to the account daily. The final earning day posts
 * whatever rounding is outstanding, so the term lands on exactly 17%.
 *
 * The rows below are monthly buckets of those daily credits: a 335-row table
 * is not something anyone can read, but the daily rate and the per-day amount
 * are shown alongside it.
 */

import Decimal from 'decimal.js';
import {
  deriveEarningTerms,
  interestTargetFor,
  atMidnight,
  daysBetween,
  addMonthsClamped,
} from '@/lib/savings-daily-interest';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface ProjectionRow {
  /** 1-based month of the term. */
  month: number;
  /** Date this month's window closes, when a start date was supplied. */
  date: string | null;
  /** Days inside this month that actually earn. */
  earningDays: number;
  /** Balance earning interest through this month. */
  openingEligible: number;
  /** Interest credited across this month. */
  interest: number;
  /** Interest credited so far, including this month. */
  cumulativeInterest: number;
  /** What the account is worth at the end of this month. */
  closingValue: number;
}

export interface Projection {
  rows: ProjectionRow[];
  principal: number;
  totalInterest: number;
  maturityValue: number;
  /** Interest as a percentage of the deposit — what the saver really earns. */
  effectiveRate: number;
  /** The rate the account was contracted at. */
  headlineRate: number | null;
  /** Months that carry interest (the first is always dormant). */
  earningMonths: number;
  /** Days across which the rate is spread. */
  earningDays: number;
  /** Percent per day per naira. */
  dailyRate: number;
  /** Naira credited on a typical day. */
  dailyAmount: number;
  /** When interest starts, as an ISO date. */
  earningStartDate: string | null;
}

/**
 * Project a term.
 *
 * `totalRate` is the rate for the whole term (17 means 17%).
 */
export function projectSchedule(input: {
  principal: number;
  totalRate: number;
  durationMonths: number;
  startDate?: Date | string | null;
}): Projection {
  const principal = new Decimal(input.principal || 0);
  const totalRate = Number(input.totalRate || 0);
  const duration = Math.max(0, Math.floor(input.durationMonths || 0));

  const parsed = input.startDate ? new Date(input.startDate) : null;
  const hasStart = parsed !== null && !Number.isNaN(parsed.getTime());
  // Without a real start date the shape of the schedule is the same; only the
  // dates against each row are unknown.
  const start = atMidnight(hasStart ? (parsed as Date) : new Date());

  const terms = deriveEarningTerms({ startDate: start, durationMonths: duration, totalRate });
  const target = interestTargetFor(principal.toNumber(), totalRate);

  const perDay = principal
    .times(terms.dailyRate)
    .div(100)
    .toDecimalPlaces(2);

  const rows: ProjectionRow[] = [];
  let cumulative = new Decimal(0);
  let earningMonths = 0;

  for (let month = 1; month <= duration; month++) {
    const windowStart = addMonthsClamped(start, month - 1);
    const windowEnd = addMonthsClamped(start, month);

    // Only the part of this month that falls inside the earning window pays.
    const from =
      windowStart.getTime() < terms.earningStartDate.getTime()
        ? terms.earningStartDate
        : windowStart;
    const to =
      windowEnd.getTime() > terms.maturityDate.getTime() ? terms.maturityDate : windowEnd;
    const days = Math.max(0, daysBetween(from, to));

    const isFinalMonth = month === duration;
    let interest: Decimal;

    if (isFinalMonth) {
      // The last month absorbs the term's rounding, exactly as the engine does
      // on the final earning day.
      interest = new Decimal(target).minus(cumulative).toDecimalPlaces(2);
      if (interest.lt(0)) interest = new Decimal(0);
    } else {
      interest = perDay.times(days).toDecimalPlaces(2);
    }

    cumulative = cumulative.plus(interest);
    if (days > 0) earningMonths++;

    rows.push({
      month,
      date: hasStart ? windowEnd.toISOString().split('T')[0] : null,
      earningDays: days,
      openingEligible: days > 0 ? principal.toNumber() : 0,
      interest: interest.toNumber(),
      cumulativeInterest: cumulative.toNumber(),
      closingValue: principal.plus(cumulative).toDecimalPlaces(2).toNumber(),
    });
  }

  const totalInterest = cumulative.toDecimalPlaces(2);
  const maturityValue = principal.plus(totalInterest).toDecimalPlaces(2);

  return {
    rows,
    principal: principal.toNumber(),
    totalInterest: totalInterest.toNumber(),
    maturityValue: maturityValue.toNumber(),
    effectiveRate: principal.gt(0)
      ? totalInterest.div(principal).times(100).toDecimalPlaces(4).toNumber()
      : 0,
    headlineRate: totalRate,
    earningMonths,
    earningDays: terms.earningDays,
    dailyRate: terms.dailyRate,
    dailyAmount: perDay.toNumber(),
    earningStartDate: hasStart ? terms.earningStartDate.toISOString().split('T')[0] : null,
  };
}

/** How the schedule works, in a sentence the saver can check. */
export function explainProjection(p: Projection): string | null {
  if (p.rows.length === 0 || p.headlineRate === null) return null;

  const dormant = p.rows.length - p.earningMonths;
  const parts: string[] = [];

  if (dormant > 0) {
    parts.push(
      `Interest starts the month after the deposit${p.earningStartDate ? ` (from ${p.earningStartDate})` : ''}`
    );
  }
  parts.push(
    `the ${p.headlineRate}% is spread across the ${p.earningDays} earning days at ${p.dailyRate}% a day`
  );
  parts.push('and is credited to the account daily');

  return `${parts.join(', ')}. The final day tops up any rounding, so the plan pays exactly ${p.headlineRate}%.`;
}
