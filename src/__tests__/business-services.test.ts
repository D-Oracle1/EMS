/**
 * Business Service Consultants / Social Media dashboard.
 *
 *  - The department opens it; level 85+ and the superuser too.
 *  - Only the department's heads (level 70+) and level 85+ see the team.
 *  - A consultant with no operational or HR work lands on it.
 *  - Its figures count each referral once, by where it stands.
 */
import { describe, it, expect } from 'vitest';
import { canOpenBusinessServices, referralTotals, seesBusinessServicesTeam } from '@/lib/business-services';
import { resolveLandingPath, hidesGenericDashboard } from '@/lib/landing';
import { resolveNav } from '@/lib/navigation';

const consultant = { departmentCode: 'BSC_SOCIAL', permissions: [] as string[], roleLevel: 30 };
const head = { ...consultant, roleLevel: 70 };
const gm = { departmentCode: 'MANAGEMENT', permissions: [] as string[], roleLevel: 85 };
const loanOfficer = { departmentCode: 'LOANS', permissions: ['LOANS:CREATE'], roleLevel: 40 };

describe('who opens Business Services', () => {
  it('is the department and level 85+, not other staff', () => {
    expect(canOpenBusinessServices(consultant)).toBe(true);
    expect(canOpenBusinessServices(gm)).toBe(true);
    expect(canOpenBusinessServices({ ...loanOfficer, permissions: ['ADMIN:SYSTEM'] })).toBe(true);
    expect(canOpenBusinessServices(loanOfficer)).toBe(false);
  });

  it('shows the team to heads and level 85+ only', () => {
    expect(seesBusinessServicesTeam(consultant)).toBe(false);
    expect(seesBusinessServicesTeam(head)).toBe(true);
    expect(seesBusinessServicesTeam(gm)).toBe(true);
    expect(seesBusinessServicesTeam({ ...loanOfficer, roleLevel: 70 })).toBe(false);
  });

  it('is in the sidebar for the same people', () => {
    const sees = (v: typeof consultant) => resolveNav(v).items.some((i) => i.href === '/business-services');
    expect(sees(consultant)).toBe(true);
    expect(sees(gm)).toBe(true);
    expect(sees(loanOfficer)).toBe(false);
  });

  it("is a consultant's landing page, unless they also run a module", () => {
    expect(resolveLandingPath(consultant)).toBe('/business-services');
    expect(hidesGenericDashboard(consultant)).toBe(true);
    expect(resolveLandingPath({ ...consultant, permissions: ['SAVINGS:CREATE'] })).toBe('/dashboard');
  });
});

describe('referralTotals', () => {
  const now = new Date('2026-10-16T12:00:00');
  const r = (stage: 'SUBMITTED' | 'APPROVED' | 'OPENED' | 'REJECTED', submittedAt: string, amount: number | null = null, sale: any = null) =>
    ({ stage, submittedAt, amount, sale });

  it('counts each referral by where it stands, and sums what was opened and earned', () => {
    const totals = referralTotals([
      r('SUBMITTED', '2026-10-02T09:00:00'),
      r('APPROVED', '2026-09-20T09:00:00'),
      r('OPENED', '2026-10-05T09:00:00', 50_000, { status: 'CONFIRMED', commission: 1_000, commissionPaid: false }),
      r('OPENED', '2026-08-05T09:00:00', 20_000, { status: 'CONFIRMED', commission: 400, commissionPaid: true }),
      r('OPENED', '2026-10-06T09:00:00', 10_000, { status: 'PENDING', commission: null, commissionPaid: false }),
      r('REJECTED', '2026-10-07T09:00:00'),
    ], now);
    expect(totals).toEqual({
      total: 6, thisMonth: 4, awaiting: 2, opened: 3, rejected: 1,
      valueOpened: 80_000, commissionOwed: 1_000, commissionPaid: 400,
    });
  });
});
