/**
 * Fixed-term savings projection.
 * Hylink Finance Limited EMS
 *
 * Produces the month-by-month schedule a saver will actually be paid, so the
 * officer opening the account — and the customer — can see exactly what lands
 * at maturity rather than a headline percentage.
 *
 * This deliberately mirrors `savings-interest-engine.ts` step for step,
 * including the two rules that make the real figure differ from the headline:
 *
 *   1. The opening balance rule. A deposit does not earn in the month it is
 *      made: it sits in `pendingDeposits` and only rolls into the interest-
 *      earning `eligibleBalance` on the next monthly run. So the first run of a
 *      12-month plan posts nothing, and interest is earned over 11 months.
 *
 *   2. The calculation method. COMPOUND folds each month's interest back into
 *      the earning base; MONTHLY_ALLOCATION credits it to the balance without
 *      compounding; MATURITY_ONLY and FLAT accrue it to one side until
 *      maturity.
 *
 * Together those mean a "17% over 12 months" plan does not pay exactly 17%.
 * The schedule below is the honest answer, and the UI shows the effective rate
 * next to the headline one.
 */

import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type CalculationMethod =
  | 'MATURITY_ONLY'
  | 'MONTHLY_ALLOCATION'
  | 'FLAT'
  | 'COMPOUND';

export interface ProjectionRow {
  /** 1-based month of the term. */
  month: number;
  /** Date this run would post, if a start date was supplied. */
  date: string | null;
  /** Balance that earns interest this month. */
  openingEligible: number;
  /** Interest earned in this month alone. */
  interest: number;
  /** Interest earned so far, including this month. */
  cumulativeInterest: number;
  /** What the account is worth at the end of this month. */
  closingValue: number;
}

export interface Projection {
  rows: ProjectionRow[];
  principal: number;
  totalInterest: number;
  maturityValue: number;
  /** Interest as a percentage of the principal — what the saver really earns. */
  effectiveRate: number;
  /** The product's advertised total rate, for comparison. */
  headlineRate: number | null;
  /** Months that actually carry interest (the first is always dormant). */
  earningMonths: number;
  monthlyRate: number;
  method: CalculationMethod;
}

const CREDITS_TO_BALANCE: CalculationMethod[] = ['MONTHLY_ALLOCATION', 'COMPOUND'];

function addMonths(start: Date, months: number): Date {
  const d = new Date(start.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Simulate the term.
 *
 * `monthlyRate` is a percentage (1.416667 means 1.416667%), matching how the
 * engine and the product both store it.
 */
export function projectSchedule(input: {
  principal: number;
  monthlyRate: number;
  durationMonths: number;
  method?: CalculationMethod;
  startDate?: Date | string | null;
  headlineRate?: number | null;
}): Projection {
  const method: CalculationMethod = input.method ?? 'MATURITY_ONLY';
  const creditsToBalance = CREDITS_TO_BALANCE.includes(method);
  const compounds = method === 'COMPOUND';

  const principal = new Decimal(input.principal || 0);
  const rate = new Decimal(input.monthlyRate || 0);
  const duration = Math.max(0, Math.floor(input.durationMonths || 0));

  const start = input.startDate ? new Date(input.startDate) : null;
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null;

  // Opening state, exactly as createFixedSavingsAccount writes it: the whole
  // deposit is pending, nothing is earning yet.
  let eligible = new Decimal(0);
  let pending = principal;
  let balance = principal;
  let accrued = new Decimal(0);
  let cumulative = new Decimal(0);

  const rows: ProjectionRow[] = [];
  let earningMonths = 0;

  for (let month = 1; month <= duration; month++) {
    const openingEligible = eligible;
    const interest = eligible.times(rate).div(100).toDecimalPlaces(2);

    // Roll pending deposits in; compounding also folds this month's interest
    // into the base that earns next month.
    eligible = eligible.plus(pending);
    if (compounds) eligible = eligible.plus(interest);
    eligible = eligible.toDecimalPlaces(2);
    pending = new Decimal(0);

    if (creditsToBalance) balance = balance.plus(interest);
    else accrued = accrued.plus(interest);

    cumulative = cumulative.plus(interest);
    if (interest.gt(0)) earningMonths++;

    rows.push({
      month,
      date: validStart ? addMonths(validStart, month).toISOString().split('T')[0] : null,
      openingEligible: openingEligible.toNumber(),
      interest: interest.toNumber(),
      cumulativeInterest: cumulative.toNumber(),
      closingValue: balance.plus(accrued).toDecimalPlaces(2).toNumber(),
    });
  }

  // Maturity pays out everything the account holds, whichever side it sits on.
  const maturityValue = balance.plus(accrued).toDecimalPlaces(2);
  const totalInterest = maturityValue.minus(principal).toDecimalPlaces(2);

  return {
    rows,
    principal: principal.toNumber(),
    totalInterest: totalInterest.toNumber(),
    maturityValue: maturityValue.toNumber(),
    effectiveRate: principal.gt(0)
      ? totalInterest.div(principal).times(100).toDecimalPlaces(4).toNumber()
      : 0,
    headlineRate: input.headlineRate ?? null,
    earningMonths,
    monthlyRate: rate.toNumber(),
    method,
  };
}

/** Plain-language note on why the effective rate differs from the headline. */
export function explainProjection(p: Projection): string | null {
  if (p.headlineRate === null) return null;
  const diff = new Decimal(p.effectiveRate).minus(p.headlineRate).toDecimalPlaces(2).toNumber();
  if (Math.abs(diff) < 0.01) return null;

  const dormant = p.rows.length - p.earningMonths;
  const parts: string[] = [];
  if (dormant > 0) {
    parts.push(
      `the opening deposit does not earn in its first month, so interest runs for ${p.earningMonths} of ${p.rows.length} months`
    );
  }
  if (p.method === 'COMPOUND') {
    parts.push('interest compounds into the earning balance each month');
  }

  const direction = diff > 0 ? 'above' : 'below';
  return `Works out at ${p.effectiveRate}% of the deposit, ${Math.abs(diff)}% ${direction} the headline ${p.headlineRate}% — ${parts.join(', and ')}.`;
}
