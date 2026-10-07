'use server';

/**
 * The customer's portfolio — Server Actions
 * Hylink Finance Limited EMS
 *
 * What a signed-in customer sees of their own money (/portal): every savings
 * plan, mutual partnership, fixed deposit and loan, their statements, the
 * application forms they filled with the fees and receipts, and what is
 * coming up. Read-only.
 *
 * Every action works only for a customer session and only ever reads records
 * whose customerId is that customer's own: an id from another customer reads
 * as "not found". Staff names are never shown; staff ids never leave here.
 */

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';
import { feeSummaries } from '@/lib/fee-ledger';
import { PURPOSE_INFO, isCustomerPurpose, type CustomerPurpose } from '@/lib/customer-forms';
import {
  savingsPosition, depositPosition, loanPosition, loanStage, portfolioTotals, termProgress, daysUntil, isPartnershipPlan,
  type Holding,
} from '@/lib/portfolio';
import { penaltyOwed } from '@/lib/fees';

async function requireCustomer(): Promise<string> {
  const { user } = await getSession();
  if (user.userType !== 'customer') throw new Error('This area is for customers only');
  return user.id;
}

type Dec = { toNumber(): number };
const n = (d: Dec | null | undefined) => (d ? d.toNumber() : 0);
const nn = (d: Dec | null | undefined) => (d ? d.toNumber() : null);

const TXN_LABEL: Record<string, string> = {
  DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal', INTEREST_CREDIT: 'Interest', INTEREST_ACCRUAL: 'Interest accrued',
  MATURITY_PAYOUT: 'Maturity payout', TERMINATION_PAYOUT: 'Early exit payout', FEE_DEBIT: 'Fee', TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out', REVERSAL: 'Reversal', ADJUSTMENT: 'Adjustment',
};
const MONEY_IN = ['DEPOSIT', 'INTEREST_CREDIT', 'TRANSFER_IN'];

function savingsRow(s: {
  id: string; accountNumber: string; status: string; currentBalance: Dec; totalDeposits: Dec; interestAccrued: Dec;
  interestPaidToDate: Dec; interestTargetTotal: Dec | null; contractedTotalRate: Dec | null; contractedDurationMonths: number | null;
  startDate: Date | null; maturityDate: Date | null; openedAt: Date; monthsRemaining: number | null;
  product: { name: string; totalInterestRate: Dec | null; durationMonths: number | null };
}) {
  const pos = savingsPosition({
    currentBalance: n(s.currentBalance), totalDeposits: n(s.totalDeposits), interestAccrued: n(s.interestAccrued),
    interestPaidToDate: n(s.interestPaidToDate), interestTargetTotal: nn(s.interestTargetTotal), status: s.status,
  });
  const start = s.startDate ?? s.openedAt;
  return {
    id: s.id,
    kind: (isPartnershipPlan(s.product.name) ? 'PARTNERSHIP' : 'SAVINGS') as Holding['kind'],
    accountNumber: s.accountNumber,
    product: s.product.name,
    status: s.status,
    balance: n(s.currentBalance),
    deposited: n(s.totalDeposits),
    rate: nn(s.contractedTotalRate) ?? nn(s.product.totalInterestRate),
    months: s.contractedDurationMonths ?? s.product.durationMonths,
    startDate: start.toISOString(),
    maturityDate: s.maturityDate?.toISOString() ?? null,
    progress: termProgress(start, s.maturityDate),
    ...pos,
  };
}

