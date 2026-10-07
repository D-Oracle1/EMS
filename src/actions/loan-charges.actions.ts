'use server';

/**
 * Loan default charges — Server Actions
 * Hylink Finance Limited EMS
 *
 * Charges accrue daily on overdue instalments (lib/loan-penalties) at the
 * product's penalty rate after its grace period, and repayments clear them
 * first (lib/money-posting). Here: what a loan has been charged, paid and
 * waived, and waiving, which only a manager or admin may do, with a reason.
 */

import Decimal from 'decimal.js';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { branchScopeFor, inScope } from '@/lib/branch-scope';
import { canDiscount, penaltyOwed } from '@/lib/fees';
import type { ActionResult, SessionUser } from '@/types';

const fullName = (s?: { firstName: string; lastName: string } | null) => (s ? `${s.firstName} ${s.lastName}` : null);

async function loanFor(user: SessionUser, loanId: string) {
  if (!user.permissions.includes('LOANS:READ') && !user.permissions.includes('LOANS:CREATE')) return null;
  const loan = await prisma.loan.findUnique({
    where: { id: String(loanId).slice(0, 64) },
    select: {
      id: true, loanNumber: true, branchId: true, createdById: true, status: true,
      product: { select: { penaltyRate: true, gracePeriodDays: true } },
    },
  });
  if (!loan || !inScope(await branchScopeFor(user), loan.branchId)) return null;
  // Loan officers see only their own loans, as on the loan page.
  if (user.permissions.includes('LOANS:CREATE') && !user.permissions.includes('LOANS:MANAGE_ALL') && loan.createdById !== user.id) return null;
  return loan;
}

