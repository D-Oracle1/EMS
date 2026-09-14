'use server';

/**
 * Savings Statements & Reports — read-only, savings-scoped.
 */

import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/auth-utils';

const READ_PERMS = ['SAVINGS:READ', 'SAVINGS:CREATE', 'SAVINGS:DEPOSIT', 'SAVINGS:MANAGE'];

export interface SavingsStatementLine {
  date: string;
  ref: string;
  type: string;
  description: string;
  debit: number; // withdrawals / payouts out
  credit: number; // deposits / interest in
  balance: number; // running balance
}

export interface SavingsStatement {
  account: {
    accountNumber: string;
    status: string;
    startDate: string | null;
    maturityDate: string | null;
    monthsCompleted: number;
    monthsRemaining: number | null;
    currentBalance: number;
    interestAccrued: number;
    totalDeposits: number;
    expectedPayout: number;
  };
  customer: { name: string; customerNumber: string; phone: string; email: string | null };
  product: { name: string; code: string; interestMethod: string; monthlyRate: number | null; durationMonths: number | null };
  period: { from: string | null; to: string | null };
  openingBalance: number;
  lines: SavingsStatementLine[];
  totals: { deposits: number; withdrawals: number; interest: number; closingBalance: number };
  generatedAt: string;
}

export async function getSavingsStatement(
  accountId: string,
  from?: string,
  to?: string
): Promise<SavingsStatement> {
  await requireAnyPermission(READ_PERMS);

  const account = await prisma.savingsAccount.findUnique({
    where: { id: accountId },
    include: {
      customer: true,
      product: true,
      transactions: { orderBy: [{ processedAt: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!account) throw new Error('Savings account not found');

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(`${to}T23:59:59.999`) : null;

  const isCredit = (type: string) =>
    ['DEPOSIT', 'INTEREST_CREDIT', 'INTEREST_ACCRUAL', 'TRANSFER_IN'].includes(type);

  // Opening balance = running balance of the last transaction before `from`.
  let openingBalance = 0;
  const before = fromDate
    ? account.transactions.filter((t) => t.processedAt < fromDate)
    : [];
  if (before.length) openingBalance = before[before.length - 1].balanceAfter.toNumber();

  const inRange = account.transactions.filter((t) => {
    if (fromDate && t.processedAt < fromDate) return false;
    if (toDate && t.processedAt > toDate) return false;
    return true;
  });

  let running = openingBalance;
  let deposits = 0;
  let withdrawals = 0;
  let interest = 0;

  const lines: SavingsStatementLine[] = inRange.map((t) => {
    const amount = t.amount.toNumber();
    const credit = isCredit(t.transactionType);
    // Interest that only accrues (not credited to balance) does not move the
    // running balance, but is still shown for transparency.
    const movesBalance = t.transactionType !== 'INTEREST_ACCRUAL';
    if (movesBalance) running = t.balanceAfter.toNumber();

    if (t.transactionType === 'DEPOSIT') deposits += amount;
    else if (['WITHDRAWAL', 'MATURITY_PAYOUT', 'TERMINATION_PAYOUT', 'FEE_DEBIT', 'TRANSFER_OUT'].includes(t.transactionType))
      withdrawals += amount;
    else if (['INTEREST_CREDIT', 'INTEREST_ACCRUAL'].includes(t.transactionType)) interest += amount;

    return {
      date: t.processedAt.toISOString(),
      ref: t.transactionRef,
      type: t.transactionType,
      description: t.narration || t.description || t.transactionType.replace(/_/g, ' '),
      debit: credit ? 0 : amount,
      credit: credit ? amount : 0,
      balance: running,
    };
  });

  const totalDeposits = account.totalDeposits?.toNumber() ?? 0;
  const interestAccrued = account.interestAccrued.toNumber();

  return {
    account: {
      accountNumber: account.accountNumber,
      status: account.status,
      startDate: account.startDate?.toISOString() ?? null,
      maturityDate: account.maturityDate?.toISOString() ?? null,
      monthsCompleted: account.monthsCompleted,
      monthsRemaining: account.monthsRemaining,
      currentBalance: account.currentBalance.toNumber(),
      interestAccrued,
      totalDeposits,
      expectedPayout: totalDeposits + interestAccrued,
    },
    customer: {
      name: `${account.customer.firstName} ${account.customer.lastName}`,
      customerNumber: account.customer.customerNumber,
      phone: account.customer.phone,
      email: account.customer.email,
    },
    product: {
      name: account.product.name,
      code: account.product.code,
      interestMethod: account.product.interestCalculationMethod,
      monthlyRate: account.product.monthlyInterestRate?.toNumber() ?? null,
      durationMonths: account.product.durationMonths,
    },
    period: { from: from ?? null, to: to ?? null },
    openingBalance,
    lines,
    totals: {
      deposits,
      withdrawals,
      interest,
      closingBalance: running,
    },
    generatedAt: new Date().toISOString(),
  };
}

export interface SavingsReportFilters {
  productId?: string;
  status?: string;
  officerId?: string;
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  maturityMonth?: string; // YYYY-MM
}

export interface SavingsReportRow {
  id: string;
  accountNumber: string;
  customer: string;
  customerNumber: string;
  product: string;
  status: string;
  currentBalance: number;
  interestAccrued: number;
  totalDeposits: number;
  startDate: string | null;
  maturityDate: string | null;
  monthsRemaining: number | null;
  officer: string;
}

export async function getSavingsReport(filters?: SavingsReportFilters): Promise<{
  rows: SavingsReportRow[];
  summary: { count: number; totalBalance: number; totalInterest: number; totalDeposits: number };
}> {
  await requireAnyPermission(READ_PERMS);

  const where: Record<string, unknown> = { isDeleted: false };
  if (filters?.productId) where.productId = filters.productId;
  if (filters?.status) where.status = filters.status;
  if (filters?.branchId) where.branchId = filters.branchId;
  if (filters?.officerId) where.createdById = filters.officerId;
  if (filters?.dateFrom || filters?.dateTo) {
    where.openedAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999`) } : {}),
    };
  }
  if (filters?.maturityMonth) {
    const [y, m] = filters.maturityMonth.split('-').map(Number);
    if (y && m) {
      where.maturityDate = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }
  }

  const accounts = await prisma.savingsAccount.findMany({
    where,
    include: {
      customer: { select: { firstName: true, lastName: true, customerNumber: true } },
      product: { select: { name: true } },
    },
    orderBy: { openedAt: 'desc' },
  });

  // Resolve officer names in one query
  const officerIds = [...new Set(accounts.map((a) => a.createdById).filter(Boolean) as string[])];
  const officers = officerIds.length
    ? await prisma.staff.findMany({
        where: { id: { in: officerIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const officerName = (id: string | null) => {
    if (!id) return '—';
    const o = officers.find((s) => s.id === id);
    return o ? `${o.firstName} ${o.lastName}` : '—';
  };

  const rows: SavingsReportRow[] = accounts.map((a) => ({
    id: a.id,
    accountNumber: a.accountNumber,
    customer: `${a.customer.firstName} ${a.customer.lastName}`,
    customerNumber: a.customer.customerNumber,
    product: a.product.name,
    status: a.status,
    currentBalance: a.currentBalance.toNumber(),
    interestAccrued: a.interestAccrued.toNumber(),
    totalDeposits: a.totalDeposits?.toNumber() ?? 0,
    startDate: a.startDate?.toISOString() ?? null,
    maturityDate: a.maturityDate?.toISOString() ?? null,
    monthsRemaining: a.monthsRemaining,
    officer: officerName(a.createdById),
  }));

  const summary = rows.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      totalBalance: acc.totalBalance + r.currentBalance,
      totalInterest: acc.totalInterest + r.interestAccrued,
      totalDeposits: acc.totalDeposits + r.totalDeposits,
    }),
    { count: 0, totalBalance: 0, totalInterest: 0, totalDeposits: 0 }
  );

  return { rows, summary };
}

// ============================================================================
// MONTH DRILL-DOWN
// ============================================================================

/**
 * Everything that happened to savings in one month.
 *
 * Note this is a different question from `getSavingsReport`, which reports on
 * *accounts* (their balances, when they were opened, when they mature). This
 * one reports on *movement* — the deposits and withdrawals actually recorded
 * inside a calendar month — which is what a reader is asking for when they
 * click a bar on the dashboard chart.
 */

export interface SavingsMonthTransaction {
  id: string;
  date: string;
  ref: string;
  type: string;
  accountId: string;
  accountNumber: string;
  customer: string;
  amount: number;
  balanceAfter: number;
  paymentMode: string;
  description: string | null;
  processedBy: string;
}

export interface SavingsMonthDetail {
  /** The month asked for, as YYYY-MM. */
  month: string;
  /** Human form, e.g. "September 2026". */
  label: string;
  summary: {
    deposits: { count: number; amount: number };
    withdrawals: { count: number; amount: number };
    net: number;
    /** Distinct accounts and customers that moved money this month. */
    accounts: number;
    customers: number;
    busiestDay: { date: string; amount: number } | null;
  };
  transactions: SavingsMonthTransaction[];
  /** True when the row cap was hit; the summary figures still cover the whole month. */
  truncated: boolean;
  generatedAt: string;
}

/** Above this, we stop shipping individual rows to the browser. */
const MONTH_ROW_CAP = 2000;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export async function getSavingsMonthDetail(month: string): Promise<SavingsMonthDetail> {
  await requireAnyPermission(READ_PERMS);

  const match = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  if (!match) throw new Error('Month must be given as YYYY-MM');
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new Error('Month must be between 01 and 12');

  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 1);

  const where = {
    valueDate: { gte: from, lt: to },
    isReversed: false,
    transactionType: { in: ['DEPOSIT' as const, 'WITHDRAWAL' as const] },
  };

  // The summary is computed over the whole month regardless of the row cap, so
  // a busy month still reports honest totals even when the list is trimmed.
  const [totals, rows, totalCount] = await Promise.all([
    prisma.savingsTransaction.groupBy({
      by: ['transactionType'],
      where,
      _count: true,
      _sum: { amount: true },
    }),
    prisma.savingsTransaction.findMany({
      where,
      include: {
        account: {
          select: {
            id: true,
            accountNumber: true,
            customer: { select: { firstName: true, lastName: true } },
          },
        },
        processedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { valueDate: 'asc' },
      take: MONTH_ROW_CAP,
    }),
    prisma.savingsTransaction.count({ where }),
  ]);

  const bucket = (type: string) => {
    const row = totals.find((t) => t.transactionType === type);
    return {
      count: typeof row?._count === 'number' ? row._count : 0,
      amount: row?._sum.amount?.toNumber() ?? 0,
    };
  };
  const deposits = bucket('DEPOSIT');
  const withdrawals = bucket('WITHDRAWAL');

  // Distinct accounts/customers and the busiest day are derived from the rows
  // we fetched; on a capped month they describe the rows shown.
  const accountIds = new Set<string>();
  const customerNames = new Set<string>();
  const perDay = new Map<string, number>();

  for (const row of rows) {
    accountIds.add(row.account.id);
    customerNames.add(`${row.account.customer.firstName} ${row.account.customer.lastName}`);
    const day = row.valueDate.toISOString().slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + row.amount.toNumber());
  }

  let busiestDay: { date: string; amount: number } | null = null;
  for (const [date, amount] of perDay) {
    if (!busiestDay || amount > busiestDay.amount) busiestDay = { date, amount };
  }

  return {
    month,
    label: `${MONTH_NAMES[monthIndex]} ${year}`,
    summary: {
      deposits,
      withdrawals,
      net: deposits.amount - withdrawals.amount,
      accounts: accountIds.size,
      customers: customerNames.size,
      busiestDay,
    },
    transactions: rows.map((row) => ({
      id: row.id,
      date: row.valueDate.toISOString(),
      ref: row.transactionRef,
      type: row.transactionType,
      accountId: row.account.id,
      accountNumber: row.account.accountNumber,
      customer: `${row.account.customer.firstName} ${row.account.customer.lastName}`,
      amount: row.amount.toNumber(),
      balanceAfter: row.balanceAfter.toNumber(),
      paymentMode: row.paymentMode,
      description: row.description ?? row.narration ?? null,
      processedBy: row.processedBy
        ? `${row.processedBy.firstName} ${row.processedBy.lastName}`
        : '—',
    })),
    truncated: totalCount > rows.length,
    generatedAt: new Date().toISOString(),
  };
}
