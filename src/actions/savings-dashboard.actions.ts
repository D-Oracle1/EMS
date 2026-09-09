'use server';

/**
 * Savings Dashboard — aggregations scoped strictly to the Savings module.
 * No loans, fixed deposits, or other modules leak in here.
 */

import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/auth-utils';

const READ_PERMS = ['SAVINGS:READ', 'SAVINGS:CREATE', 'SAVINGS:DEPOSIT', 'SAVINGS:MANAGE'];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(offset = 0): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

export interface SavingsDashboard {
  portfolio: {
    activeAccounts: number;
    totalPortfolio: number;
    totalPendingDeposits: number;
    totalEligibleBalance: number;
  };
  interest: {
    totalAllocated: number;
    outstandingLiability: number;
    thisMonth: number;
  };
  deposits: {
    todayCount: number;
    todayAmount: number;
    monthCount: number;
    monthAmount: number;
  };
  statusCounts: Record<string, number>;
  completed: { count: number; totalPaidOut: number };
  upcomingMaturities: Array<{
    id: string;
    accountNumber: string;
    customerName: string;
    productName: string;
    maturityDate: string;
    daysToMaturity: number;
    projectedPayout: number;
  }>;
  productBreakdown: Array<{ productId: string; name: string; accountCount: number; totalBalance: number }>;
  mostPopularProduct: { name: string; accountCount: number } | null;
  depositsByMonth: Array<{ label: string; amount: number }>;
  /** Deposits against withdrawals per month, with the net movement. */
  flowByMonth: Array<{ label: string; deposits: number; withdrawals: number; net: number }>;
  /** Interest posted to savers each month. */
  interestByMonth: Array<{ label: string; amount: number }>;
  /** Money falling due over the coming months, for cash planning. */
  maturitySchedule: Array<{ label: string; count: number; amount: number }>;
  /** Take-up of promotional rates. */
  promo: { accounts: number; balance: number; activeProducts: number };
}

