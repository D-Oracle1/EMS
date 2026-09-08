/**
 * Savings promo rates and contracted terms.
 *
 * The rule these tests defend: a promo is resolved once, at opening, and
 * stamped onto the account. A saver who joins during the promo keeps the promo
 * rate for their whole term; ending the promo, or editing the product, must
 * never reach backwards and change what an existing saver earns.
 */
import { describe, it, expect } from 'vitest';
import {
  isPromoRunning,
  resolveContractedTerms,
  effectiveMonthlyRate,
  monthlyRateFor,
  validatePromo,
  describePromoWindow,
} from '@/lib/savings-promo';

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

/** A 12-month plan at 17%, running a 22% promo through September. */
const promoProduct = {
  durationMonths: 12,
  totalInterestRate: 17,
  monthlyInterestRate: 1.416667,
  promoName: 'Independence Offer',
  promoTotalInterestRate: 22,
  promoStartsAt: d('2026-09-01'),
  promoEndsAt: d('2026-09-30'),
  promoActive: true,
};

// ── Rate derivation ─────────────────────────────────────────────────────────

describe('monthlyRateFor', () => {
  it('keeps six decimal places rather than rounding to two', () => {
    // 17/12 = 1.41666… Storing 1.42 overpaid every saver on the plan.
    expect(monthlyRateFor(17, 12)).toBe(1.416667);
  });

  it('divides evenly where it can', () => {
    expect(monthlyRateFor(12, 12)).toBe(1);
    expect(monthlyRateFor(5, 4)).toBe(1.25);
  });

  it('returns zero rather than dividing by a missing duration', () => {
    expect(monthlyRateFor(17, null)).toBe(0);
    expect(monthlyRateFor(17, 0)).toBe(0);
  });
});

// ── The promo window ────────────────────────────────────────────────────────

describe('isPromoRunning', () => {
  it('runs inside the window', () => {
    expect(isPromoRunning(promoProduct, d('2026-09-15'))).toBe(true);
  });

  it('includes both endpoints', () => {
    expect(isPromoRunning(promoProduct, d('2026-09-01'))).toBe(true);
    expect(isPromoRunning(promoProduct, d('2026-09-30'))).toBe(true);
  });

  it('does not run before it starts or after it ends', () => {
    expect(isPromoRunning(promoProduct, d('2026-08-31'))).toBe(false);
    expect(isPromoRunning(promoProduct, d('2026-10-01'))).toBe(false);
  });

  it('does not run when switched off, whatever the dates say', () => {
    expect(isPromoRunning({ ...promoProduct, promoActive: false }, d('2026-09-15'))).toBe(false);
  });

  it('does not run without a rate to give', () => {
    expect(
      isPromoRunning({ ...promoProduct, promoTotalInterestRate: null }, d('2026-09-15'))
    ).toBe(false);
    expect(
      isPromoRunning({ ...promoProduct, promoTotalInterestRate: 0 }, d('2026-09-15'))
    ).toBe(false);
  });

  it('treats a missing start as open-ended', () => {
    const p = { ...promoProduct, promoStartsAt: null };
    expect(isPromoRunning(p, d('2020-01-01'))).toBe(true);
    expect(isPromoRunning(p, d('2026-10-01'))).toBe(false);
  });

  it('treats a missing end as open-ended', () => {
    const p = { ...promoProduct, promoEndsAt: null };
    expect(isPromoRunning(p, d('2030-01-01'))).toBe(true);
    expect(isPromoRunning(p, d('2026-08-31'))).toBe(false);
  });
});

// ── Terms resolved at opening ───────────────────────────────────────────────

describe('resolveContractedTerms', () => {
  it('gives the promo rate to a saver opening inside the window', () => {
    const terms = resolveContractedTerms(promoProduct, d('2026-09-15'));
    expect(terms.isPromo).toBe(true);
    expect(terms.totalRate).toBe(22);
    expect(terms.monthlyRate).toBe(monthlyRateFor(22, 12));
    expect(terms.promoName).toBe('Independence Offer');
  });

  it('gives the standard rate to a saver opening the day after it ends', () => {
    const terms = resolveContractedTerms(promoProduct, d('2026-10-01'));
    expect(terms.isPromo).toBe(false);
    expect(terms.totalRate).toBe(17);
    expect(terms.promoName).toBeNull();
  });

  it('resolves against the start date, so backdating cannot claim a promo', () => {
    // An officer backdating an account to before the promo began must not be
    // able to hand out the promo rate.
    const terms = resolveContractedTerms(promoProduct, d('2026-08-01'));
    expect(terms.isPromo).toBe(false);
    expect(terms.totalRate).toBe(17);
  });

  it('names an unnamed promo rather than leaving it blank', () => {
    const terms = resolveContractedTerms(
      { ...promoProduct, promoName: null },
      d('2026-09-15')
    );
    expect(terms.promoName).toBe('Promo rate');
  });

  it('prefers the stored monthly rate for a standard opening', () => {
    // Re-deriving could differ by a rounding step from what the engine has
    // been paying, so the stored figure wins when it is present.
    const terms = resolveContractedTerms(
      { durationMonths: 12, totalInterestRate: 17, monthlyInterestRate: 1.42 },
      d('2026-09-15')
    );
    expect(terms.monthlyRate).toBe(1.42);
  });

  it('derives the monthly rate when the product has none stored', () => {
    const terms = resolveContractedTerms(
      { durationMonths: 8, totalInterestRate: 11 },
      d('2026-09-15')
    );
    expect(terms.monthlyRate).toBe(monthlyRateFor(11, 8));
  });
});

