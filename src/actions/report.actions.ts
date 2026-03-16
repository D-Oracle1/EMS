'use server';

import Decimal from 'decimal.js';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export async function getTrialBalanceReport() {
  await requirePermission('ACCOUNTS:REPORTS_VIEW');

  const accounts = await prisma.chartOfAccounts.findMany({
    where: { isActive: true, isHeader: false },
    orderBy: { accountCode: 'asc' },
  });

  let totalDebits = new Decimal(0);
  let totalCredits = new Decimal(0);

  const rows = accounts
    .filter((a) => !new Decimal(a.currentBalance.toString()).isZero())
    .map((account) => {
      const balance = new Decimal(account.currentBalance.toString());
      const isDebitBalance = account.normalBalance === 'DEBIT' ? balance.gte(0) : balance.lt(0);

      const debit = isDebitBalance ? balance.abs().toNumber() : 0;
      const credit = isDebitBalance ? 0 : balance.abs().toNumber();

      totalDebits = totalDebits.plus(debit);
      totalCredits = totalCredits.plus(credit);

      return {
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        debit,
        credit,
      };
    });

  return {
    rows,
    totalDebits: totalDebits.toNumber(),
    totalCredits: totalCredits.toNumber(),
    isBalanced: totalDebits.equals(totalCredits),
  };
}

export async function getIncomeStatement(startDate?: string, endDate?: string) {
  await requirePermission('ACCOUNTS:REPORTS_VIEW');

  const [incomeAccounts, expenseAccounts] = await Promise.all([
    prisma.chartOfAccounts.findMany({
      where: { accountType: 'INCOME', isActive: true, isHeader: false },
      orderBy: { accountCode: 'asc' },
    }),
    prisma.chartOfAccounts.findMany({
      where: { accountType: 'EXPENSE', isActive: true, isHeader: false },
      orderBy: { accountCode: 'asc' },
    }),
  ]);

  const hasDateFilter = !!(startDate || endDate);

  // When date range is provided, aggregate from JournalEntryLines (true period P&L).
  // Otherwise fall back to cumulative currentBalance.
  const lineSums: Record<string, { debit: Decimal; credit: Decimal }> = {};

  if (hasDateFilter) {
    const entryDateFilter: Record<string, Date> = {};
    if (startDate) entryDateFilter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      entryDateFilter.lte = end;
    }

    const allAccountIds = [
      ...incomeAccounts.map((a) => a.id),
      ...expenseAccounts.map((a) => a.id),
    ];

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        accountId: { in: allAccountIds },
        journalEntry: { status: 'POSTED', entryDate: entryDateFilter as any },
      },
      select: { accountId: true, debitAmount: true, creditAmount: true },
    });

    for (const line of lines) {
      if (!lineSums[line.accountId]) {
        lineSums[line.accountId] = { debit: new Decimal(0), credit: new Decimal(0) };
      }
      lineSums[line.accountId].debit = lineSums[line.accountId].debit.plus(line.debitAmount.toString());
      lineSums[line.accountId].credit = lineSums[line.accountId].credit.plus(line.creditAmount.toString());
    }
  }

  let totalIncome = new Decimal(0);
  let totalExpenses = new Decimal(0);

  const income = incomeAccounts
    .map((a) => {
      const sums = lineSums[a.id];
      const amount = hasDateFilter
        ? Math.max(0, sums ? sums.credit.minus(sums.debit).toNumber() : 0)
        : new Decimal(a.currentBalance.toString()).abs().toNumber();
      totalIncome = totalIncome.plus(amount);
      return { accountCode: a.accountCode, accountName: a.accountName, amount };
    })
    .filter((a) => a.amount > 0);

  const expenses = expenseAccounts
    .map((a) => {
      const sums = lineSums[a.id];
      const amount = hasDateFilter
        ? Math.max(0, sums ? sums.debit.minus(sums.credit).toNumber() : 0)
        : new Decimal(a.currentBalance.toString()).abs().toNumber();
      totalExpenses = totalExpenses.plus(amount);
      return { accountCode: a.accountCode, accountName: a.accountName, amount };
    })
    .filter((a) => a.amount > 0);

  return {
    income,
    expenses,
    totalIncome: totalIncome.toNumber(),
    totalExpenses: totalExpenses.toNumber(),
    netIncome: totalIncome.minus(totalExpenses).toNumber(),
    periodStart: startDate,
    periodEnd: endDate,
  };
}

