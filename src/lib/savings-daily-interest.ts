/**
 * Daily savings interest.
 * Hylink Finance Limited EMS
 *
 * Replaces the monthly accrual for fixed-term accounts. Interest is credited
 * to the saver every day, and the saver is told each time.
 *
 * The contract, in full:
 *
 *   1. Interest starts counting the month AFTER the deposit. Money deposited
 *      today is dormant until the same date next month; nothing accrues before
 *      `earningStartDate`. This is deliberate, not an accident of scheduling.
 *
 *   2. The whole contracted rate is spread across the earning window. For a
 *      12-month plan at 17% starting 8 Sep, earning runs 8 Oct to 8 Sep — 335
 *      days — so the daily rate is 17 / 335 = 0.050746269% per day. Sum those
 *      335 days and you have exactly 17%.
 *
 *   3. Daily amounts are rounded to the kobo, which drifts from the target over
 *      a full term (335 x 507.46 = 169,999.10 against a target of 170,000.00).
 *      The final earning day posts the difference, so a saver always receives
 *      precisely the rate they were promised. Never less, never more.
 *
 *   4. Because the rate is calibrated to hit the target exactly, credited
 *      interest does NOT itself earn interest — the earning base stays the
 *      deposits. Compounding on top would overshoot the contracted rate.
 *
 * Idempotency: one `SavingsDailyInterest` row per account per day, with a
 * unique (accountId, date). Running the job twice in a day, or replaying it,
 * cannot pay anyone twice.
 */

import Decimal from 'decimal.js';
import { prisma, withTransaction } from '@/lib/prisma';
import { createJournalEntry, getAccountByCode } from '@/lib/accounting-engine';
import { generateReference } from '@/lib/utils';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const GL = {
  SAVINGS_LIABILITY: '2110',
  INTEREST_EXPENSE: '5210',
} as const;

export const MS_PER_DAY = 86_400_000;

export interface DailyRunResult {
  processed: number;
  skipped: number;
  totalInterest: number;
  notified: number;
}

/** Midnight UTC of a date, so day comparisons never straddle a timezone. */
export function atMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Whole days between two dates. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((atMidnight(to).getTime() - atMidnight(from).getTime()) / MS_PER_DAY);
}

/**
 * Add months, clamping to the end of a shorter month.
 *
 * 31 January plus one month is 28 February, not 3 March — a saver who deposits
 * on the 31st must not have their dormant month silently extended.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const d = atMidnight(date);
  const targetMonth = d.getUTCMonth() + months;
  const result = new Date(Date.UTC(d.getUTCFullYear(), targetMonth, 1));
  const daysInTarget = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(d.getUTCDate(), daysInTarget));
  return result;
}

export interface EarningTerms {
  earningStartDate: Date;
  maturityDate: Date;
  earningDays: number;
  /** Percent per day per naira. */
  dailyRate: number;
}

/**
 * The earning window and daily rate for an account.
 *
 * `totalRate` is the rate for the whole term (17 means 17%).
 */
export function deriveEarningTerms(input: {
  startDate: Date;
  durationMonths: number;
  totalRate: number;
}): EarningTerms {
  const start = atMidnight(input.startDate);
  const earningStartDate = addMonthsClamped(start, 1);
  const maturityDate = addMonthsClamped(start, input.durationMonths);
  const earningDays = Math.max(0, daysBetween(earningStartDate, maturityDate));

  const dailyRate =
    earningDays > 0
      ? new Decimal(input.totalRate).div(earningDays).toDecimalPlaces(9).toNumber()
      : 0;

  return { earningStartDate, maturityDate, earningDays, dailyRate };
}

/** The exact amount an account must have paid by maturity. */
export function interestTargetFor(principal: number, totalRate: number): number {
  return new Decimal(principal).times(totalRate).div(100).toDecimalPlaces(2).toNumber();
}

/**
 * What to credit on a given day.
 *
 * Returns null when the day is outside the earning window or already covered.
 * On the final earning day the amount is whatever is still owed against the
 * target, which absorbs a term's worth of rounding.
 */
