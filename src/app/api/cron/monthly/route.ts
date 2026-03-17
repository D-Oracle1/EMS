import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createJournalEntry, getAccountByCode } from '@/lib/accounting-engine';
import { generateReference } from '@/lib/utils';
import Decimal from 'decimal.js';

/**
 * Monthly Cron Job — Savings Interest Engine & Maturity Processing
 * Scheduled: 1st of each month at 02:00 UTC (vercel.json: "0 2 1 * *")
 */

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GL = {
  CASH: '1110',
  SAVINGS_LIABILITY: '2110',
  INTEREST_EXPENSE: '5210',
  INTEREST_PAYABLE: '2120',
};

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, any> = {};

  try {
    const sysAdmin = await prisma.staff.findFirst({
      where: { role: { code: 'SUPER_ADMIN' }, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!sysAdmin) {
      return NextResponse.json({ success: false, error: 'No system admin found' }, { status: 500 });
    }
    const systemUserId = sysAdmin.id;
    const today = new Date();

    // -------------------------------------------------------------------------
    // 1. Ensure current financial period is open
    // -------------------------------------------------------------------------
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    await prisma.financialPeriod.upsert({
      where: { year_month: { year, month } },
      update: {},
      create: {
        year, month,
        startDate: new Date(year, month - 1, 1),
        endDate: new Date(year, month, 0),
        status: 'OPEN',
      },
    });
    results.period = `${year}-${month.toString().padStart(2, '0')} ensured OPEN`;

    // -------------------------------------------------------------------------
    // 2. Monthly Savings Interest Engine
    //    For all ACTIVE fixed-term accounts:
    //      a) interest = eligibleBalance × (monthlyInterestRate / 100)
    //      b) accruedInterest += interest
    //      c) eligibleBalance += pendingDeposits; pendingDeposits = 0
    // -------------------------------------------------------------------------
    const activeAccounts: any[] = await prisma.savingsAccount.findMany({
      where: { maturityDate: { not: null }, status: 'ACTIVE', isDeleted: false },
      include: { product: true },
    });

    const interestExpAcc = await getAccountByCode(GL.INTEREST_EXPENSE);
    const interestPayAcc = await getAccountByCode(GL.INTEREST_PAYABLE);

    let interestProcessed = 0;
    let totalInterestAccrued = new Decimal(0);

    for (const account of activeAccounts) {
      const monthlyRate = account.product.monthlyInterestRate?.toNumber();
      if (!monthlyRate) continue;

      const eligibleBal = new Decimal(account.eligibleBalance?.toString() ?? '0');
      const pendingDep = new Decimal(account.pendingDeposits?.toString() ?? '0');

      const interest = eligibleBal.times(monthlyRate).div(100).toDecimalPlaces(2);
      const newEligibleBalance = eligibleBal.plus(pendingDep).toDecimalPlaces(2);
      const newAccruedInterest = new Decimal(account.interestAccrued.toString()).plus(interest).toDecimalPlaces(2);

      if (interest.gt(0)) {
        const transactionRef = await generateReference('SAVINGS_TXN');

        await prisma.savingsTransaction.create({
          data: {
            accountId: account.id,
            transactionRef,
            transactionType: 'INTEREST_ACCRUAL',
            amount: interest.toNumber(),
            balanceBefore: account.currentBalance.toNumber(),
            balanceAfter: account.currentBalance.toNumber(),
            paymentMode: 'BANK_TRANSFER',
            narration: `Monthly interest accrual @ ${monthlyRate}% on eligible balance ${eligibleBal}`,
            processedById: systemUserId,
          },
        });

        await prisma.savingsAccount.update({
          where: { id: account.id },
          data: {
            interestAccrued: newAccruedInterest.toNumber(),
            eligibleBalance: newEligibleBalance.toNumber(),
            pendingDeposits: 0,
            lastInterestDate: new Date(),
          },
        });

        if (interestExpAcc && interestPayAcc) {
          await createJournalEntry({
            entryDate: new Date(),
            entryType: 'ACCRUAL',
            description: `Monthly savings interest: ${account.accountNumber}`,
            sourceModule: 'SAVINGS',
            sourceType: 'INTEREST_ACCRUAL',
            sourceId: account.id,
            savingsAccountId: account.id,
            lines: [
              { accountId: interestExpAcc.id, debitAmount: interest.toNumber(), description: `Interest expense - ${account.accountNumber}` },
              { accountId: interestPayAcc.id, creditAmount: interest.toNumber(), description: `Interest payable - ${account.accountNumber}`, customerId: account.customerId },
            ],
            createdById: systemUserId,
            autoPost: true,
          });
        }

        totalInterestAccrued = totalInterestAccrued.plus(interest);
      } else if (pendingDep.gt(0)) {
        // No interest yet (first month) — still roll pending into eligible
        await prisma.savingsAccount.update({
          where: { id: account.id },
          data: {
            eligibleBalance: newEligibleBalance.toNumber(),
            pendingDeposits: 0,
            lastInterestDate: new Date(),
          },
        });
      }

      interestProcessed++;
    }

    results.savingsInterest = { accountsProcessed: interestProcessed, totalInterestAccrued: totalInterestAccrued.toNumber() };

    // -------------------------------------------------------------------------
    // 3. Maturity Processing — accounts whose maturityDate <= today
    // -------------------------------------------------------------------------
    const maturedAccounts: any[] = await prisma.savingsAccount.findMany({
      where: { maturityDate: { not: null, lte: today }, status: 'ACTIVE', isDeleted: false },
      include: { product: true, customer: true },
    });

    const cashAcc = await getAccountByCode(GL.CASH);
    const savingsLiab = await getAccountByCode(GL.SAVINGS_LIABILITY);
    let maturedCount = 0;

    for (const account of maturedAccounts) {
      const principal = new Decimal(account.totalDeposits?.toString() ?? account.currentBalance.toString());
      const interest = new Decimal(account.interestAccrued.toString());
      const payout = principal.plus(interest).toDecimalPlaces(2);
      const transactionRef = await generateReference('SAVINGS_TXN');

      await prisma.savingsTransaction.create({
        data: {
          accountId: account.id,
          transactionRef,
          transactionType: 'MATURITY_PAYOUT',
          amount: payout.toNumber(),
          balanceBefore: account.currentBalance.toNumber(),
          balanceAfter: 0,
          paymentMode: 'BANK_TRANSFER',
          narration: `Maturity payout: Principal ${principal} + Interest ${interest}`,
          processedById: systemUserId,
        },
      });

      await prisma.savingsAccount.update({
        where: { id: account.id },
        data: { status: 'COMPLETED', currentBalance: 0, availableBalance: 0, closedAt: new Date() },
      });

      if (cashAcc && savingsLiab) {
        const lines: any[] = [
          { accountId: savingsLiab.id, debitAmount: principal.toNumber(), description: `Maturity principal - ${account.accountNumber}`, customerId: account.customerId },
        ];
        if (interestPayAcc && interest.gt(0)) {
          lines.push({ accountId: interestPayAcc.id, debitAmount: interest.toNumber(), description: `Maturity interest - ${account.accountNumber}`, customerId: account.customerId });
        }
        lines.push({ accountId: cashAcc.id, creditAmount: payout.toNumber(), description: `Maturity payout - ${account.accountNumber}` });

        await createJournalEntry({
          entryDate: new Date(),
          description: `Savings maturity payout: ${account.accountNumber}`,
          sourceModule: 'SAVINGS',
          sourceType: 'MATURITY_PAYOUT',
          sourceId: account.id,
          savingsAccountId: account.id,
          lines,
          createdById: systemUserId,
          autoPost: true,
        });
      }

      maturedCount++;
    }

    results.maturityProcessing = { accountsMatured: maturedCount };

    return NextResponse.json({ success: true, results, timestamp: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