// ── What the engine actually applies ────────────────────────────────────────

describe('effectiveMonthlyRate', () => {
  it('uses the rate the account was opened on', () => {
    const rate = effectiveMonthlyRate({
      contractedMonthlyRate: 1.833333,
      product: { monthlyInterestRate: 1.416667 },
    });
    expect(rate).toBe(1.833333);
  });

  it('ignores a later change to the product', () => {
    // The product has been cut to 0.5%/month; the saver keeps 1.833333%.
    const account = { contractedMonthlyRate: 1.833333, product: { monthlyInterestRate: 0.5 } };
    expect(effectiveMonthlyRate(account)).toBe(1.833333);
  });

  it('falls back to the product for accounts opened before terms were stamped', () => {
    expect(
      effectiveMonthlyRate({ contractedMonthlyRate: null, product: { monthlyInterestRate: 1.416667 } })
    ).toBe(1.416667);
  });

  it('returns null when there is no rate anywhere, so the engine skips the account', () => {
    expect(effectiveMonthlyRate({ contractedMonthlyRate: null, product: null })).toBeNull();
  });

  it('accepts the Decimal objects Prisma returns', () => {
    const decimalish = { toString: () => '1.833333' };
    expect(effectiveMonthlyRate({ contractedMonthlyRate: decimalish, product: null })).toBe(1.833333);
  });
});

// ── Guardrails on what an administrator can save ────────────────────────────

describe('validatePromo', () => {
  const base = {
    promoActive: true,
    promoTotalInterestRate: 22,
    promoStartsAt: d('2026-09-01'),
    promoEndsAt: d('2026-09-30'),
    standardTotalRate: 17,
  };

  it('accepts a sound promo', () => {
    expect(validatePromo(base)).toBeNull();
  });

  it('ignores everything when the promo is switched off', () => {
    expect(validatePromo({ ...base, promoActive: false, promoTotalInterestRate: 0 })).toBeNull();
  });

  it('rejects a promo that is not better than the standard rate', () => {
    expect(validatePromo({ ...base, promoTotalInterestRate: 17 })).toMatch(/not better/i);
    expect(validatePromo({ ...base, promoTotalInterestRate: 10 })).toMatch(/not better/i);
  });

  it('rejects a promo with no rate', () => {
    expect(validatePromo({ ...base, promoTotalInterestRate: null })).toMatch(/enter the promo/i);
  });

  it('rejects a rate that is obviously a typo', () => {
    expect(validatePromo({ ...base, promoTotalInterestRate: 220 })).toMatch(/typo/i);
  });

  it('rejects a window that ends before it starts', () => {
    expect(validatePromo({ ...base, promoEndsAt: d('2026-08-01') })).toMatch(/ends before it starts/i);
  });

  it('requires an end date, so a promo cannot run forever by accident', () => {
    expect(validatePromo({ ...base, promoEndsAt: null })).toMatch(/end date/i);
  });
});

// ── Description shown in the UI ─────────────────────────────────────────────

describe('describePromoWindow', () => {
  it('says nothing when there is no promo', () => {
    expect(describePromoWindow({ ...promoProduct, promoActive: false })).toBeNull();
  });

  // Month abbreviations differ between ICU versions ("Sep" vs "Sept"), so
  // assert the shape rather than pinning a locale's exact spelling.
  it('describes a bounded window', () => {
    expect(describePromoWindow(promoProduct)).toMatch(/^1 \w+ 2026 to 30 \w+ 2026$/);
  });

  it('describes an open-ended start', () => {
    expect(describePromoWindow({ ...promoProduct, promoStartsAt: null })).toMatch(
      /^until 30 \w+ 2026$/
    );
  });

  it('describes an open-ended end', () => {
    expect(describePromoWindow({ ...promoProduct, promoEndsAt: null })).toMatch(
      /^from 1 \w+ 2026$/
    );
  });
});