export async function getMyPortfolio() {
  const customerId = await requireCustomer();
  const now = new Date();

  const [customer, savings, deposits, loans, applications, txns, repayments] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { customerNumber: true, title: true, firstName: true, lastName: true, email: true, phone: true, address: true, branch: { select: { name: true, phone: true } } },
    }),
    prisma.savingsAccount.findMany({
      where: { customerId, isDeleted: false },
      orderBy: { openedAt: 'desc' },
      include: { product: { select: { name: true, totalInterestRate: true, durationMonths: true } } },
    }),
    prisma.fixedDeposit.findMany({ where: { customerId }, orderBy: { startDate: 'desc' } }),
    prisma.loan.findMany({
      where: { customerId, isDeleted: false },
      orderBy: { applicationDate: 'desc' },
      include: {
        product: { select: { name: true } },
        schedule: { orderBy: { installmentNumber: 'asc' } },
        repayments: { select: { amount: true } },
      },
    }),
    prisma.formResponse.findMany({
      where: { customerId },
      orderBy: { submittedAt: 'desc' },
      select: { id: true, reference: true, submittedAt: true, onboardingStatus: true, form: { select: { purpose: true, title: true } } },
    }),
    prisma.savingsTransaction.findMany({
      where: { account: { customerId }, isReversed: false },
      orderBy: { processedAt: 'desc' },
      take: 15,
      select: { id: true, transactionType: true, amount: true, processedAt: true, transactionRef: true, account: { select: { accountNumber: true } } },
    }),
    prisma.loanRepayment.findMany({
      where: { loan: { customerId } },
      orderBy: { collectedAt: 'desc' },
      take: 15,
      select: { id: true, amount: true, collectedAt: true, receiptNumber: true, loan: { select: { loanNumber: true } } },
    }),
  ]);
  if (!customer) throw new Error('Your profile was not found');

  const savingsRows = savings.map(savingsRow);
  const depositRows = deposits.map((d) => ({
    id: d.id,
    certificateNumber: d.certificateNumber,
    status: d.status,
    principal: n(d.principalAmount),
    rate: n(d.interestRate),
    tenureDays: d.tenure,
    startDate: d.startDate.toISOString(),
    maturityDate: d.maturityDate.toISOString(),
    progress: termProgress(d.startDate, d.maturityDate, now),
    daysLeft: Math.max(0, daysUntil(d.maturityDate, now)),
    ...depositPosition({ principalAmount: n(d.principalAmount), accruedInterest: n(d.accruedInterest), maturityAmount: n(d.maturityAmount), status: d.status }),
  }));
  const loanRows = loans.map((l) => {
    const pos = loanPosition(
      { status: l.status, principalAmount: n(l.principalAmount), totalRepayment: n(l.totalRepayment) },
      l.schedule.map((s) => ({
        installmentNumber: s.installmentNumber, dueDate: s.dueDate, principalDue: n(s.principalDue), interestDue: n(s.interestDue),
        principalPaid: n(s.principalPaid), interestPaid: n(s.interestPaid), penaltyDue: n(s.penaltyDue), penaltyPaid: n(s.penaltyPaid),
        penaltyWaived: n(s.penaltyWaived), status: s.status,
      })),
      l.repayments.reduce((t, r) => t + n(r.amount), 0),
      now
    );
    return {
      id: l.id, loanNumber: l.loanNumber, product: l.product.name, status: l.status, stage: loanStage(l.status),
      principal: n(l.principalAmount), totalRepayment: n(l.totalRepayment), tenure: l.tenure,
      applicationDate: l.applicationDate.toISOString(), maturityDate: l.maturityDate?.toISOString() ?? null, ...pos,
    };
  });

  const holdings: Holding[] = [
    ...savingsRows.filter((s) => s.held).map((s) => ({ kind: s.kind, value: s.value, earned: s.earned, atMaturity: s.atMaturity })),
    ...depositRows.filter((d) => d.held).map((d) => ({ kind: 'FIXED_DEPOSIT' as const, value: d.value, earned: d.earned, atMaturity: d.atMaturity })),
  ];
  const totals = portfolioTotals(holdings, loanRows.map((l) => l.outstanding));

  // The next 120 days: maturities and repayments due.
  const horizon = 120;
  const upcoming = [
    ...savingsRows.filter((s) => s.held && s.maturityDate && daysUntil(s.maturityDate, now) >= 0 && daysUntil(s.maturityDate, now) <= horizon)
      .map((s) => ({ date: s.maturityDate!, kind: 'MATURITY' as const, title: `${s.product} matures`, amount: s.atMaturity, href: `/portal/savings/${s.id}` })),
    ...depositRows.filter((d) => d.status === 'ACTIVE' && daysUntil(d.maturityDate, now) <= horizon)
      .map((d) => ({ date: d.maturityDate, kind: 'MATURITY' as const, title: `Fixed deposit ${d.certificateNumber} matures`, amount: d.atMaturity, href: `/portal/deposits/${d.id}` })),
    ...loans.filter((l) => ['DISBURSED', 'ACTIVE', 'OVERDUE', 'DEFAULTED'].includes(l.status)).flatMap((l) =>
      l.schedule
        .filter((s) => !['PAID', 'SUPERSEDED', 'WAIVED'].includes(s.status) && daysUntil(s.dueDate, now) <= horizon)
        .slice(0, 3)
        .map((s) => {
          const owed = Math.max(0, n(s.principalDue) + n(s.interestDue) - n(s.principalPaid) - n(s.interestPaid))
            + penaltyOwed({ penaltyDue: n(s.penaltyDue), penaltyPaid: n(s.penaltyPaid), penaltyWaived: n(s.penaltyWaived) });
          return {
            date: s.dueDate.toISOString(),
            kind: (daysUntil(s.dueDate, now) < 0 ? 'OVERDUE' : 'REPAYMENT') as 'OVERDUE' | 'REPAYMENT',
            title: `Loan ${l.loanNumber} instalment ${s.installmentNumber}`,
            amount: Math.round(owed * 100) / 100,
            href: `/portal/loans/${l.id}`,
          };
        })
    ),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // Application forms, with their fees and receipts.
  const fees = await feeSummaries(applications.map((a) => a.id));
  const feePaymentsRecent = [...fees.entries()].flatMap(([responseId, f]) =>
    f.payments.filter((p) => !p.reversed).map((p) => ({ ...p, responseId }))
  );

  const activity = [
    ...txns.map((t) => ({
      id: `s-${t.id}`, date: t.processedAt.toISOString(), title: TXN_LABEL[t.transactionType] ?? t.transactionType,
      detail: `Savings ${t.account.accountNumber} · ${t.transactionRef}`, amount: n(t.amount), direction: MONEY_IN.includes(t.transactionType) ? 'in' : 'out',
    })),
    ...repayments.map((r) => ({
      id: `r-${r.id}`, date: r.collectedAt.toISOString(), title: 'Loan repayment',
      detail: `Loan ${r.loan.loanNumber} · receipt ${r.receiptNumber}`, amount: n(r.amount), direction: 'out',
    })),
    ...feePaymentsRecent.map((p) => ({
      id: `f-${p.id}`, date: p.receivedAt, title: 'Form fee paid', detail: `Receipt ${p.receiptNumber}`, amount: p.amount, direction: 'out',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20) as { id: string; date: string; title: string; detail: string; amount: number; direction: 'in' | 'out' }[];

  return {
    customer: {
      customerNumber: customer.customerNumber,
      name: [customer.title, customer.firstName, customer.lastName].filter(Boolean).join(' '),
      firstName: customer.firstName,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      branch: customer.branch?.name ?? null,
      branchPhone: customer.branch?.phone ?? null,
    },
    totals,
    savings: savingsRows,
    deposits: depositRows,
    loans: loanRows,
    upcoming,
    activity,
    applications: applications
      .filter((a) => isCustomerPurpose(a.form.purpose))
      .map((a) => {
        const f = fees.get(a.id);
        return {
          id: a.id,
          reference: a.reference,
          kind: PURPOSE_INFO[a.form.purpose as CustomerPurpose].label,
          title: a.form.title,
          submittedAt: a.submittedAt.toISOString(),
          status: a.onboardingStatus,
          fee: f && f.state !== 'NONE'
            ? {
                state: f.state, due: f.due, discount: f.discount, paid: f.paid, balance: f.balance, basis: f.basis,
                receipts: f.payments.filter((p) => !p.reversed).map((p) => ({ receiptNumber: p.receiptNumber, amount: p.amount, date: p.receivedAt, mode: p.paymentMode })),
              }
            : null,
        };
      }),
    asOf: now.toISOString(),
  };
}

export type Portfolio = Awaited<ReturnType<typeof getMyPortfolio>>;

/** One savings plan with its full statement. Null when it is not this customer's. */
export async function getMySavings(id: string) {
  const customerId = await requireCustomer();
  const s = await prisma.savingsAccount.findFirst({
    where: { id: String(id).slice(0, 64), customerId, isDeleted: false },
    include: {
      product: { select: { name: true, totalInterestRate: true, durationMonths: true, allowEarlyTermination: true } },
      transactions: { orderBy: { processedAt: 'asc' } },
      dailyInterest: { select: { date: true, amount: true } },
    },
  });
  if (!s) return null;

  // Interest by month, from the daily credits.
  const months = new Map<string, number>();
  for (const d of s.dailyInterest) {
    const key = d.date.toISOString().slice(0, 7);
    months.set(key, Math.round(((months.get(key) ?? 0) + n(d.amount)) * 100) / 100);
  }

  return {
    ...savingsRow(s),
    pendingDeposits: n(s.pendingDeposits),
    eligibleBalance: n(s.eligibleBalance),
    earningStartDate: s.earningStartDate?.toISOString() ?? null,
    interestTarget: nn(s.interestTargetTotal),
    interestPaid: n(s.interestPaidToDate),
    allowEarlyExit: s.product.allowEarlyTermination,
    statement: s.transactions.map((t) => ({
      id: t.id,
      date: t.processedAt.toISOString(),
      ref: t.transactionRef,
      type: TXN_LABEL[t.transactionType] ?? t.transactionType,
      direction: MONEY_IN.includes(t.transactionType) ? 'in' : 'out',
      amount: n(t.amount),
      balance: n(t.balanceAfter),
      reversed: t.isReversed,
      narration: t.narration ?? t.description ?? null,
    })),
    interestByMonth: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount })),
  };
}