export async function getLoanDefaultCharges(loanId: string) {
  const { user } = await getSession();
  const loan = await loanFor(user, loanId);
  if (!loan) return null;

  const [schedules, recent, waivers] = await Promise.all([
    prisma.loanSchedule.findMany({
      where: { loanId: loan.id },
      orderBy: { installmentNumber: 'asc' },
      select: { id: true, installmentNumber: true, dueDate: true, penaltyDue: true, penaltyPaid: true, penaltyWaived: true },
    }),
    prisma.loanPenaltyCharge.findMany({
      where: { loanId: loan.id },
      orderBy: [{ chargeDate: 'desc' }, { createdAt: 'desc' }],
      take: 30,
      include: { schedule: { select: { installmentNumber: true } } },
    }),
    prisma.loanPenaltyWaiver.findMany({
      where: { loanId: loan.id },
      orderBy: { createdAt: 'desc' },
      include: { waivedBy: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const n = (d: { toNumber(): number }) => d.toNumber();
  const instalments = schedules
    .map((s) => ({
      installmentNumber: s.installmentNumber,
      dueDate: s.dueDate.toISOString(),
      charged: n(s.penaltyDue),
      paid: n(s.penaltyPaid),
      waived: n(s.penaltyWaived),
      owed: penaltyOwed({ penaltyDue: n(s.penaltyDue), penaltyPaid: n(s.penaltyPaid), penaltyWaived: n(s.penaltyWaived) }),
    }))
    .filter((s) => s.charged > 0);
  const sum = (k: 'charged' | 'paid' | 'waived' | 'owed') => instalments.reduce((t, s) => t.plus(s[k]), new Decimal(0)).toNumber();

  return {
    loanNumber: loan.loanNumber,
    rate: loan.product.penaltyRate?.toNumber() ?? null,
    graceDays: loan.product.gracePeriodDays,
    totals: { charged: sum('charged'), paid: sum('paid'), waived: sum('waived'), owed: sum('owed') },
    instalments,
    recent: recent.map((c) => ({
      id: c.id,
      date: c.chargeDate.toISOString(),
      installmentNumber: c.schedule.installmentNumber,
      overdueAmount: c.overdueAmount.toNumber(),
      rate: c.rate.toNumber(),
      amount: c.amount.toNumber(),
    })),
    waivers: waivers.map((w) => ({
      id: w.id, date: w.createdAt.toISOString(), amount: w.amount.toNumber(), reason: w.reason, by: fullName(w.waivedBy),
    })),
    canWaive: canDiscount(user),
  };
}

/**
 * Forgives up to `amount` of a loan's unpaid default charges, oldest
 * instalment first. Managers and admins only, always with a reason.
 */
export async function waiveDefaultCharges(loanId: string, amount: number, reason: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();
    if (!canDiscount(user)) return { success: false, error: 'Only a manager or admin can waive default charges' };
    const loan = await loanFor(user, loanId);
    if (!loan) return { success: false, error: 'Loan not found' };
    const why = (reason ?? '').trim().slice(0, 300);
    if (why.length < 5) return { success: false, error: 'Give the reason for the waiver' };
    let left = new Decimal(Number(amount) || 0).toDecimalPlaces(2);
    if (left.lte(0)) return { success: false, error: 'Enter the amount to waive' };

    const waived = await prisma.$transaction(async (tx) => {
      const schedules = await tx.loanSchedule.findMany({
        where: { loanId: loan.id, penaltyDue: { gt: 0 } },
        orderBy: { installmentNumber: 'asc' },
        select: { id: true, penaltyDue: true, penaltyPaid: true, penaltyWaived: true },
      });
      const owed = schedules.reduce(
        (t, s) => t.plus(penaltyOwed({ penaltyDue: s.penaltyDue.toNumber(), penaltyPaid: s.penaltyPaid.toNumber(), penaltyWaived: s.penaltyWaived.toNumber() })),
        new Decimal(0)
      );
      if (left.gt(owed)) throw new Error(`Only ${owed.toNumber().toLocaleString('en-NG')} in default charges is owed`);
      const total = left;
      for (const s of schedules) {
        if (left.lte(0)) break;
        const o = penaltyOwed({ penaltyDue: s.penaltyDue.toNumber(), penaltyPaid: s.penaltyPaid.toNumber(), penaltyWaived: s.penaltyWaived.toNumber() });
        const part = Decimal.min(o, left);
        if (part.lte(0)) continue;
        await tx.loanSchedule.update({ where: { id: s.id }, data: { penaltyWaived: { increment: part.toNumber() } } });
        left = left.minus(part);
      }
      await tx.loanPenaltyWaiver.create({ data: { loanId: loan.id, amount: total.toNumber(), reason: why, waivedById: user.id } });
      return total.toNumber();
    });

    // An instalment whose only debt was its charges is now paid.
    const settled = await prisma.loanSchedule.findMany({
      where: { loanId: loan.id, status: { in: ['PARTIAL', 'OVERDUE', 'PENDING'] } },
      select: { id: true, totalDue: true, totalPaid: true, penaltyDue: true, penaltyPaid: true, penaltyWaived: true },
    });
    for (const s of settled) {
      const charges = penaltyOwed({ penaltyDue: s.penaltyDue.toNumber(), penaltyPaid: s.penaltyPaid.toNumber(), penaltyWaived: s.penaltyWaived.toNumber() });
      if (charges <= 0 && s.totalPaid.gte(s.totalDue)) {
        await prisma.loanSchedule.update({ where: { id: s.id }, data: { status: 'PAID', paidDate: new Date() } });
      }
    }
    if (['ACTIVE', 'OVERDUE'].includes(loan.status)) {
      const unpaid = await prisma.loanSchedule.count({ where: { loanId: loan.id, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } } });
      if (unpaid === 0) await prisma.loan.update({ where: { id: loan.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    }

    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: 'UPDATE', module: 'LOANS', entityType: 'LOAN_PENALTY_WAIVER', entityId: loan.id,
      description: `Waived ${waived} in default charges on loan ${loan.loanNumber}: ${why}`,
    });
    return { success: true, message: 'Default charges waived' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not waive the charges' };
  }
}
