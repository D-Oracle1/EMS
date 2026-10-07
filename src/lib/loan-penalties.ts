/**
 * Loan default charges — the daily job (lib/fees for the rules).
 *
 * Every instalment past its due date and its product's grace period, still
 * owing principal or interest, is charged the product's penalty rate (percent
 * per day) on what it owes, once per day. A product with no penalty rate
 * charges nothing. Each day's charge is a LoanPenaltyCharge row whose unique
 * (scheduleId, chargeDate) pair makes the job safe to run twice; the running
 * total sits on the instalment (penaltyDue) for repayments to clear first.
 *
 * Charges are income when collected (lib/money-posting books them to Penalty
 * & Late Fees then), so accruing one posts nothing to the ledger.
 *
 * Server-only and not a server action: run by the daily cron.
 */
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/prisma';
import { dailyPenalty, daysToCharge, firstChargeDay } from '@/lib/fees';

/** Loans whose instalments are charged: still being repaid. */
const CHARGEABLE_LOANS = ['ACTIVE', 'OVERDUE', 'DEFAULTED'] as const;

export async function runDailyLoanPenalties(today = new Date()): Promise<{ instalments: number; charges: number; amount: number }> {
  const schedules = await prisma.loanSchedule.findMany({
    where: {
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      dueDate: { lt: today },
      loan: { status: { in: [...CHARGEABLE_LOANS] }, isDeleted: false, product: { penaltyRate: { gt: 0 } } },
    },
    select: {
      id: true, loanId: true, dueDate: true,
      principalDue: true, interestDue: true, principalPaid: true, interestPaid: true,
      loan: { select: { product: { select: { penaltyRate: true, gracePeriodDays: true } } } },
      penaltyCharges: { orderBy: { chargeDate: 'desc' }, take: 1, select: { chargeDate: true } },
    },
  });

  let charges = 0;
  let amount = new Decimal(0);
  let instalments = 0;

  for (const s of schedules) {
    const rate = s.loan.product.penaltyRate?.toNumber() ?? 0;
    const overdue = new Decimal(s.principalDue.toString()).plus(s.interestDue.toString())
      .minus(s.principalPaid.toString()).minus(s.interestPaid.toString());
    if (rate <= 0 || overdue.lte(0)) continue;

    const days = daysToCharge(today, firstChargeDay(s.dueDate, s.loan.product.gracePeriodDays), s.penaltyCharges[0]?.chargeDate ?? null);
    const perDay = dailyPenalty(overdue.toNumber(), rate);
    if (!days.length || perDay <= 0) continue;

    let charged = 0;
    for (const day of days) {
      try {
        await prisma.$transaction([
          prisma.loanPenaltyCharge.create({
            data: { loanId: s.loanId, scheduleId: s.id, chargeDate: day, overdueAmount: overdue.toNumber(), rate, amount: perDay },
          }),
          prisma.loanSchedule.update({ where: { id: s.id }, data: { penaltyDue: { increment: perDay } } }),
        ]);
        charged += 1;
      } catch (error) {
        // Already charged for that day (a second run): skip it.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    if (charged) {
      instalments += 1;
      charges += charged;
      amount = amount.plus(new Decimal(perDay).times(charged));
    }
  }

  return { instalments, charges, amount: amount.toNumber() };
}