export function dailyAmountFor(input: {
  asOf: Date;
  earningStartDate: Date;
  maturityDate: Date;
  eligibleBalance: number;
  dailyRate: number;
  interestTargetTotal: number;
  interestPaidToDate: number;
}): { amount: number; isTrueUp: boolean } | null {
  const day = atMidnight(input.asOf);
  const start = atMidnight(input.earningStartDate);
  const end = atMidnight(input.maturityDate);

  // Dormant until the earning start, and nothing after maturity.
  if (day.getTime() < start.getTime()) return null;
  if (day.getTime() > end.getTime()) return null;

  const isFinalDay = day.getTime() === end.getTime();
  const paid = new Decimal(input.interestPaidToDate);
  const target = new Decimal(input.interestTargetTotal);

  if (isFinalDay) {
    // Close the gap exactly, however the daily rounding fell.
    const remaining = target.minus(paid).toDecimalPlaces(2);
    if (remaining.lte(0)) return null;
    return { amount: remaining.toNumber(), isTrueUp: true };
  }

  const amount = new Decimal(input.eligibleBalance)
    .times(input.dailyRate)
    .div(100)
    .toDecimalPlaces(2);

  if (amount.lte(0)) return null;

  // Never overshoot the contracted total, whatever happens in between.
  const headroom = target.minus(paid);
  if (headroom.lte(0)) return null;
  const capped = Decimal.min(amount, headroom).toDecimalPlaces(2);

  return { amount: capped.toNumber(), isTrueUp: false };
}

/**
 * Credit one day's interest to every active fixed-term account.
 *
 * Safe to run repeatedly: accounts already covered for the day are skipped.
 */
export async function runDailySavingsInterest(opts?: {
  asOf?: Date;
  systemUserId?: string;
  /** Skip customer notifications, for backfills. */
  notify?: boolean;
}): Promise<DailyRunResult> {
  const asOf = atMidnight(opts?.asOf ?? new Date());
  const notify = opts?.notify !== false;

  const systemUserId =
    opts?.systemUserId ??
    (
      await prisma.staff.findFirst({
        where: { role: { code: 'SUPER_ADMIN' }, status: 'ACTIVE' },
        select: { id: true },
      })
    )?.id;
  if (!systemUserId) throw new Error('No system admin found for automated processing');

  const accounts = await prisma.savingsAccount.findMany({
    where: {
      status: 'ACTIVE',
      isDeleted: false,
      maturityDate: { not: null },
      earningStartDate: { not: null, lte: asOf },
    },
    include: { product: { select: { name: true } } },
  });

  const interestExpAcc = await getAccountByCode(GL.INTEREST_EXPENSE);
  const savingsLiabAcc = await getAccountByCode(GL.SAVINGS_LIABILITY);

  let processed = 0;
  let skipped = 0;
  let notified = 0;
  let total = new Decimal(0);

  for (const account of accounts) {
    if (!account.earningStartDate || !account.maturityDate) {
      skipped++;
      continue;
    }

    // Roll a dormant deposit in once its own month is up. Doing it here means
    // the daily job is the only thing that moves money into the earning base.
    let eligible = new Decimal(account.eligibleBalance.toString());
    const pending = new Decimal(account.pendingDeposits.toString());
    let rolled = false;
    if (
      pending.gt(0) &&
      account.pendingSince &&
      asOf.getTime() >= addMonthsClamped(account.pendingSince, 1).getTime()
    ) {
      eligible = eligible.plus(pending);
      rolled = true;
    }

    const credit = dailyAmountFor({
      asOf,
      earningStartDate: account.earningStartDate,
      maturityDate: account.maturityDate,
      eligibleBalance: eligible.toNumber(),
      dailyRate: Number(account.contractedDailyRate ?? 0),
      interestTargetTotal: Number(account.interestTargetTotal ?? 0),
      interestPaidToDate: Number(account.interestPaidToDate ?? 0),
    });

    if (!credit) {
      // Still persist a roll, even on a day with nothing to pay.
      if (rolled) {
        await prisma.savingsAccount.update({
          where: { id: account.id },
          data: {
            eligibleBalance: eligible.toNumber(),
            pendingDeposits: 0,
            pendingSince: null,
          },
        });
      }
      skipped++;
      continue;
    }

    const amount = new Decimal(credit.amount);
    const balanceBefore = new Decimal(account.currentBalance.toString());
    const balanceAfter = balanceBefore.plus(amount);
    const transactionRef = await generateReference('SAVINGS_TXN');

    try {
      await withTransaction(async (tx) => {
        // The gate. A duplicate here aborts the whole day for this account.
        await tx.savingsDailyInterest.create({
          data: {
            accountId: account.id,
            date: asOf,
            eligibleBalance: eligible.toNumber(),
            dailyRate: Number(account.contractedDailyRate ?? 0),
            amount: amount.toNumber(),
            isTrueUp: credit.isTrueUp,
          },
        });

        const txn = await tx.savingsTransaction.create({
          data: {
            accountId: account.id,
            transactionRef,
            transactionType: 'INTEREST_CREDIT',
            amount: amount.toNumber(),
            balanceBefore: balanceBefore.toNumber(),
            balanceAfter: balanceAfter.toNumber(),
            paymentMode: 'BANK_TRANSFER',
            narration: credit.isTrueUp
              ? `Final interest adjustment to complete the agreed rate`
              : `Daily interest at ${account.contractedDailyRate}% on ${eligible.toFixed(2)}`,
            processedById: systemUserId,
          },
        });

        await tx.savingsDailyInterest.update({
          where: { accountId_date: { accountId: account.id, date: asOf } },
          data: { transactionId: txn.id },
        });

        await tx.savingsAccount.update({
          where: { id: account.id },
          data: {
            // Credited to the balance so the saver sees it immediately. It is
            // deliberately NOT added to eligibleBalance: the daily rate is
            // calibrated to land on the contracted total, so letting interest
            // earn interest would overshoot it.
            currentBalance: balanceAfter.toNumber(),
            availableBalance: new Decimal(account.availableBalance.toString())
              .plus(amount)
              .toNumber(),
            eligibleBalance: eligible.toNumber(),
            pendingDeposits: rolled ? 0 : account.pendingDeposits,
            pendingSince: rolled ? null : account.pendingSince,
            interestPaidToDate: new Decimal(account.interestPaidToDate.toString())
              .plus(amount)
              .toNumber(),
            lastInterestDate: asOf,
          },
        });
      });
    } catch (err: unknown) {
      // Already credited for this day by a concurrent or earlier run.
      if (typeof err === 'object' && err && (err as { code?: string }).code === 'P2002') {
        skipped++;
        continue;
      }
      throw err;
    }

    if (interestExpAcc && savingsLiabAcc) {
      await createJournalEntry({
        entryDate: asOf,
        entryType: 'ACCRUAL',
        description: `Daily savings interest: ${account.accountNumber}`,
        sourceModule: 'SAVINGS',
        sourceType: 'INTEREST_ACCRUAL',
        sourceId: account.id,
        savingsAccountId: account.id,
        lines: [
          {
            accountId: interestExpAcc.id,
            debitAmount: amount.toNumber(),
            description: `Interest expense - ${account.accountNumber}`,
          },
          {
            accountId: savingsLiabAcc.id,
            creditAmount: amount.toNumber(),
            description: `Interest credited - ${account.accountNumber}`,
            customerId: account.customerId,
          },
        ],
        createdById: systemUserId,
        autoPost: true,
      });
    }

    if (notify) {
      const paid = new Decimal(account.interestPaidToDate.toString()).plus(amount);
      const ok = await notifySaver({
        customerId: account.customerId,
        accountId: account.id,
        accountNumber: account.accountNumber,
        amount: amount.toNumber(),
        paidToDate: paid.toNumber(),
        target: Number(account.interestTargetTotal ?? 0),
        isTrueUp: credit.isTrueUp,
      });
      if (ok) notified++;
    }

    total = total.plus(amount);
    processed++;
  }

  return { processed, skipped, totalInterest: total.toNumber(), notified };
}

