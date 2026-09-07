/**
 * Where a signed-in user lands.
 *
 * Someone whose whole job is HR should open onto the HR overview, not the
 * generic dashboard; the same goes for the IT staff who only run the website.
 * The decision is made from the user's permissions rather than a hard-coded
 * list of role codes, so a custom role created from the roles console lands
 * correctly too, without anyone editing this file.
 *
 * This runs inside the Edge middleware, so it must stay a pure function over
 * the session user — no Prisma, no Node APIs.
 */

/** Modules that make someone a general operator rather than an HR specialist. */
const OPERATIONAL_MODULES = [
  'LOANS',
  'SAVINGS',
  'FIXED_DEPOSITS',
  'ACCOUNTS',
  'CUSTOMERS',
  'VERIFICATION',
];

export interface LandingUser {
  permissions?: string[];
  userType?: string;
}

/**
 * True when the user's access is confined to HR — they hold HR permissions and
 * none of the operational modules.
 */
export function isHrFocused(user: LandingUser | null | undefined): boolean {
  const permissions = user?.permissions;
  if (!permissions?.length) return false;

  const hasHr = permissions.some((p) => p.startsWith('HR:'));
  if (!hasHr) return false;

  const hasOperational = permissions.some((p) =>
    OPERATIONAL_MODULES.some((m) => p.startsWith(`${m}:`))
  );
  return !hasOperational;
}

/**
 * True when the user's access is confined to the website CMS. The dashboard is
 * permission-gated end to end, so an IT user would otherwise land on a page
 * that renders almost nothing.
 */
export function isCmsFocused(user: LandingUser | null | undefined): boolean {
  const permissions = user?.permissions;
  if (!permissions?.length) return false;

  const hasCms = permissions.some((p) => p.startsWith('CMS:'));
  if (!hasCms) return false;

  const hasOperational = permissions.some((p) =>
    OPERATIONAL_MODULES.some((m) => p.startsWith(`${m}:`))
  );
  const hasHr = permissions.some((p) => p.startsWith('HR:'));
  return !hasOperational && !hasHr;
}

/** The path a user should be sent to on sign-in, or when hitting the app root. */
export function resolveLandingPath(user: LandingUser | null | undefined): string {
  if (user?.userType === 'customer') return '/portal';
  if (isHrFocused(user)) return '/hr';
  if (isCmsFocused(user)) return '/cms/content';
  return '/dashboard';
}
