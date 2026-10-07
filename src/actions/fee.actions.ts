'use server';

/**
 * Fees — Server Actions
 * Hylink Finance Limited EMS
 *
 * Application form fees (lib/fees): the admin sets what each kind of form
 * costs; the product's officers record what applicants pay, each payment
 * booked Dr Cash, Cr Processing & Admin Fees; managers and admins discount a
 * fee with a reason, and reverse a payment recorded in error. Fees are
 * non-refundable, so a payment is never deleted.
 *
 * The fee and charges report brings together application fees and loan
 * default charges collected, discounts and waivers given, and what is still
 * owed, filtered by date, kind, branch, payment mode and officer.
 */

import Decimal from 'decimal.js';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { generateReference } from '@/lib/utils';
import { branchScopeFor, NO_BRANCH } from '@/lib/branch-scope';
import { createJournalEntry, getAccountByCode, reverseJournalEntry } from '@/lib/accounting-engine';
import { feeSummaries } from '@/lib/fee-ledger';
import {
  canDiscount, canManageFees, canViewFeeReport, feeSettingProblem, DEFAULT_FEES, FEE_GL, penaltyOwed,
  type FeeKind,
} from '@/lib/fees';
import {
  applicantDetails, canReviewPurpose, isCustomerPurpose, CUSTOMER_PURPOSES, PURPOSE_INFO, type CustomerPurpose,
} from '@/lib/customer-forms';
import type { Answers } from '@/lib/forms';
import type { Prisma } from '@prisma/client';
import type { ActionResult, SessionUser } from '@/types';

const PAYMENT_MODES = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'POS', 'DIRECT_DEBIT'] as const;
type PaymentMode = (typeof PAYMENT_MODES)[number];

const fullName = (s?: { firstName: string; lastName: string } | null) => (s ? `${s.firstName} ${s.lastName}` : null);

// ─── Settings ───────────────────────────────────────────────────────────────

export interface FeeSettingRow {
  purpose: CustomerPurpose;
  label: string;
  kind: FeeKind;
  amount: number;
  isActive: boolean;
  updatedAt: string | null;
}

