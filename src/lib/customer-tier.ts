/**
 * Customer KYC tiers.
 *
 *  - Tier 1: no BVN or NIN needed.
 *  - Tier 2: a BVN or a NIN, at least one.
 *  - Tier 3: both a BVN and a NIN.
 *
 * Staff choose the tier when they register a customer and the IDs it needs are
 * then compulsory. Where no tier is chosen (an application form, a quick add),
 * the customer gets the highest tier their IDs support.
 */

export const CUSTOMER_TIERS = [1, 2, 3] as const;
export type CustomerTier = (typeof CUSTOMER_TIERS)[number];

export const TIER_LABELS: Record<CustomerTier, string> = {
  1: 'Tier 1 — no BVN or NIN',
  2: 'Tier 2 — BVN or NIN',
  3: 'Tier 3 — BVN and NIN',
};

export function isCustomerTier(v: unknown): v is CustomerTier {
  return v === 1 || v === 2 || v === 3;
}

const has = (v: string | null | undefined) => !!v && v.trim().length > 0;

/** The highest tier a customer's IDs support. */
export function tierFromIds(bvn?: string | null, nationalId?: string | null): CustomerTier {
  const count = Number(has(bvn)) + Number(has(nationalId));
  return count === 2 ? 3 : count === 1 ? 2 : 1;
}

/** Why these IDs do not meet the tier, or null when they do. */
export function tierIdProblem(
  tier: CustomerTier,
  bvn?: string | null,
  nationalId?: string | null
): string | null {
  if (tier === 3 && !(has(bvn) && has(nationalId))) return 'Tier 3 customers need both a BVN and a NIN';
  if (tier === 2 && !has(bvn) && !has(nationalId)) return 'Tier 2 customers need a BVN or a NIN';
  return null;
}

/**
 * The tier to save: the one chosen, checked against the IDs, or the IDs' own
 * tier when none was chosen.
 */
export function resolveTier(
  chosen: unknown,
  bvn?: string | null,
  nationalId?: string | null
): { tier: CustomerTier; error: string | null } {
  const n = typeof chosen === 'string' && chosen !== '' ? Number(chosen) : chosen;
  if (n == null || n === '') return { tier: tierFromIds(bvn, nationalId), error: null };
  if (!isCustomerTier(n)) return { tier: 1, error: 'Choose Tier 1, 2 or 3' };
  return { tier: n, error: tierIdProblem(n, bvn, nationalId) };
}
