/**
 * Branch scoping — which branch's customers and money a staff member may see.
 *
 * The rule:
 *  - The superuser (ADMIN:SYSTEM) and anyone at Director level or above sees
 *    every branch.
 *  - Staff with no branch are head office, and see every branch too.
 *  - Everyone else sees only the branch they are posted to.
 *
 * The branch is read from the database rather than the session token, so a
 * transfer takes effect on the next request instead of the next login.
 */
import { prisma } from '@/lib/prisma';
import type { SessionUser } from '@/types';

/** Role level at and above which a role oversees the whole company. */
export const ALL_BRANCHES_ROLE_LEVEL = 90;

/** Role level at and above which a role runs a branch (Manager). */
export const BRANCH_MANAGER_ROLE_LEVEL = 70;

/** Permissions that mark someone who signs off a branch's work. */
export const BRANCH_OVERSIGHT_PERMISSIONS = ['LOANS:APPROVE_L1', 'SAVINGS:APPROVE'];

/**
 * Whether a viewer may open the My Branch view of the branch they are posted
 * to: Manager level or above, and someone who approves that branch's work.
 */
export function overseesOwnBranch(user: Pick<SessionUser, 'permissions' | 'roleLevel'>): boolean {
  return (
    (user.roleLevel ?? 0) >= BRANCH_MANAGER_ROLE_LEVEL &&
    BRANCH_OVERSIGHT_PERMISSIONS.some((p) => user.permissions.includes(p))
  );
}

/** Whether a viewer oversees every branch regardless of their own posting. */
export function seesAllBranches(user: Pick<SessionUser, 'permissions' | 'roleLevel'>): boolean {
  return user.permissions.includes('ADMIN:SYSTEM') || (user.roleLevel ?? 0) >= ALL_BRANCHES_ROLE_LEVEL;
}

/**
 * The branch a viewer is confined to, or null when they may see every branch.
 */
export async function branchScopeFor(
  user: Pick<SessionUser, 'id' | 'permissions' | 'roleLevel'>
): Promise<string | null> {
  if (seesAllBranches(user)) return null;
  const staff = await prisma.staff.findUnique({ where: { id: user.id }, select: { branchId: true } });
  return staff?.branchId ?? null;
}

/**
 * The branch whose staff a viewer may see, or null for everyone. HR
 * administrators (who hire, and so hold HR:STAFF_CREATE) run people for the
 * whole company; a branch manager reading HR sees only their own branch.
 */
export async function staffScopeFor(
  user: Pick<SessionUser, 'id' | 'permissions' | 'roleLevel'>
): Promise<string | null> {
  if (user.permissions.includes('HR:STAFF_CREATE')) return null;
  return branchScopeFor(user);
}

/**
 * Whether a record belonging to `recordBranchId` is visible under `scope`.
 * Records with no branch belong to head office, so a branch-scoped viewer
 * does not see them.
 */
export function inScope(scope: string | null, recordBranchId: string | null | undefined): boolean {
  return scope === null || recordBranchId === scope;
}