const naira = (n: number) =>
  n.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });

/** Tell the saver what just landed, and how it is tracking to the total. */
async function notifySaver(p: {
  customerId: string;
  accountId: string;
  accountNumber: string;
  amount: number;
  paidToDate: number;
  target: number;
  isTrueUp: boolean;
}): Promise<boolean> {
  try {
    const remaining = Math.max(0, Number((p.target - p.paidToDate).toFixed(2)));
    await prisma.customerNotification.create({
      data: {
        customerId: p.customerId,
        type: 'INTEREST',
        title: p.isTrueUp
          ? `Final interest of ${naira(p.amount)} paid`
          : `${naira(p.amount)} interest paid today`,
        message: p.isTrueUp
          ? `Your savings account ${p.accountNumber} has been credited with a final ${naira(p.amount)}, completing the ${naira(p.target)} of interest agreed for this plan.`
          : `Your savings account ${p.accountNumber} earned ${naira(p.amount)} today. That is ${naira(p.paidToDate)} of interest so far, with ${naira(remaining)} still to come by the end of the plan.`,
        entityType: 'SAVINGS_ACCOUNT',
        entityId: p.accountId,
      },
    });
    return true;
  } catch (error) {
    // A notification must never cost a saver their interest.
    console.error('Failed to notify saver of daily interest:', error);
    return false;
  }
}