/** One fixed deposit, as its certificate. Null when it is not this customer's. */
export async function getMyDeposit(id: string) {
  const customerId = await requireCustomer();
  const d = await prisma.fixedDeposit.findFirst({
    where: { id: String(id).slice(0, 64), customerId },
    include: { branch: { select: { name: true } }, customer: { select: { firstName: true, lastName: true, customerNumber: true } } },
  });
  if (!d) return null;
  const now = new Date();
  return {
    id: d.id,
    certificateNumber: d.certificateNumber,
    holder: `${d.customer.firstName} ${d.customer.lastName}`,
    customerNumber: d.customer.customerNumber,
    branch: d.branch?.name ?? null,
    status: d.status,
    principal: n(d.principalAmount),
    rate: n(d.interestRate),
    tenureDays: d.tenure,
    interestAmount: n(d.interestAmount),
    maturityAmount: n(d.maturityAmount),
    accruedInterest: n(d.accruedInterest),
    startDate: d.startDate.toISOString(),
    maturityDate: d.maturityDate.toISOString(),
    interestPayment: d.interestPayment,
    maturityInstruction: d.maturityInstruction,
    progress: termProgress(d.startDate, d.maturityDate, now),
    daysLeft: Math.max(0, daysUntil(d.maturityDate, now)),
    paidOut: nn(d.amountPaid),
    closedAt: d.terminatedAt?.toISOString() ?? null,
  };
}

