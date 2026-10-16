/**
 * Business Service Consultants / Social Media — who opens the department's
 * dashboard, and who sees the whole team on it.
 *
 *  - Everyone in the department opens it, and sees their own clients.
 *  - The department's heads (level 70 and above) and form managers (level 85
 *    and above, or the superuser) also see every consultant's figures.
 *
 * Pure rules live here so they can be tested without a database.
 */
import type { SessionUser } from '@/types';

export const BSC_DEPARTMENT_CODE = 'BSC_SOCIAL';

/** Role level at and above which a viewer sees the whole team. */
export const BSC_TEAM_ROLE_LEVEL = 70;

/** Role level at and above which anyone opens the dashboard, in any department. */
export const BSC_OVERSIGHT_ROLE_LEVEL = 85;

type Viewer = Pick<SessionUser, 'departmentCode' | 'permissions' | 'roleLevel'>;

const oversees = (u: Viewer) => u.permissions.includes('ADMIN:SYSTEM') || (u.roleLevel ?? 0) >= BSC_OVERSIGHT_ROLE_LEVEL;

export function canOpenBusinessServices(u: Viewer): boolean {
  return u.departmentCode === BSC_DEPARTMENT_CODE || oversees(u);
}

export function seesBusinessServicesTeam(u: Viewer): boolean {
  return oversees(u) || (u.departmentCode === BSC_DEPARTMENT_CODE && (u.roleLevel ?? 0) >= BSC_TEAM_ROLE_LEVEL);
}

export interface ReferralLike {
  stage: 'SUBMITTED' | 'APPROVED' | 'OPENED' | 'REJECTED';
  amount: number | null;
  submittedAt: string;
  sale: { status: string; commission: number | null; commissionPaid: boolean } | null;
}

/** The headline figures for one consultant's referrals. */
export function referralTotals(referrals: ReferralLike[], now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const confirmed = referrals.filter((r) => r.sale?.status === 'CONFIRMED');
  const commission = (paid: boolean) =>
    confirmed.filter((r) => r.sale!.commissionPaid === paid).reduce((t, r) => t + (r.sale!.commission ?? 0), 0);
  return {
    total: referrals.length,
    thisMonth: referrals.filter((r) => new Date(r.submittedAt) >= monthStart).length,
    awaiting: referrals.filter((r) => r.stage === 'SUBMITTED' || r.stage === 'APPROVED').length,
    opened: referrals.filter((r) => r.stage === 'OPENED').length,
    rejected: referrals.filter((r) => r.stage === 'REJECTED').length,
    valueOpened: referrals.filter((r) => r.stage === 'OPENED').reduce((t, r) => t + (r.amount ?? 0), 0),
    commissionOwed: commission(false),
    commissionPaid: commission(true),
  };
}
