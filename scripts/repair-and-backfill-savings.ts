/**
 * repair-and-backfill-savings.ts
 *
 * Two jobs, both using the application's own engine so the results match what
 * the running system would have produced:
 *
 *   1. Repair fixed-term accounts opened through the ordinary savings form.
 *      They carry a fixed-term product but no start date, maturity date or
 *      earning terms, so they would never have earned a kobo.
 *
 *   2. Backfill the daily interest missed between each account's earning start
 *      and today, one day at a time, exactly as the nightly job would have
 *      credited it.
 *
 * Both are idempotent. The daily ledger's unique (accountId, date) means a
 * re-run credits nothing twice.
 *
 * Run:  npx tsx scripts/repair-and-backfill-savings.ts [--dry]
 */
import { prisma } from '../src/lib/prisma';
import { resolveContractedTerms } from '../src/lib/savings-promo';
import {
  deriveEarningTerms,
  interestTargetFor,
  runDailySavingsInterest,
  atMidnight,
  MS_PER_DAY,
} from '../src/lib/savings-daily-interest';
import { createJournalEntry, getAccountByCode } from '../src/lib/accounting-engine';

const DRY = process.argv.includes('--dry');
const naira = (n: number) => n.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });

async function main() {
  const today = atMidnight(new Date());

  // ── 1. Repair ─────────────────────────────────────────────────────────────
  console.log('── repairing fixed-term accounts with no contract ──');

  const broken = await prisma.savingsAccount.findMany({
    where: {
      isDeleted: false,
      maturityDate: null,
      product: { durationMonths: { not: null } },
    },
    include: { product: true, transactions: true },
  });

  for (const account of broken) {
    const product = account.product;
    // The account has been running since it was opened.
    const startDate = atMidnight(account.startDate ?? account.openedAt ?? account.createdAt);
    const terms = resolveContractedTerms(product, startDate);
    const earning = deriveEarningTerms({
      startDate,
      durationMonths: product.durationMonths as number,
      totalRate: terms.totalRate,
    });

    const deposited = account.transactions
      .filter((t) => t.transactionType === 'DEPOSIT')
      .reduce((s, t) => s + Number(t.amount), 0)
      || Number(account.currentBalance);

    const target = interestTargetFor(deposited, terms.totalRate);

    console.log(
      `  ${account.accountNumber} (${product.name}): ${naira(deposited)} at ${terms.totalRate}% ` +
      `- earns ${earning.earningStartDate.toISOString().slice(0, 10)} to ` +
      `${earning.maturityDate.toISOString().slice(0, 10)} (${earning.earningDays} days), target ${naira(target)}`
    );

    if (DRY) continue;

    await prisma.savingsAccount.update({
      where: { id: account.id },
      data: {
        startDate,
        maturityDate: earning.maturityDate,
        monthsCompleted: 0,
        monthsRemaining: product.durationMonths,
        contractedTotalRate: terms.totalRate,
        contractedMonthlyRate: terms.monthlyRate,
        contractedDurationMonths: terms.durationMonths,
        isPromoRate: terms.isPromo,
        promoName: terms.promoName,
        earningStartDate: earning.earningStartDate,
        earningDays: earning.earningDays,
        contractedDailyRate: earning.dailyRate,
        interestTargetTotal: target,
        totalDeposits: deposited,
        // Nothing has earned yet, so the whole balance is still dormant and
        // its month runs from the day the account opened.
        eligibleBalance: 0,
        pendingDeposits: deposited,
        pendingSince: startDate,
      },
    });
  }
  if (broken.length === 0) console.log('  none found');

  // ── 2. Backfill ───────────────────────────────────────────────────────────
  console.log('\n── backfilling missed daily interest ──');

  const earners = await prisma.savingsAccount.findMany({
    where: {
      status: 'ACTIVE',
      isDeleted: false,
      maturityDate: { not: null },
      earningStartDate: { not: null, lte: today },
    },
    select: { accountNumber: true, earningStartDate: true, interestPaidToDate: true },
  });

  if (earners.length === 0) {
    console.log('  no accounts are inside their earning window yet');
    await prisma.$disconnect();
    return;
  }

  // Walk from the earliest earning start to today, running the real job for
  // each date. Days already credited are skipped by the ledger's unique key.
  const earliest = earners
    .map((a) => atMidnight(a.earningStartDate as Date).getTime())
    .reduce((a, b) => Math.min(a, b));

  const days = Math.floor((today.getTime() - earliest) / MS_PER_DAY) + 1;
  console.log(`  ${earners.length} account(s), replaying ${days} day(s) from ` +
              `${new Date(earliest).toISOString().slice(0, 10)} to ${today.toISOString().slice(0, 10)}`);

  if (DRY) {
    for (const a of earners) {
      console.log(`    ${a.accountNumber}: paid so far ${naira(Number(a.interestPaidToDate))}`);
    }
    await prisma.$disconnect();
    return;
  }

  let credited = 0;
  let totalPaid = 0;
  for (let i = 0; i < days; i++) {
    const day = new Date(earliest + i * MS_PER_DAY);
    // One notification per saver per day would bury them under months of
    // backdated messages, so the replay stays silent. The journal entry is
    // deferred too: a GL transaction per day is what made the first attempt
    // time out against the pooler. One consolidated entry follows below.
    const result = await runDailySavingsInterest({ asOf: day, notify: false, postGl: false });
    credited += result.processed;
    totalPaid += result.totalInterest;
    if (result.processed > 0) {
      console.log(`    ${day.toISOString().slice(0, 10)}: ${result.processed} credited, ${naira(result.totalInterest)}`);
    }
  }

  console.log(`\n  ${credited} day-credits posted, ${naira(totalPaid)} in total`);

  // ── 3. Reconcile the general ledger ───────────────────────────────────────
  // Post one accrual per account for whatever interest has been credited but
  // not yet journalled. This also picks up any day whose entry failed midway
  // through an earlier run, so the ledger ends up matching the account.
  console.log('\n── reconciling the ledger ──');

  const interestExpAcc = await getAccountByCode('5210');
  const savingsLiabAcc = await getAccountByCode('2110');

  if (!interestExpAcc || !savingsLiabAcc) {
    console.log('  interest GL accounts missing — skipped');
  } else {
    const withInterest = await prisma.savingsAccount.findMany({
      where: { maturityDate: { not: null }, isDeleted: false },
      select: { id: true, accountNumber: true, customerId: true },
    });

    for (const account of withInterest) {
      const [ledger, journalled] = await Promise.all([
        prisma.savingsDailyInterest.aggregate({
          where: { accountId: account.id },
          _sum: { amount: true },
        }),
        prisma.journalEntry.aggregate({
          where: { savingsAccountId: account.id, sourceType: 'INTEREST_ACCRUAL' },
          _sum: { totalDebit: true },
        }),
      ]);

      const paid = Number(ledger._sum.amount ?? 0);
      const posted = Number(journalled._sum.totalDebit ?? 0);
      const gap = Number((paid - posted).toFixed(2));

      if (gap <= 0) {
        console.log(`  ${account.accountNumber}: ledger and GL agree (${naira(paid)})`);
        continue;
      }

      await createJournalEntry({
        entryDate: today,
        entryType: 'ACCRUAL',
        description: `Savings interest catch-up: ${account.accountNumber}`,
        sourceModule: 'SAVINGS',
        sourceType: 'INTEREST_ACCRUAL',
        sourceId: account.id,
        savingsAccountId: account.id,
        lines: [
          {
            accountId: interestExpAcc.id,
            debitAmount: gap,
            description: `Interest expense catch-up - ${account.accountNumber}`,
          },
          {
            accountId: savingsLiabAcc.id,
            creditAmount: gap,
            description: `Interest credited catch-up - ${account.accountNumber}`,
            customerId: account.customerId,
          },
        ],
        createdById: (await prisma.staff.findFirst({
          where: { role: { code: 'SUPER_ADMIN' }, status: 'ACTIVE' },
          select: { id: true },
        }))!.id,
        autoPost: true,
      } as never);

      console.log(`  ${account.accountNumber}: posted ${naira(gap)} to close the gap (credited ${naira(paid)}, was journalled ${naira(posted)})`);
    }
  }

  const after = await prisma.savingsAccount.findMany({
    where: { maturityDate: { not: null }, isDeleted: false },
    select: { accountNumber: true, interestPaidToDate: true, interestTargetTotal: true, currentBalance: true },
  });
  console.log('\n── result ──');
  for (const a of after) {
    console.log(
      `  ${a.accountNumber}: balance ${naira(Number(a.currentBalance))}, ` +
      `interest ${naira(Number(a.interestPaidToDate))} of ${naira(Number(a.interestTargetTotal ?? 0))}`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
