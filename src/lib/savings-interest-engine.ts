/**
 * Savings Interest & Maturity Engine
 * Hylink Finance Limited EMS
 *
 * Single source of truth for fixed-term savings interest accrual and maturity
 * processing. Used by both the monthly cron (`/api/cron/monthly`) and the
 * server actions in `fixed-savings.actions.ts`.
 *
 * Core guarantees:
 *  - Interest is NEVER posted twice for the same account in the same calendar
 *    month. The `SavingsInterest` table has a unique (accountId, year, month)
 *    constraint that acts as the idempotency gate.
 *  - A deposit does not earn interest in the month it is made. Deposits land in
 *    `pendingDeposits` and only roll into the interest-earning `eligibleBalance`
 *    on the next monthly run.
 *  - Every interest posting produces an immutable `SavingsInterest` ledger row.
 *  - Interest uses the rate the account was OPENED on, not the product's
 *    current rate. Editing a product, or ending a promo, therefore cannot
 *    change what an existing saver earns.
 */

import Decimal from 'decimal.js';
import type { InterestCalculationMethod, PrismaClient } from '@prisma/client';
import { prisma, withTransaction } from '@/lib/prisma';
import { createJournalEntry, getAccountByCode } from '@/lib/accounting-engine';
import { generateReference } from '@/lib/utils';
import { effectiveMonthlyRate } from '@/lib/savings-promo';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const GL = {
  CASH: '1110',
  SAVINGS_LIABILITY: '2110',
  INTEREST_EXPENSE: '5210',
  INTEREST_PAYABLE: '2120',
} as const;

export interface InterestRunResult {
  processed: number; // accounts that had interest posted or pending rolled
  skipped: number; // accounts skipped (already posted this period, no rate, etc.)
  totalInterest: number;
}

export interface MaturityRunResult {
  matured: number;
}