/** One loan: where it stands, its schedule, payments and default charges. Null when it is not this customer's. */
export async function getMyLoan(id: string) {
  const customerId = await requireCustomer();
  const l = await prisma.loan.findFirst({
    where: { id: String(id).slice(0, 64), customerId, isDeleted: false },
    include: {
      product: { select: { name: true, penaltyRate: true, gracePeriodDays: true } },
      schedule: { orderBy: { installmentNumber: 'asc' } },
      repayments: { orderBy: { collectedAt: 'desc' } },
      guarantors: { select: { firstName: true, lastName: true } },
      disbursement: { select: { disbursedAmount: true, disbursedAt: true } },
    },
  });
  if (!l) return null;
  const schedule = l.schedule.map((s) => ({
    installmentNumber: s.installmentNumber, dueDate: s.dueDate, principalDue: n(s.principalDue), interestDue: n(s.interestDue),
    principalPaid: n(s.principalPaid), interestPaid: n(s.interestPaid), penaltyDue: n(s.penaltyDue), penaltyPaid: n(s.penaltyPaid),
    penaltyWaived: n(s.penaltyWaived), status: s.status,
  }));
  const pos = loanPosition(
    { status: l.status, principalAmount: n(l.principalAmount), totalRepayment: n(l.totalRepayment) },
    schedule,
    l.repayments.reduce((t, r) => t + n(r.amount), 0)
  );
  return {
    id: l.id,
    loanNumber: l.loanNumber,
    product: l.product.name,
    status: l.status,
    stage: loanStage(l.status),
    principal: n(l.principalAmount),
    interestRate: n(l.interestRate),
    tenure: l.tenure,
    totalInterest: n(l.totalInterest),
    totalRepayment: n(l.totalRepayment),
    instalmentAmount: n(l.monthlyInstalment),
    processingFee: n(l.processingFee),
    purpose: l.purpose,
    applicationDate: l.applicationDate.toISOString(),
    disbursed: l.disbursement ? { amount: n(l.disbursement.disbursedAmount), date: l.disbursement.disbursedAt.toISOString() } : null,
    maturityDate: l.maturityDate?.toISOString() ?? null,
    penaltyRate: nn(l.product.penaltyRate),
    graceDays: l.product.gracePeriodDays,
    guarantors: l.guarantors.map((g) => `${g.firstName} ${g.lastName}`),
    ...pos,
    schedule: schedule
      .filter((s) => s.status !== 'SUPERSEDED')
      .map((s) => ({
        installmentNumber: s.installmentNumber,
        dueDate: new Date(s.dueDate).toISOString(),
        due: s.principalDue + s.interestDue,
        paid: s.principalPaid + s.interestPaid,
        charges: penaltyOwed(s),
        status: s.status,
      })),
    repayments: l.repayments.map((r) => ({
      id: r.id,
      receiptNumber: r.receiptNumber,
      date: r.collectedAt.toISOString(),
      amount: n(r.amount),
      principal: n(r.principalPortion),
      interest: n(r.interestPortion),
      charges: n(r.penaltyPortion),
      mode: r.paymentMode,
    })),
  };
}
