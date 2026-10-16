'use server';

/**
 * Personal form links — Server Actions
 * Hylink Finance Limited EMS
 *
 * Every staff member can share any open customer application form with their
 * own link (lib/referrals), and follow what became of each client they
 * referred: submitted, approved, opened or paid out, and the sale and
 * commission it earned. Each staff member sees only their own referrals.
 */

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';
import { isAcceptingResponses, type Answers } from '@/lib/forms';
import { applicantDetails, applicationTerms, isApplicantPurpose, PURPOSE_INFO, type CustomerPurpose } from '@/lib/customer-forms';
import { isSeller } from '@/lib/referrals';

async function requireStaff() {
  const { user } = await getSession();
  if ((user.userType ?? 'staff') !== 'staff') throw new Error('Permission denied');
  return user;
}

/** The open customer forms this staff member can share, and their own referral code. */
export async function getMyFormLinks() {
  const user = await requireStaff();
  const [me, forms] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: user.id },
      select: { employeeId: true, onSalesTarget: true, department: { select: { code: true } } },
    }),
    prisma.form.findMany({
      where: {
        status: 'OPEN',
        purpose: { in: ['SAVINGS_APPLICATION', 'PARTNERSHIP_APPLICATION', 'FIXED_DEPOSIT_APPLICATION', 'LOAN_APPLICATION'] },
        // Company forms, and this staff member's own; never another's own form.
        OR: [{ personal: false }, { createdById: user.id }],
      },
      orderBy: [{ purpose: 'asc' }, { title: 'asc' }],
      select: { id: true, slug: true, title: true, purpose: true, status: true, closesAt: true, branch: { select: { name: true } } },
    }),
  ]);
  return {
    code: me?.employeeId ?? null,
    earnsCommission: !!me && isSeller(me),
    forms: forms
      .filter((f) => isAcceptingResponses(f) && isApplicantPurpose(f.purpose))
      .map((f) => ({ id: f.id, slug: f.slug, title: f.title, kind: PURPOSE_INFO[f.purpose as CustomerPurpose].label, branch: f.branch?.name ?? null })),
  };
}

export type ReferralStage = 'SUBMITTED' | 'APPROVED' | 'OPENED' | 'REJECTED';

/** The clients this staff member referred, newest first, with where each stands. */
export async function getMyReferrals() {
  const user = await requireStaff();
  const rows = await prisma.formResponse.findMany({
    where: { referredById: user.id },
    orderBy: { submittedAt: 'desc' },
    take: 100,
    select: {
      id: true, reference: true, answers: true, submittedAt: true, onboardingStatus: true,
      loanId: true, savingsAccountId: true, fixedDepositId: true,
      form: { select: { purpose: true } },
      loan: { select: { loanNumber: true, status: true } },
      savingsAccount: { select: { accountNumber: true } },
      fixedDeposit: { select: { certificateNumber: true } },
    },
  });

  // The sales recorded for what those applications opened, in this staff member's name.
  const sales = await prisma.marketingSale.findMany({
    where: {
      marketerId: user.id,
      OR: [
        { loanId: { in: rows.map((r) => r.loanId).filter((x): x is string => !!x) } },
        { savingsAccountId: { in: rows.map((r) => r.savingsAccountId).filter((x): x is string => !!x) } },
        { fixedDepositId: { in: rows.map((r) => r.fixedDepositId).filter((x): x is string => !!x) } },
      ],
    },
    select: { reference: true, status: true, commissionAmount: true, commissionPaidAt: true, loanId: true, savingsAccountId: true, fixedDepositId: true },
  });

  return rows.map((r) => {
    const purpose = r.form.purpose as CustomerPurpose;
    const answers = (r.answers ?? {}) as Answers;
    const d = applicantDetails(answers);
    const sale = sales.find(
      (s) => (r.loanId && s.loanId === r.loanId) || (r.savingsAccountId && s.savingsAccountId === r.savingsAccountId) ||
        (r.fixedDepositId && s.fixedDepositId === r.fixedDepositId)
    );
    const opened = r.loan
      ? { label: `Loan ${r.loan.loanNumber}`, paidOut: ['DISBURSED', 'ACTIVE', 'OVERDUE', 'CLOSED'].includes(r.loan.status) }
      : r.savingsAccount ? { label: `Savings ${r.savingsAccount.accountNumber}`, paidOut: true }
      : r.fixedDeposit ? { label: `Fixed deposit ${r.fixedDeposit.certificateNumber}`, paidOut: true }
      : null;
    const stage: ReferralStage =
      r.onboardingStatus === 'REJECTED' ? 'REJECTED' : opened ? 'OPENED' : r.onboardingStatus === 'APPROVED' ? 'APPROVED' : 'SUBMITTED';
    return {
      id: r.id,
      reference: r.reference,
      kind: PURPOSE_INFO[purpose]?.label ?? 'Application',
      client: `${d.firstName} ${d.lastName}`.trim() || 'Client',
      amount: applicationTerms(purpose, answers).amount,
      submittedAt: r.submittedAt.toISOString(),
      stage,
      opened,
      sale: sale
        ? {
            reference: sale.reference,
            status: sale.status,
            commission: sale.commissionAmount?.toNumber() ?? null,
            commissionPaid: !!sale.commissionPaidAt,
          }
        : null,
    };
  });
}

export type MyReferral = Awaited<ReturnType<typeof getMyReferrals>>[number];