export async function getSavingsDashboard(): Promise<SavingsDashboard> {
  await requireAnyPermission(READ_PERMS);

  const today = startOfToday();
  const monthStart = startOfMonth();
  const maturityHorizon = new Date();
  maturityHorizon.setDate(maturityHorizon.getDate() + 180);

  // Build the last 6 month windows (oldest → newest)
  const monthWindows = Array.from({ length: 6 }, (_, i) => {
    const from = startOfMonth(-(5 - i));
    const to = startOfMonth(-(4 - i));
    return {
      label: from.toLocaleDateString('en-NG', { month: 'short', year: '2-digit' }),
      from,
      to,
    };
  });

  const [
    portfolioAgg,
    pendingAgg,
    eligibleAgg,
    interestAllocatedAgg,
    outstandingLiabilityAgg,
    interestThisMonthAgg,
    todayDepositsAgg,
    monthDepositsAgg,
    statusGroups,
    completedCount,
    completedPayoutAgg,
    maturingAccounts,
    productGroups,
    ...monthDeposits
  ] = await Promise.all([
    prisma.savingsAccount.aggregate({
      where: { status: 'ACTIVE', isDeleted: false },
      _count: true,
      _sum: { currentBalance: true },
    }),
    prisma.savingsAccount.aggregate({
      where: { status: 'ACTIVE', isDeleted: false },
      _sum: { pendingDeposits: true },
    }),
    prisma.savingsAccount.aggregate({
      where: { status: 'ACTIVE', isDeleted: false },
      _sum: { eligibleBalance: true },
    }),
    prisma.savingsDailyInterest.aggregate({ _sum: { amount: true } }),
    // What is still owed to savers. Daily interest is credited straight to the
    // balance, so interestAccrued sits at zero and the liability is the gap
    // between what each account was promised and what it has been paid.
    prisma.savingsAccount.aggregate({
      where: { status: 'ACTIVE', isDeleted: false, maturityDate: { not: null } },
      _sum: { interestTargetTotal: true, interestPaidToDate: true },
    }),
    prisma.savingsDailyInterest.aggregate({
      where: { date: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.savingsTransaction.aggregate({
      where: { transactionType: 'DEPOSIT', processedAt: { gte: today } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.savingsTransaction.aggregate({
      where: { transactionType: 'DEPOSIT', processedAt: { gte: monthStart } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.savingsAccount.groupBy({
      by: ['status'],
      where: { isDeleted: false },
      _count: true,
    }),
    prisma.savingsAccount.count({ where: { status: 'COMPLETED', isDeleted: false } }),
    prisma.savingsTransaction.aggregate({
      where: { transactionType: 'MATURITY_PAYOUT' },
      _sum: { amount: true },
    }),
    prisma.savingsAccount.findMany({
      where: {
        status: 'ACTIVE',
        isDeleted: false,
        maturityDate: { not: null, lte: maturityHorizon, gte: today },
      },
      include: {
        customer: { select: { firstName: true, lastName: true } },
        product: { select: { name: true } },
      },
      orderBy: { maturityDate: 'asc' },
      take: 10,
    }),
    prisma.savingsAccount.groupBy({
      by: ['productId'],
      where: { status: 'ACTIVE', isDeleted: false },
      _count: true,
      _sum: { currentBalance: true },
    }),
    ...monthWindows.map((w) =>
      prisma.savingsTransaction.aggregate({
        where: { transactionType: 'DEPOSIT', processedAt: { gte: w.from, lt: w.to } },
        _sum: { amount: true },
      })
    ),
  ]);

  // Resolve product names for the breakdown
  const productIds = productGroups.map((g) => g.productId);
  const products = await prisma.savingsProduct.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Unknown';

  const productBreakdown = productGroups
    .map((g) => ({
      productId: g.productId,
      name: productName(g.productId),
      accountCount: g._count,
      totalBalance: g._sum.currentBalance?.toNumber() ?? 0,
    }))
    .sort((a, b) => b.accountCount - a.accountCount);

  const statusCounts: Record<string, number> = {};
  for (const g of statusGroups) statusCounts[g.status] = g._count;

  // Six months back for the trend charts, six months forward for the cash
  // planning one. Kept in a second batch so the windows stay readable.
  const forwardWindows = Array.from({ length: 12 }, (_, i) => {
    const from = startOfMonth(i);
    const to = startOfMonth(i + 1);
    return { label: from.toLocaleDateString('en-NG', { month: 'short', year: '2-digit' }), from, to };
  });

  const [promoAgg, promoProducts, ...rest] = await Promise.all([
    prisma.savingsAccount.aggregate({
      where: { isPromoRate: true, isDeleted: false },
      _count: true,
      _sum: { currentBalance: true },
    }),
    prisma.savingsProduct.count({ where: { promoActive: true, isActive: true } }),
    ...monthWindows.map((w) =>
      prisma.savingsTransaction.aggregate({
        where: { transactionType: 'WITHDRAWAL', processedAt: { gte: w.from, lt: w.to } },
        _sum: { amount: true },
      })
    ),
    ...monthWindows.map((w) =>
      prisma.savingsDailyInterest.aggregate({
        where: { date: { gte: w.from, lt: w.to } },
        _sum: { amount: true },
      })
    ),
    ...forwardWindows.map((w) =>
      prisma.savingsAccount.aggregate({
        where: {
          status: 'ACTIVE',
          isDeleted: false,
          maturityDate: { gte: w.from, lt: w.to },
        },
        _count: true,
        _sum: { currentBalance: true, interestAccrued: true },
      })
    ),
  ]);

  const n = monthWindows.length;
  const monthWithdrawals = rest.slice(0, n) as any[];
  const monthInterest = rest.slice(n, n * 2) as any[];
  const monthMaturities = rest.slice(n * 2) as any[];

  const now = today.getTime();
  const upcomingMaturities = maturingAccounts.map((a) => {
    const maturity = a.maturityDate as Date;
    const projectedPayout =
      (a.totalDeposits?.toNumber() ?? a.currentBalance.toNumber()) +
      a.interestAccrued.toNumber();
    return {
      id: a.id,
      accountNumber: a.accountNumber,
      customerName: `${a.customer.firstName} ${a.customer.lastName}`,
      productName: a.product.name,
      maturityDate: maturity.toISOString(),
      daysToMaturity: Math.max(0, Math.ceil((maturity.getTime() - now) / 86400000)),
      projectedPayout,
    };
  });

  const depositsByMonth = monthWindows.map((w, i) => ({
    label: w.label,
    amount: monthDeposits[i]?._sum.amount?.toNumber() ?? 0,
  }));

  const flowByMonth = monthWindows.map((w, i) => {
    const deposits = monthDeposits[i]?._sum.amount?.toNumber() ?? 0;
    const withdrawals = monthWithdrawals[i]?._sum.amount?.toNumber() ?? 0;
    return { label: w.label, deposits, withdrawals, net: deposits - withdrawals };
  });

  const interestByMonth = monthWindows.map((w, i) => ({
    label: w.label,
    amount: monthInterest[i]?._sum.amount?.toNumber() ?? 0,
  }));

  const maturitySchedule = forwardWindows.map((w, i) => ({
    label: w.label,
    count: monthMaturities[i]?._count ?? 0,
    amount:
      (monthMaturities[i]?._sum.currentBalance?.toNumber() ?? 0) +
      (monthMaturities[i]?._sum.interestAccrued?.toNumber() ?? 0),
  }));

  return {
    portfolio: {
      activeAccounts: portfolioAgg._count,
      totalPortfolio: portfolioAgg._sum.currentBalance?.toNumber() ?? 0,
      totalPendingDeposits: pendingAgg._sum.pendingDeposits?.toNumber() ?? 0,
      totalEligibleBalance: eligibleAgg._sum.eligibleBalance?.toNumber() ?? 0,
    },
    interest: {
      totalAllocated: interestAllocatedAgg._sum.amount?.toNumber() ?? 0,
      outstandingLiability: Math.max(
        0,
        (outstandingLiabilityAgg._sum.interestTargetTotal?.toNumber() ?? 0) -
          (outstandingLiabilityAgg._sum.interestPaidToDate?.toNumber() ?? 0)
      ),
      thisMonth: interestThisMonthAgg._sum.amount?.toNumber() ?? 0,
    },
    deposits: {
      todayCount: todayDepositsAgg._count,
      todayAmount: todayDepositsAgg._sum.amount?.toNumber() ?? 0,
      monthCount: monthDepositsAgg._count,
      monthAmount: monthDepositsAgg._sum.amount?.toNumber() ?? 0,
    },
    statusCounts,
    completed: {
      count: completedCount,
      totalPaidOut: completedPayoutAgg._sum.amount?.toNumber() ?? 0,
    },
    upcomingMaturities,
    flowByMonth,
    interestByMonth,
    maturitySchedule,
    promo: {
      accounts: promoAgg._count,
      balance: promoAgg._sum.currentBalance?.toNumber() ?? 0,
      activeProducts: promoProducts,
    },
    productBreakdown,
    mostPopularProduct: productBreakdown.length
      ? { name: productBreakdown[0].name, accountCount: productBreakdown[0].accountCount }
      : null,
    depositsByMonth,
  };
}