/** Resolve a system (SUPER_ADMIN) user id for automated postings. */
export async function getSystemUserId(): Promise<string> {
  const sysAdmin = await prisma.staff.findFirst({
    where: { role: { code: 'SUPER_ADMIN' }, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!sysAdmin) throw new Error('No system admin found for automated processing');
  return sysAdmin.id;
}

/**
 * Whole months elapsed between two dates (calendar-based, not 30-day
 * approximation) so leap years and month lengths do not distort progress.
 */
function monthsBetween(start: Date, end: Date): number {
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

function computeMaturityProgress(
  startDate: Date | null,
  durationMonths: number | null,
  asOf: Date
): { monthsCompleted: number; monthsRemaining: number | null } {
  if (!startDate || !durationMonths) {
    return { monthsCompleted: 0, monthsRemaining: null };
  }
  const elapsed = Math.min(monthsBetween(startDate, asOf), durationMonths);
  return { monthsCompleted: elapsed, monthsRemaining: Math.max(0, durationMonths - elapsed) };
}

/**
 * Run monthly interest for every ACTIVE fixed-term account.
 *
 * Idempotent: safe to run multiple times in the same month — accounts already
 * processed for (year, month) are skipped.
 */
export async function runMonthlySavingsInterest(opts?: {
  asOf?: Date;
  systemUserId?: string;
}): Promise<InterestRunResult> {
  const asOf = opts?.asOf ?? new Date();
  const year = asOf.getFullYear();
  const month = asOf.getMonth() + 1; // 1-12
  const systemUserId = opts?.systemUserId ?? (await getSystemUserId());

  const activeAccounts = await prisma.savingsAccount.findMany({
    where: { maturityDate: { not: null }, status: 'ACTIVE', isDeleted: false },
    include: { product: true },
  });

  const interestExpAcc = await getAccountByCode(GL.INTEREST_EXPENSE);
  const interestPayAcc = await getAccountByCode(GL.INTEREST_PAYABLE);
  const savingsLiabAcc = await getAccountByCode(GL.SAVINGS_LIABILITY);

  let processed = 0;
  let skipped = 0;
  let total = new Decimal(0);

  for (const account of activeAccounts) {
    // Idempotency gate — already posted this period?
    const existing = await prisma.savingsInterest.findUnique({
      where: { accountId_year_month: { accountId: account.id, year, month } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    // The rate this saver signed up for. Accounts opened before contracted
    // terms existed fall back to the product, which is what they have always
    // been paid at.
    const monthlyRate = effectiveMonthlyRate(account);
    if (!monthlyRate) {
      skipped++;
      continue;
    }

    const method: InterestCalculationMethod =
      account.product.interestCalculationMethod ?? 'MATURITY_ONLY';
    // MONTHLY_ALLOCATION and COMPOUND both post interest to the visible balance
    // each month (closing balance includes it). COMPOUND additionally folds that
    // interest back into the eligible base so it earns interest next month.
    const creditsToBalance = method === 'MONTHLY_ALLOCATION' || method === 'COMPOUND';
    const compounds = method === 'COMPOUND';

    const eligibleBal = new Decimal(account.eligibleBalance?.toString() ?? '0');
    const pendingDep = new Decimal(account.pendingDeposits?.toString() ?? '0');
    const interest = eligibleBal.times(monthlyRate).div(100).toDecimalPlaces(2);

    const { monthsCompleted, monthsRemaining } = computeMaturityProgress(
      account.startDate,
      account.contractedDurationMonths ?? account.product.durationMonths,
      asOf
    );

    // Roll pending → eligible (deposits become interest-eligible next period).
    // COMPOUND additionally folds the earned interest into the eligible base.
    let newEligible = eligibleBal.plus(pendingDep);
    if (compounds) newEligible = newEligible.plus(interest);
    newEligible = newEligible.toDecimalPlaces(2);

    let interestTxnId: string | null = null;

    try {
      await withTransaction(async (tx) => {
        const accountData: Record<string, unknown> = {
          eligibleBalance: newEligible.toNumber(),
          pendingDeposits: 0,
          lastInterestDate: asOf,
          monthsCompleted,
          monthsRemaining,
        };

        if (interest.gt(0)) {
          const balBefore = new Decimal(account.currentBalance.toString());
          const balAfter = creditsToBalance ? balBefore.plus(interest) : balBefore;

          if (creditsToBalance) {
            accountData.currentBalance = balAfter.toNumber();
            accountData.availableBalance = new Decimal(account.availableBalance.toString())
              .plus(interest)
              .toNumber();
          } else {
            accountData.interestAccrued = new Decimal(account.interestAccrued.toString())
              .plus(interest)
              .toNumber();
          }

          const transactionRef = await generateReference('SAVINGS_TXN');
          const txn = await tx.savingsTransaction.create({
            data: {
              accountId: account.id,
              transactionRef,
              transactionType: creditsToBalance ? 'INTEREST_CREDIT' : 'INTEREST_ACCRUAL',
              amount: interest.toNumber(),
              balanceBefore: balBefore.toNumber(),
              balanceAfter: balAfter.toNumber(),
              paymentMode: 'BANK_TRANSFER',
              narration: `Monthly interest ${creditsToBalance ? 'credit' : 'accrual'} @ ${monthlyRate}%${account.isPromoRate ? ` (${account.promoName ?? 'promo rate'})` : ''} on eligible balance ${eligibleBal.toFixed(2)} for ${year}-${String(month).padStart(2, '0')}`,
              processedById: systemUserId,
            },
          });
          interestTxnId = txn.id;
        }

        // Immutable interest ledger row — also the idempotency gate.
        await tx.savingsInterest.create({
          data: {
            accountId: account.id,
            year,
            month,
            eligibleBalance: eligibleBal.toNumber(),
            interestRate: monthlyRate,
            interestAmount: interest.toNumber(),
            calculationMethod: method,
            status: interest.gt(0) && creditsToBalance ? 'CREDITED' : 'ACCRUED',
            transactionId: interestTxnId,
            generatedById: systemUserId,
            generatedAt: asOf,
          },
        });

        await tx.savingsAccount.update({ where: { id: account.id }, data: accountData });
      });
    } catch (err: unknown) {
      // Unique-constraint violation means a concurrent run already posted this
      // period — treat as skipped rather than double-posting.
      if (typeof err === 'object' && err && (err as { code?: string }).code === 'P2002') {
        skipped++;
        continue;
      }
      throw err;
    }

    // Post the GL entry (outside the row txn, mirroring existing pattern). The
    // SavingsInterest gate above ensures this only ever runs once per period.
    if (interest.gt(0) && interestExpAcc) {
      // MONTHLY_ALLOCATION grows the customer's balance (liability) directly;
      // accrual methods sit in interest payable until maturity.
      const creditAcc = creditsToBalance ? savingsLiabAcc : interestPayAcc;
      if (creditAcc) {
        await createJournalEntry({
          entryDate: asOf,
          entryType: 'ACCRUAL',
          description: `Monthly savings interest: ${account.accountNumber}`,
          sourceModule: 'SAVINGS',
          sourceType: 'INTEREST_ACCRUAL',
          sourceId: account.id,
          savingsAccountId: account.id,
          lines: [
            {
              accountId: interestExpAcc.id,
              debitAmount: interest.toNumber(),
              description: `Interest expense - ${account.accountNumber}`,
            },
            {
              accountId: creditAcc.id,
              creditAmount: interest.toNumber(),
              description: `Interest ${creditsToBalance ? 'credited' : 'payable'} - ${account.accountNumber}`,
              customerId: account.customerId,
            },
          ],
          createdById: systemUserId,
          autoPost: true,
        });
      }
      total = total.plus(interest);
    }

    processed++;
  }

  return { processed, skipped, totalInterest: total.toNumber() };
}

/**
 * Process fixed-term accounts that have reached maturity.
 * Payout = totalDeposits (principal) + interestAccrued.
 */
export async function processMaturedAccounts(opts?: {
  asOf?: Date;
  systemUserId?: string;
}): Promise<MaturityRunResult> {
  const asOf = opts?.asOf ?? new Date();
  const systemUserId = opts?.systemUserId ?? (await getSystemUserId());

  const maturedAccounts = await prisma.savingsAccount.findMany({
    where: { maturityDate: { not: null, lte: asOf }, status: 'ACTIVE', isDeleted: false },
    include: { product: true, customer: true },
  });

  const cashAcc = await getAccountByCode(GL.CASH);
  const savingsLiab = await getAccountByCode(GL.SAVINGS_LIABILITY);
  const interestPayAcc = await getAccountByCode(GL.INTEREST_PAYABLE);

  let matured = 0;

  for (const account of maturedAccounts) {
    const principal = new Decimal(
      account.totalDeposits?.toString() ?? account.currentBalance.toString()
    );
    const interest = new Decimal(account.interestAccrued.toString());
    const payout = principal.plus(interest).toDecimalPlaces(2);
    const transactionRef = await generateReference('SAVINGS_TXN');

    await withTransaction(async (tx) => {
      await tx.savingsTransaction.create({
        data: {
          accountId: account.id,
          transactionRef,
          transactionType: 'MATURITY_PAYOUT',
          amount: payout.toNumber(),
          balanceBefore: account.currentBalance.toNumber(),
          balanceAfter: 0,
          paymentMode: 'BANK_TRANSFER',
          narration: `Maturity payout: Principal ${principal.toFixed(2)} + Interest ${interest.toFixed(2)}`,
          processedById: systemUserId,
        },
      });
      await tx.savingsAccount.update({
        where: { id: account.id },
        data: {
          status: 'COMPLETED',
          currentBalance: 0,
          availableBalance: 0,
          monthsCompleted:
            account.contractedDurationMonths ?? account.product.durationMonths ?? account.monthsCompleted,
          monthsRemaining: 0,
          closedAt: asOf,
        },
      });
    });

    if (cashAcc && savingsLiab) {
      const lines: Array<Record<string, unknown>> = [
        {
          accountId: savingsLiab.id,
          debitAmount: principal.toNumber(),
          description: `Maturity principal - ${account.accountNumber}`,
          customerId: account.customerId,
        },
      ];
      if (interestPayAcc && interest.gt(0)) {
        lines.push({
          accountId: interestPayAcc.id,
          debitAmount: interest.toNumber(),
          description: `Maturity interest - ${account.accountNumber}`,
          customerId: account.customerId,
        });
      }
      lines.push({
        accountId: cashAcc.id,
        creditAmount: payout.toNumber(),
        description: `Maturity payout - ${account.accountNumber}`,
      });

      await createJournalEntry({
        entryDate: asOf,
        description: `Savings maturity payout: ${account.accountNumber}`,
        sourceModule: 'SAVINGS',
        sourceType: 'MATURITY_PAYOUT',
        sourceId: account.id,
        savingsAccountId: account.id,
        lines: lines as never,
        createdById: systemUserId,
        autoPost: true,
      });
    }

    matured++;
  }

  return { matured };
}

/** Recompute months completed/remaining for all active fixed-term accounts. */
export async function refreshMaturityProgress(asOf: Date = new Date()): Promise<number> {
  const accounts = await prisma.savingsAccount.findMany({
    where: { maturityDate: { not: null }, status: 'ACTIVE', isDeleted: false },
    include: { product: { select: { durationMonths: true } } },
  });
  let updated = 0;
  for (const account of accounts) {
    const { monthsCompleted, monthsRemaining } = computeMaturityProgress(
      account.startDate,
      account.contractedDurationMonths ?? account.product.durationMonths,
      asOf
    );
    await prisma.savingsAccount.update({
      where: { id: account.id },
      data: { monthsCompleted, monthsRemaining },
    });
    updated++;
  }
  return updated;
}

// Re-export for tests
export const __test = { monthsBetween, computeMaturityProgress };