/**
 * Cash Flow Statement — aggregates Dr/Cr movements on cash accounts (1110/1120)
 * in the given period, grouped by sourceModule.
 * Cash account is DEBIT normal: Dr = cash IN, Cr = cash OUT.
 */
export async function getCashFlowReport(startDate?: string, endDate?: string) {
  await requirePermission('ACCOUNTS:REPORTS_VIEW');

  const cashAccounts = await prisma.chartOfAccounts.findMany({
    where: { accountCode: { in: ['1110', '1120'] }, isActive: true },
    select: { id: true, accountCode: true, accountName: true },
  });

  const cashAccountIds = cashAccounts.map((a) => a.id);
  if (cashAccountIds.length === 0) {
    return { openingBalance: 0, closingBalance: 0, netChange: 0, sections: [], periodStart: startDate, periodEnd: endDate };
  }

  const periodStart = startDate ? new Date(startDate) : undefined;
  const periodEnd = endDate ? (() => { const d = new Date(endDate); d.setHours(23, 59, 59, 999); return d; })() : undefined;

  // Opening cash balance = net of all POSTED cash lines before the period start
  let openingBalance = 0;
  if (periodStart) {
    const opening = await prisma.journalEntryLine.aggregate({
      where: {
        accountId: { in: cashAccountIds },
        journalEntry: { status: 'POSTED', entryDate: { lt: periodStart } },
      },
      _sum: { debitAmount: true, creditAmount: true },
    });
    openingBalance = new Decimal(opening._sum.debitAmount?.toString() || '0')
      .minus(opening._sum.creditAmount?.toString() || '0')
      .toNumber();
  }

  // Period cash movements
  const periodFilter: Record<string, Date> = {};
  if (periodStart) periodFilter.gte = periodStart;
  if (periodEnd) periodFilter.lte = periodEnd;

  const periodLines = await prisma.journalEntryLine.findMany({
    where: {
      accountId: { in: cashAccountIds },
      journalEntry: {
        status: 'POSTED',
        ...(Object.keys(periodFilter).length ? { entryDate: periodFilter as any } : {}),
      },
    },
    select: {
      debitAmount: true,
      creditAmount: true,
      journalEntry: { select: { sourceModule: true } },
    },
  });

  const moduleLabels: Record<string, string> = {
    LOANS: 'Loan Operations',
    SAVINGS: 'Savings Operations',
    FIXED_DEPOSITS: 'Fixed Deposits',
    MANUAL: 'Manual / Other',
  };

  const moduleMap: Record<string, { cashIn: Decimal; cashOut: Decimal }> = {};
  for (const line of periodLines) {
    const mod = line.journalEntry.sourceModule || 'MANUAL';
    const key = moduleLabels[mod] ? mod : 'MANUAL';
    if (!moduleMap[key]) moduleMap[key] = { cashIn: new Decimal(0), cashOut: new Decimal(0) };
    moduleMap[key].cashIn = moduleMap[key].cashIn.plus(line.debitAmount.toString());
    moduleMap[key].cashOut = moduleMap[key].cashOut.plus(line.creditAmount.toString());
  }

  let totalNetChange = new Decimal(0);
  const sections = Object.entries(moduleMap)
    .map(([mod, v]) => {
      const netCash = v.cashIn.minus(v.cashOut).toNumber();
      totalNetChange = totalNetChange.plus(netCash);
      return { module: mod, label: moduleLabels[mod] || mod, cashIn: v.cashIn.toNumber(), cashOut: v.cashOut.toNumber(), netCash };
    })
    .filter((s) => s.cashIn > 0 || s.cashOut > 0);

  const closingBalance = new Decimal(openingBalance).plus(totalNetChange).toNumber();

  return {
    openingBalance,
    closingBalance,
    netChange: totalNetChange.toNumber(),
    sections,
    periodStart: startDate,
    periodEnd: endDate,
  };
}