export async function getFeeSettings(): Promise<FeeSettingRow[]> {
  const { user } = await getSession();
  if (!canManageFees(user)) throw new Error('Permission denied');
  const rows = await prisma.applicationFee.findMany();
  return CUSTOMER_PURPOSES.map((purpose) => {
    const row = rows.find((r) => r.purpose === purpose);
    const fallback = DEFAULT_FEES[purpose];
    return {
      purpose,
      label: PURPOSE_INFO[purpose].title,
      kind: row?.kind ?? fallback.kind,
      amount: row ? row.amount.toNumber() : fallback.amount,
      isActive: row?.isActive ?? fallback.isActive,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });
}

/** Saves the fee for each kind of form. Forms already submitted keep the fee they were given. */
export async function saveFeeSettings(rows: { purpose: string; kind: string; amount: number; isActive: boolean }[]): Promise<ActionResult> {
  try {
    const { user } = await getSession();
    if (!canManageFees(user)) return { success: false, error: 'Permission denied' };
    if (!Array.isArray(rows) || !rows.length) return { success: false, error: 'Nothing to save' };

    const changes: string[] = [];
    const before = await prisma.applicationFee.findMany();
    for (const r of rows) {
      if (!isCustomerPurpose(r.purpose)) return { success: false, error: 'Unknown kind of form' };
      const amount = Number(r.amount);
      const problem = feeSettingProblem({ kind: r.kind, amount });
      if (problem) return { success: false, error: `${PURPOSE_INFO[r.purpose].title}: ${problem}` };
      const old = before.find((b) => b.purpose === r.purpose);
      const kind = r.kind as FeeKind;
      if (!old || old.kind !== kind || old.amount.toNumber() !== amount || old.isActive !== !!r.isActive) {
        changes.push(`${PURPOSE_INFO[r.purpose].label}: ${r.isActive ? (kind === 'PERCENT' ? `${amount}%` : `NGN ${amount}`) : 'no fee'}`);
      }
    }

    await prisma.$transaction(
      rows.map((r) =>
        prisma.applicationFee.upsert({
          where: { purpose: r.purpose as CustomerPurpose },
          update: { kind: r.kind as FeeKind, amount: Number(r.amount), isActive: !!r.isActive, updatedById: user.id },
          create: { purpose: r.purpose as CustomerPurpose, kind: r.kind as FeeKind, amount: Number(r.amount), isActive: !!r.isActive, updatedById: user.id },
        })
      )
    );
    if (changes.length) {
      await auditLog({
        userId: user.id, userEmail: user.email, userRole: user.roleCode,
        action: 'UPDATE', module: 'SETTINGS', entityType: 'APPLICATION_FEE',
        description: `Changed application fees: ${changes.join('; ')}`,
      });
    }
    return { success: true, message: changes.length ? 'Fees saved' : 'No changes' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not save the fees' };
  }
}

// ─── Payments ───────────────────────────────────────────────────────────────

/** A form whose fee this person handles: a reviewer of its kind, within their branch scope. */
async function feeTarget(user: SessionUser, responseId: string) {
  const r = await prisma.formResponse.findUnique({
    where: { id: String(responseId).slice(0, 64) },
    include: { form: { select: { purpose: true, branchId: true } }, customer: { select: { branchId: true } } },
  });
  if (!r || !isCustomerPurpose(r.form.purpose) || !canReviewPurpose(user, r.form.purpose)) return null;
  const scope = await branchScopeFor(user);
  if (scope && r.form.branchId && r.form.branchId !== scope) return null;
  return { response: r, purpose: r.form.purpose as CustomerPurpose, scope };
}

/** Where a payment is booked: the form's branch, else the customer's, else the officer's own. */
function paymentBranch(t: NonNullable<Awaited<ReturnType<typeof feeTarget>>>): string | null {
  return t.response.form.branchId ?? t.response.customer?.branchId ?? (t.scope && t.scope !== NO_BRANCH ? t.scope : null);
}

function who(answers: unknown) {
  const d = applicantDetails((answers ?? {}) as Answers);
  return `${d.firstName} ${d.lastName}`.trim() || 'Applicant';
}

export interface RecordFeeInput {
  responseId: string;
  amount: number;
  paymentMode: string;
  paymentReference?: string;
}

/** Records money received for a form's fee, with a receipt and its ledger entry. */
export async function recordFeePayment(input: RecordFeeInput): Promise<ActionResult<{ receiptNumber: string }>> {
  try {
    const { user } = await getSession();
    const t = await feeTarget(user, input.responseId);
    if (!t) return { success: false, error: 'Application not found' };
    if (t.response.onboardingStatus === 'REJECTED') return { success: false, error: 'This application was rejected' };
    if (!PAYMENT_MODES.includes(input.paymentMode as PaymentMode)) return { success: false, error: 'Choose how it was paid' };
    const amount = new Decimal(Number(input.amount) || 0).toDecimalPlaces(2);
    if (amount.lte(0)) return { success: false, error: 'Enter the amount received' };

    const position = (await feeSummaries([t.response.id])).get(t.response.id)!;
    if (position.state === 'NONE') return { success: false, error: 'This form has no fee' };
    if (amount.gt(position.balance)) {
      return { success: false, error: position.balance > 0 ? `Only ${position.balance.toLocaleString('en-NG')} is still owed` : 'The fee is already paid' };
    }

    const name = who(t.response.answers);
    const receiptNumber = await generateReference('RECEIPT');
    const branchId = paymentBranch(t);
    const reference = input.paymentReference?.trim().slice(0, 120) || null;

    // The ledger entry first: if the period is closed, nothing is recorded.
    const [cash, income] = await Promise.all([getAccountByCode(FEE_GL.CASH_BANK), getAccountByCode(FEE_GL.FEE_INCOME)]);
    let journalEntryId: string | null = null;
    if (cash && income) {
      const label = `${PURPOSE_INFO[t.purpose].label} form fee - ${t.response.reference ?? name}`;
      const entry = await createJournalEntry({
        entryDate: new Date(),
        description: `${label} - ${receiptNumber}`,
        sourceModule: 'FEES',
        sourceType: 'APPLICATION_FEE',
        sourceId: t.response.id,
        branchId: branchId ?? undefined,
        lines: [
          { accountId: cash.id, debitAmount: amount.toNumber(), creditAmount: 0, description: label },
          { accountId: income.id, debitAmount: 0, creditAmount: amount.toNumber(), description: label, customerId: t.response.customerId ?? undefined },
        ],
        createdById: user.id,
        autoPost: true,
      });
      journalEntryId = entry.id;
    }

    try {
      await prisma.feePayment.create({
        data: {
          receiptNumber, responseId: t.response.id, amount: amount.toNumber(), paymentMode: input.paymentMode as PaymentMode,
          paymentReference: reference, branchId, receivedById: user.id, journalEntryId,
        },
      });
    } catch (error) {
      if (journalEntryId) await reverseJournalEntry(journalEntryId, 'Fee payment could not be saved', user.id).catch(() => {});
      throw error;
    }

    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: 'CREATE', module: 'FEES', entityType: 'FEE_PAYMENT', entityId: t.response.id,
      description: `Received ${amount.toNumber()} (${input.paymentMode}) for ${name}'s ${PURPOSE_INFO[t.purpose].label.toLowerCase()} form fee ${t.response.reference ?? ''}. Receipt ${receiptNumber}`,
    });
    return { success: true, message: `Payment recorded. Receipt ${receiptNumber}`, data: { receiptNumber } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not record the payment' };
  }
}

/**
 * Sets the discount on a form's fee, replacing any earlier one. Managers and
 * admins only, always with a reason. Money already paid cannot be discounted:
 * fees are non-refundable.
 */
export async function setFeeDiscount(responseId: string, discount: number, reason: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();
    if (!canDiscount(user)) return { success: false, error: 'Only a manager or admin can give a discount' };
    const t = await feeTarget(user, responseId);
    if (!t) return { success: false, error: 'Application not found' };
    const amount = new Decimal(Number(discount) || 0).toDecimalPlaces(2);
    const why = (reason ?? '').trim().slice(0, 300);
    if (amount.lt(0)) return { success: false, error: 'A discount cannot be negative' };
    if (amount.gt(0) && why.length < 5) return { success: false, error: 'Give the reason for the discount' };

    const position = (await feeSummaries([t.response.id])).get(t.response.id)!;
    if (position.state === 'NONE') return { success: false, error: 'This form has no fee' };
    const most = new Decimal(position.due).minus(position.paid);
    if (amount.gt(most)) {
      return { success: false, error: `The most you can discount is ${most.toNumber().toLocaleString('en-NG')}: the rest is already paid` };
    }

    await prisma.formResponse.update({
      where: { id: t.response.id },
      data: amount.gt(0)
        ? { feeDiscount: amount.toNumber(), discountReason: why, discountById: user.id, discountAt: new Date() }
        : { feeDiscount: 0, discountReason: null, discountById: null, discountAt: null },
    });
    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: 'UPDATE', module: 'FEES', entityType: 'FEE_DISCOUNT', entityId: t.response.id,
      description: amount.gt(0)
        ? `Discounted ${who(t.response.answers)}'s fee ${t.response.reference ?? ''} by ${amount.toNumber()} of ${position.due}: ${why}`
        : `Removed the discount on ${who(t.response.answers)}'s fee ${t.response.reference ?? ''}`,
    });
    return { success: true, message: amount.gt(0) ? 'Discount applied' : 'Discount removed' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not set the discount' };
  }
}

