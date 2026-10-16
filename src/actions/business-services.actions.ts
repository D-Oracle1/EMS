'use server';

/**
 * Business Service Consultants / Social Media dashboard — Server Actions
 * Hylink Finance Limited EMS
 *
 * A consultant's own clients (who applied through their forms and links, and
 * what each became), the forms they made, and for the department's heads,
 * every consultant's figures (lib/business-services).
 */

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';
import {
  BSC_DEPARTMENT_CODE, canOpenBusinessServices, referralTotals, seesBusinessServicesTeam,
} from '@/lib/business-services';
import { getMyFormLinks, getMyReferrals } from '@/actions/referral.actions';
import { isAcceptingResponses, readQuestions } from '@/lib/forms';
import { PURPOSE_INFO, isCustomerPurpose } from '@/lib/customer-forms';

export async function getBusinessServicesDashboard() {
  const { user } = await getSession();
  if (!canOpenBusinessServices(user)) return null;

  const [referrals, links, forms] = await Promise.all([
    getMyReferrals(),
    getMyFormLinks(),
    prisma.form.findMany({
      where: { createdById: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: { _count: { select: { responses: true } } },
    }),
  ]);

  return {
    viewer: { name: `${user.firstName} ${user.lastName}`, inDepartment: user.departmentCode === BSC_DEPARTMENT_CODE },
    totals: referralTotals(referrals),
    referrals,
    links,
    forms: forms.map((f) => ({
      id: f.id,
      slug: f.slug,
      title: f.title,
      kind: isCustomerPurpose(f.purpose) ? PURPOSE_INFO[f.purpose].label : 'General',
      status: f.status,
      accepting: isAcceptingResponses(f),
      questionCount: readQuestions(f.questions).length,
      responseCount: f._count.responses,
    })),
    team: seesBusinessServicesTeam(user) ? await teamFigures() : null,
  };
}

/** Every active consultant's referrals: all time, this month, still with an officer, opened. */
async function teamFigures() {
  const members = await prisma.staff.findMany({
    where: { status: 'ACTIVE', isDeleted: false, department: { code: BSC_DEPARTMENT_CODE } },
    select: { id: true, firstName: true, lastName: true, employeeId: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  if (members.length === 0) return [];

  const rows = await prisma.formResponse.findMany({
    where: { referredById: { in: members.map((m) => m.id) } },
    select: {
      referredById: true, submittedAt: true, onboardingStatus: true,
      loanId: true, savingsAccountId: true, fixedDepositId: true,
    },
  });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return members
    .map((m) => {
      const mine = rows.filter((r) => r.referredById === m.id);
      const opened = mine.filter((r) => r.loanId || r.savingsAccountId || r.fixedDepositId);
      return {
        id: m.id,
        name: `${m.firstName} ${m.lastName}`,
        employeeId: m.employeeId,
        total: mine.length,
        thisMonth: mine.filter((r) => r.submittedAt >= monthStart).length,
        awaiting: mine.filter(
          (r) => r.onboardingStatus !== 'REJECTED' && !(r.loanId || r.savingsAccountId || r.fixedDepositId)
        ).length,
        opened: opened.length,
      };
    })
    .sort((a, b) => b.opened - a.opened || b.total - a.total);
}

export type BusinessServicesDashboard = NonNullable<Awaited<ReturnType<typeof getBusinessServicesDashboard>>>;