export async function getBalanceSheet() {
  await requirePermission('ACCOUNTS:REPORTS_VIEW');

  const types = ['ASSET', 'LIABILITY', 'EQUITY'] as const;
  const result: Record<string, { accounts: Array<{ code: string; name: string; balance: number }>; total: number }> = {};

  for (const type of types) {
    const accounts = await prisma.chartOfAccounts.findMany({
      where: { accountType: type, isActive: true, isHeader: false },
      orderBy: { accountCode: 'asc' },
    });

    let total = new Decimal(0);
    const items = accounts
      .filter((a) => !new Decimal(a.currentBalance.toString()).isZero())
      .map((a) => {
        const balance = new Decimal(a.currentBalance.toString()).abs().toNumber();
        total = total.plus(balance);
        return { code: a.accountCode, name: a.accountName, balance };
      });

    result[type] = { accounts: items, total: total.toNumber() };
  }

  return result;
}

export async function getLoanPortfolioReport() {
  await requirePermission('ACCOUNTS:REPORTS_VIEW');

  const loans = await prisma.loan.findMany({
    where: { status: { in: ['ACTIVE', 'OVERDUE', 'DEFAULTED'] } },
    include: {
      customer: { select: { firstName: true, lastName: true, customerNumber: true } },
      product: { select: { name: true } },
      schedule: { where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } } },
    },
  });

  const portfolio = loans.map((loan) => {
    const totalOutstanding = loan.schedule.reduce(
      (sum, s) => sum.plus(new Decimal(s.totalDue.toString()).minus(s.totalPaid.toString())),
      new Decimal(0)
    );

    return {
      loanNumber: loan.loanNumber,
      customer: `${loan.customer.firstName} ${loan.customer.lastName}`,
      customerNumber: loan.customer.customerNumber,
      product: loan.product.name,
      principalAmount: loan.principalAmount.toNumber(),
      outstanding: totalOutstanding.toNumber(),
      status: loan.status,
      disbursedAt: loan.disbursedAt,
      maturityDate: loan.maturityDate,
    };
  });

  const totalDisbursed = loans.reduce((sum, l) => sum.plus(l.principalAmount.toString()), new Decimal(0));
  const totalOutstanding = portfolio.reduce((sum, p) => sum + p.outstanding, 0);

  return {
    portfolio,
    summary: {
      totalLoans: loans.length,
      totalDisbursed: totalDisbursed.toNumber(),
      totalOutstanding,
      activeLoans: loans.filter((l) => l.status === 'ACTIVE').length,
      overdueLoans: loans.filter((l) => l.status === 'OVERDUE').length,
    },
  };
}

export async function getAuditLogs(filters?: {
  module?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  userId?: string;
  page?: number;
  limit?: number;
}) {
  await requirePermission('AUDIT:READ');

  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters?.module) where.module = filters.module;
  if (filters?.action) where.action = filters.action;
  if (filters?.userId) where.userId = filters.userId;
  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters?.startDate) (where.createdAt as any).gte = new Date(filters.startDate);
    if (filters?.endDate) (where.createdAt as any).lte = new Date(filters.endDate);
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: where as any,
      include: { user: { select: { firstName: true, lastName: true, employeeId: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where: where as any }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function logExportAction(reportType: string, format: string): Promise<void> {
  const user = await requirePermission('ACCOUNTS:REPORTS_VIEW');

  await auditLog({
    userId: user.id, action: 'EXPORT', module: 'REPORTS',
    entityType: 'REPORT',
    description: `Exported ${reportType} report as ${format}`,
    metadata: { reportType, format, exportedAt: new Date().toISOString() },
  });
}