/** Reverses a payment recorded in error, and its ledger entry. Managers and admins only. */
export async function reverseFeePayment(paymentId: string, reason: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();
    if (!canDiscount(user)) return { success: false, error: 'Only a manager or admin can reverse a payment' };
    const why = (reason ?? '').trim().slice(0, 300);
    if (why.length < 5) return { success: false, error: 'Give the reason for reversing it' };
    const payment = await prisma.feePayment.findUnique({ where: { id: String(paymentId).slice(0, 64) } });
    if (!payment) return { success: false, error: 'Payment not found' };
    const t = await feeTarget(user, payment.responseId);
    if (!t) return { success: false, error: 'Payment not found' };

    // Claim it first, so it cannot be reversed twice.
    const claim = await prisma.feePayment.updateMany({
      where: { id: payment.id, reversedAt: null },
      data: { reversedAt: new Date(), reversedById: user.id, reversalReason: why },
    });
    if (claim.count === 0) return { success: false, error: 'Already reversed' };
    if (payment.journalEntryId) {
      try {
        await reverseJournalEntry(payment.journalEntryId, `Fee payment ${payment.receiptNumber} reversed: ${why}`, user.id);
      } catch (error) {
        await prisma.feePayment.update({ where: { id: payment.id }, data: { reversedAt: null, reversedById: null, reversalReason: null } });
        throw error;
      }
    }
    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: 'REVERSAL', module: 'FEES', entityType: 'FEE_PAYMENT', entityId: payment.id,
      description: `Reversed fee payment ${payment.receiptNumber} (${payment.amount.toNumber()}): ${why}`,
    });
    return { success: true, message: `Receipt ${payment.receiptNumber} reversed` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not reverse the payment' };
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────

export type FeeType = CustomerPurpose | 'DEFAULT_CHARGES';

export interface FeeReportFilters {
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
  type?: FeeType | 'ALL';
  branchId?: string;
  paymentMode?: string;
  receivedById?: string;
}

const TYPE_LABEL = (t: FeeType) => (t === 'DEFAULT_CHARGES' ? 'Loan default charges' : t === 'LOAN_APPLICATION' ? 'Loan processing fee' : `${PURPOSE_INFO[t].label} form fee`);

function dayRange(from?: string, to?: string) {
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const now = new Date();
  const start = ok(from) ? new Date(`${from}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = ok(to) ? new Date(`${to}T23:59:59.999`) : now;
  return { gte: start, lte: end };
}

/** Fees and default charges collected, discounts and waivers given, and what is owed. */
export async function getFeeReport(filters: FeeReportFilters = {}) {
  const { user } = await getSession();
  if (!canViewFeeReport(user)) throw new Error('Permission denied');
  const scope = await branchScopeFor(user);
  const branch = scope ?? (filters.branchId || null);
  const range = dayRange(filters.from, filters.to);
  const type = filters.type && filters.type !== 'ALL' ? filters.type : null;
  const mode = PAYMENT_MODES.includes(filters.paymentMode as PaymentMode) ? (filters.paymentMode as PaymentMode) : null;
  const officer = filters.receivedById || null;
  const formFees = type !== 'DEFAULT_CHARGES';
  const charges = !type || type === 'DEFAULT_CHARGES';

  const paymentWhere: Prisma.FeePaymentWhereInput = {
    receivedAt: range,
    ...(branch ? { branchId: branch } : {}),
    ...(mode ? { paymentMode: mode } : {}),
    ...(officer ? { receivedById: officer } : {}),
    ...(type && type !== 'DEFAULT_CHARGES' ? { response: { form: { purpose: type } } } : {}),
  };
  const repaymentWhere: Prisma.LoanRepaymentWhereInput = {
    collectedAt: range,
    penaltyPortion: { gt: 0 },
    ...(branch ? { loan: { branchId: branch } } : {}),
    ...(mode ? { paymentMode: mode } : {}),
    ...(officer ? { collectedById: officer } : {}),
  };
  const responseScope: Prisma.FormResponseWhereInput = {
    form: {
      purpose: type && type !== 'DEFAULT_CHARGES' ? type : { in: [...CUSTOMER_PURPOSES] },
      ...(branch ? { OR: [{ branchId: branch }, { branchId: null }] } : {}),
    },
  };

  const [payments, penaltyRepayments, discounts, waivers, accrued, owingApps, owingSchedules, branches, staff] = await Promise.all([
    formFees
      ? prisma.feePayment.findMany({
          where: paymentWhere,
          orderBy: { receivedAt: 'desc' },
          take: 2000,
          include: {
            response: { select: { reference: true, answers: true, form: { select: { purpose: true } } } },
            branch: { select: { name: true } },
            receivedBy: { select: { firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
    charges
      ? prisma.loanRepayment.findMany({
          where: repaymentWhere,
          orderBy: { collectedAt: 'desc' },
          take: 2000,
          include: {
            loan: { select: { loanNumber: true, branch: { select: { name: true } }, customer: { select: { firstName: true, lastName: true } } } },
          },
        })
      : Promise.resolve([]),
    formFees
      ? prisma.formResponse.findMany({
          where: { ...responseScope, discountAt: range, feeDiscount: { gt: 0 } },
          orderBy: { discountAt: 'desc' },
          take: 500,
          select: {
            id: true, reference: true, answers: true, feeDue: true, feeDiscount: true, discountReason: true, discountAt: true,
            form: { select: { purpose: true } }, discountBy: { select: { firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
    charges
      ? prisma.loanPenaltyWaiver.findMany({
          where: { createdAt: range, ...(branch ? { loan: { branchId: branch } } : {}) },
          orderBy: { createdAt: 'desc' },
          take: 500,
          include: {
            loan: { select: { loanNumber: true, customer: { select: { firstName: true, lastName: true } } } },
            waivedBy: { select: { firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
    charges
      ? prisma.loanPenaltyCharge.aggregate({
          where: { chargeDate: range, ...(branch ? { loan: { branchId: branch } } : {}) },
          _sum: { amount: true },
        })
      : Promise.resolve(null),
    formFees
      ? prisma.formResponse.findMany({
          where: { ...responseScope, feeDue: { gt: 0 }, onboardingStatus: { not: 'REJECTED' } },
          select: { id: true },
          take: 5000,
        })
      : Promise.resolve([]),
    charges
      ? prisma.loanSchedule.findMany({
          where: {
            penaltyDue: { gt: 0 },
            loan: { status: { notIn: ['CLOSED', 'WRITTEN_OFF'] }, ...(branch ? { branchId: branch } : {}) },
          },
          select: { penaltyDue: true, penaltyPaid: true, penaltyWaived: true, loanId: true },
        })
      : Promise.resolve([]),
    scope ? Promise.resolve([]) : prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    officersWhoCollected(),
  ]);

  const rows = [
    ...payments.map((p) => {
      const t = p.response.form.purpose as CustomerPurpose;
      return {
        id: p.id,
        date: p.receivedAt.toISOString(),
        receiptNumber: p.receiptNumber,
        type: t as FeeType,
        typeLabel: TYPE_LABEL(t),
        payer: who(p.response.answers),
        reference: p.response.reference,
        amount: p.amount.toNumber(),
        paymentMode: p.paymentMode as string,
        branch: p.branch?.name ?? null,
        receivedBy: fullName(p.receivedBy),
        reversed: !!p.reversedAt,
        reversalReason: p.reversalReason,
      };
    }),
    ...penaltyRepayments.map((r) => ({
      id: r.id,
      date: r.collectedAt.toISOString(),
      receiptNumber: r.receiptNumber,
      type: 'DEFAULT_CHARGES' as FeeType,
      typeLabel: TYPE_LABEL('DEFAULT_CHARGES'),
      payer: fullName(r.loan.customer) ?? '',
      reference: r.loan.loanNumber,
      amount: r.penaltyPortion.toNumber(),
      paymentMode: r.paymentMode as string,
      branch: r.loan.branch?.name ?? null,
      receivedBy: null as string | null,
      reversed: false,
      reversalReason: null as string | null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  // Names for repayment collectors, read once.
  const collectorIds = [...new Set(penaltyRepayments.map((r) => r.collectedById))];
  if (collectorIds.length) {
    const people = await prisma.staff.findMany({ where: { id: { in: collectorIds } }, select: { id: true, firstName: true, lastName: true } });
    const byId = new Map(people.map((p) => [p.id, fullName(p)]));
    for (const row of rows) {
      if (row.type === 'DEFAULT_CHARGES') {
        const r = penaltyRepayments.find((x) => x.id === row.id);
        if (r) row.receivedBy = byId.get(r.collectedById) ?? null;
      }
    }
  }

  const live = rows.filter((r) => !r.reversed);
  const byType = new Map<FeeType, { label: string; count: number; amount: number }>();
  for (const r of live) {
    const t = byType.get(r.type) ?? { label: r.typeLabel, count: 0, amount: 0 };
    t.count += 1;
    t.amount = new Decimal(t.amount).plus(r.amount).toNumber();
    byType.set(r.type, t);
  }
  const byMode = new Map<string, number>();
  for (const r of live) byMode.set(r.paymentMode, new Decimal(byMode.get(r.paymentMode) ?? 0).plus(r.amount).toNumber());

  const summaries = await feeSummaries(owingApps.map((a) => a.id));
  const feesOwed = [...summaries.values()].reduce((t, s) => t.plus(s.balance), new Decimal(0)).toNumber();
  const chargesOwed = owingSchedules
    .reduce((t, s) => t.plus(penaltyOwed({ penaltyDue: s.penaltyDue.toNumber(), penaltyPaid: s.penaltyPaid.toNumber(), penaltyWaived: s.penaltyWaived.toNumber() })), new Decimal(0))
    .toNumber();

  return {
    range: { from: range.gte.toISOString(), to: range.lte.toISOString() },
    rows,
    totals: {
      collected: live.reduce((t, r) => t.plus(r.amount), new Decimal(0)).toNumber(),
      count: live.length,
      reversed: rows.filter((r) => r.reversed).reduce((t, r) => t.plus(r.amount), new Decimal(0)).toNumber(),
      discounts: discounts.reduce((t, d) => t.plus(d.feeDiscount.toNumber()), new Decimal(0)).toNumber(),
      waivers: waivers.reduce((t, w) => t.plus(w.amount.toNumber()), new Decimal(0)).toNumber(),
      chargesAccrued: accrued?._sum.amount?.toNumber() ?? 0,
      feesOwed,
      feesOwedCount: [...summaries.values()].filter((s) => s.balance > 0).length,
      chargesOwed,
      chargesOwedLoans: new Set(owingSchedules.filter((s) => penaltyOwed({ penaltyDue: s.penaltyDue.toNumber(), penaltyPaid: s.penaltyPaid.toNumber(), penaltyWaived: s.penaltyWaived.toNumber() }) > 0).map((s) => s.loanId)).size,
    },
    byType: [...byType.entries()].map(([type, v]) => ({ type, ...v })),
    byMode: [...byMode.entries()].map(([mode, amount]) => ({ mode, amount })),
    discounts: discounts.map((d) => ({
      id: d.id,
      date: d.discountAt!.toISOString(),
      typeLabel: TYPE_LABEL(d.form.purpose as CustomerPurpose),
      payer: who(d.answers),
      reference: d.reference,
      fee: d.feeDue?.toNumber() ?? 0,
      discount: d.feeDiscount.toNumber(),
      reason: d.discountReason,
      by: fullName(d.discountBy),
    })),
    waivers: waivers.map((w) => ({
      id: w.id,
      date: w.createdAt.toISOString(),
      loanNumber: w.loan.loanNumber,
      borrower: fullName(w.loan.customer),
      amount: w.amount.toNumber(),
      reason: w.reason,
      by: fullName(w.waivedBy),
    })),
    options: {
      branches,
      staff: staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
      types: [...CUSTOMER_PURPOSES.map((p) => ({ value: p as FeeType, label: TYPE_LABEL(p) })), { value: 'DEFAULT_CHARGES' as FeeType, label: TYPE_LABEL('DEFAULT_CHARGES') }],
      modes: [...PAYMENT_MODES],
      lockedToBranch: !!scope,
    },
  };
}

export type FeeReport = Awaited<ReturnType<typeof getFeeReport>>;

/** Staff who have ever received a fee or collected a default charge: the officer filter's choices. */
async function officersWhoCollected() {
  const [fees, repayments] = await Promise.all([
    prisma.feePayment.groupBy({ by: ['receivedById'] }),
    prisma.loanRepayment.groupBy({ by: ['collectedById'], where: { penaltyPortion: { gt: 0 } } }),
  ]);
  const ids = [...new Set([...fees.map((f) => f.receivedById), ...repayments.map((r) => r.collectedById)])];
  if (!ids.length) return [];
  return prisma.staff.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { firstName: 'asc' },
  });
}
