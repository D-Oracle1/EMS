/**
 * Savings promo rates and contracted terms.
 * Hylink Finance Limited EMS
 *
 * A promo lifts the interest rate for savers who OPEN an account inside a date
 * window. The decisive rule:
 *
 *   The promo is resolved ONCE, at opening, and stamped onto the account.
 *
 * Everything else follows from that. A saver who joins during the promo keeps
 * the promo rate for their whole term, so ending the promo — or editing the
 * product afterwards — cannot reach backwards and change what they earn. A
 * saver who joins the day after it ends gets the standard rate. Neither is
 * affected by what an administrator does to the product later.
 *
 * These functions are pure so the rules can be tested without a database.
 */

import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/** Prisma hands back Decimal; forms hand back numbers or strings. */
type Numeric = number | string | { toString(): string } | null | undefined;

function toNum(value: Numeric): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The promo-relevant shape of a savings product. */
export interface PromoProduct {
  durationMonths?: number | null;
  totalInterestRate?: Numeric;
  monthlyInterestRate?: Numeric;
  promoName?: string | null;
  promoTotalInterestRate?: Numeric;
  promoStartsAt?: Date | string | null;
  promoEndsAt?: Date | string | null;
  promoActive?: boolean | null;
}

/** The terms an account is opened on. */
export interface ContractedTerms {
  totalRate: number;
  monthlyRate: number;
  durationMonths: number | null;
  isPromo: boolean;
  promoName: string | null;
}

/** Monthly rate derived from a total-for-the-term rate. */
export function monthlyRateFor(totalRate: number, durationMonths: number | null): number {
  if (!durationMonths || durationMonths <= 0) return 0;
  return new Decimal(totalRate).div(durationMonths).toDecimalPlaces(6).toNumber();
}

/**
 * Is the product's promo running at this moment?
 *
 * A missing start or end is treated as open-ended, so a promo can be left to
 * run until it is switched off. The window is inclusive of both endpoints.
 */
export function isPromoRunning(product: PromoProduct, asOf: Date = new Date()): boolean {
  if (!product.promoActive) return false;

  const promoRate = toNum(product.promoTotalInterestRate);
  if (promoRate === null || promoRate <= 0) return false;

  const startsAt = toDate(product.promoStartsAt);
  const endsAt = toDate(product.promoEndsAt);

  if (startsAt && asOf.getTime() < startsAt.getTime()) return false;
  if (endsAt && asOf.getTime() > endsAt.getTime()) return false;

  return true;
}

/**
 * The terms a saver gets if they open this product on `asOf`.
 *
 * `asOf` is the account's start date, not "now" — backdating an account to
 * before the promo began must not hand out the promo rate, and the officer
 * choosing a start date inside the window is what earns it.
 */
export function resolveContractedTerms(
  product: PromoProduct,
  asOf: Date = new Date()
): ContractedTerms {
  const durationMonths = product.durationMonths ?? null;
  const standardTotal = toNum(product.totalInterestRate) ?? 0;

  if (isPromoRunning(product, asOf)) {
    const promoTotal = toNum(product.promoTotalInterestRate) as number;
    return {
      totalRate: promoTotal,
      monthlyRate: monthlyRateFor(promoTotal, durationMonths),
      durationMonths,
      isPromo: true,
      promoName: product.promoName?.trim() || 'Promo rate',
    };
  }

  // Fall back to the product's stored monthly rate when it is present: it is
  // the figure the engine has always used, and re-deriving could differ by a
  // rounding step for products saved before the rate column was widened.
  const storedMonthly = toNum(product.monthlyInterestRate);
  return {
    totalRate: standardTotal,
    monthlyRate: storedMonthly ?? monthlyRateFor(standardTotal, durationMonths),
    durationMonths,
    isPromo: false,
    promoName: null,
  };
}

/**
 * The monthly rate to apply to an account, preferring what it was opened on.
 *
 * Accounts created before contracted terms existed have none stamped, so they
 * fall back to the live product — exactly the behaviour they have had all
 * along, rather than silently dropping to zero.
 */
export function effectiveMonthlyRate(account: {
  contractedMonthlyRate?: Numeric;
  product?: { monthlyInterestRate?: Numeric } | null;
}): number | null {
  const contracted = toNum(account.contractedMonthlyRate);
  if (contracted !== null && contracted > 0) return contracted;
  return toNum(account.product?.monthlyInterestRate);
}

/** How a promo should be described in a UI or a narration. */
export function describePromoWindow(product: PromoProduct): string | null {
  if (!product.promoActive) return null;
  const startsAt = toDate(product.promoStartsAt);
  const endsAt = toDate(product.promoEndsAt);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  if (startsAt && endsAt) return `${fmt(startsAt)} to ${fmt(endsAt)}`;
  if (endsAt) return `until ${fmt(endsAt)}`;
  if (startsAt) return `from ${fmt(startsAt)}`;
  return 'no end date set';
}

/**
 * Validate a promo an administrator is trying to save.
 * Returns an error message, or null when the promo is sound.
 */
export function validatePromo(input: {
  promoActive: boolean;
  promoTotalInterestRate?: Numeric;
  promoStartsAt?: Date | string | null;
  promoEndsAt?: Date | string | null;
  standardTotalRate?: Numeric;
}): string | null {
  if (!input.promoActive) return null;

  const rate = toNum(input.promoTotalInterestRate);
  if (rate === null || rate <= 0) {
    return 'Enter the promo interest rate, or switch the promo off.';
  }
  if (rate > 100) {
    return 'A promo rate above 100% for the term is almost certainly a typo.';
  }

  const standard = toNum(input.standardTotalRate);
  if (standard !== null && rate <= standard) {
    return `The promo rate (${rate}%) is not better than the standard rate (${standard}%). Savers would gain nothing from it.`;
  }

  const startsAt = toDate(input.promoStartsAt);
  const endsAt = toDate(input.promoEndsAt);
  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
    return 'The promo ends before it starts.';
  }
  if (!endsAt) {
    return 'Set an end date for the promo. A promo with no end runs until someone remembers to stop it.';
  }

  return null;
}
