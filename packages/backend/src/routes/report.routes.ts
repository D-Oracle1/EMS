/**
 * Hylink EMS - Report Routes
 * Financial and operational reports
 */

import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { accountingService } from '../services/accounting.service.js';
import { loanService } from '../services/loan.service.js';
import { savingsService } from '../services/savings.service.js';
import { fixedDepositService } from '../services/fixed-deposit.service.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { auditExport } from '../middleware/audit.js';
import { AuthenticatedRequest } from '../types/index.js';
import { LoanStatus, ScheduleStatus, JournalStatus } from '@prisma/client';
import Decimal from 'decimal.js';

const router = Router();

router.use(authenticate as any);

/**
 * GET /api/v1/reports/dashboard
 * Executive dashboard summary
 */
router.get(
  '/dashboard',
  requirePermission('ACCOUNTS:REPORTS_VIEW'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const branchId = req.query.branchId as string | undefined;

    const [loanPortfolio, savingsSummary, fdSummary, recentActivity] = await Promise.all([
      loanService.getPortfolioSummary(branchId),
      savingsService.getSavingsSummary(branchId),
      fixedDepositService.getFixedDepositSummary(branchId),
      prisma.journalEntry.findMany({
        where: { status: JournalStatus.POSTED },
        orderBy: { postedAt: 'desc' },
        take: 10,
        select: {
          entryNumber: true,
          description: true,
          totalDebit: true,
          postedAt: true,
          sourceModule: true,
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        loans: loanPortfolio,
        savings: savingsSummary,
        fixedDeposits: fdSummary,
        recentActivity,
      },
    });
  })
);

/**
 * GET /api/v1/reports/trial-balance
 * Trial Balance Report
 */
router.get(
  '/trial-balance',
  requirePermission('ACCOUNTS:REPORTS_VIEW'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate as string) : new Date();
    const trialBalance = await accountingService.generateTrialBalance(asOfDate);

    await auditExport(req, 'TRIAL_BALANCE', { asOfDate }, trialBalance.accounts.length);

    res.json({
      success: true,
      data: {
        reportDate: asOfDate,
        generatedAt: new Date(),
        ...trialBalance,
      },
    });
  })
);

/**
 * GET /api/v1/reports/income-statement
 * Income Statement / Profit & Loss
 */
router.get(
  '/income-statement',
  requirePermission('ACCOUNTS:REPORTS_VIEW'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    // Get income accounts
    const incomeAccounts = await prisma.chartOfAccounts.findMany({
      where: { accountType: 'INCOME', isActive: true, isHeader: false },
    });

    // Get expense accounts
    const expenseAccounts = await prisma.chartOfAccounts.findMany({
      where: { accountType: 'EXPENSE', isActive: true, isHeader: false },
    });

    // Calculate income
    let totalIncome = new Decimal(0);
    const incomeDetails = await Promise.all(
      incomeAccounts.map(async (acc) => {
        const { balance } = await accountingService.getAccountBalance(acc.id, endDate);
        totalIncome = totalIncome.plus(balance);
        return {
          accountCode: acc.accountCode,
          accountName: acc.accountName,
          amount: balance,
        };
      })
    );

    // Calculate expenses
    let totalExpenses = new Decimal(0);
    const expenseDetails = await Promise.all(
      expenseAccounts.map(async (acc) => {
        const { balance } = await accountingService.getAccountBalance(acc.id, endDate);
        totalExpenses = totalExpenses.plus(balance);
        return {
          accountCode: acc.accountCode,
          accountName: acc.accountName,
          amount: balance,
        };
      })
    );

    const netIncome = totalIncome.minus(totalExpenses);

    await auditExport(req, 'INCOME_STATEMENT', { startDate, endDate }, incomeDetails.length + expenseDetails.length);

    res.json({
      success: true,
      data: {
        period: { startDate, endDate },
        generatedAt: new Date(),
        income: {
          details: incomeDetails.filter(i => i.amount !== 0),
          total: totalIncome.toNumber(),
        },
        expenses: {
          details: expenseDetails.filter(e => e.amount !== 0),
          total: totalExpenses.toNumber(),
        },
        netIncome: netIncome.toNumber(),
      },
    });
  })
);

/**
 * GET /api/v1/reports/balance-sheet
 * Balance Sheet Report
 */
router.get(
  '/balance-sheet',
  requirePermission('ACCOUNTS:REPORTS_VIEW'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate as string) : new Date();

    const accountTypes = ['ASSET', 'LIABILITY', 'EQUITY'] as const;
    const result: Record<string, { details: any[]; total: number }> = {};

    for (const type of accountTypes) {
      const accounts = await prisma.chartOfAccounts.findMany({
        where: { accountType: type, isActive: true, isHeader: false },
      });

      let total = new Decimal(0);
      const details = await Promise.all(
        accounts.map(async (acc) => {
          const { balance } = await accountingService.getAccountBalance(acc.id, asOfDate);
          total = total.plus(balance);
          return {
            accountCode: acc.accountCode,
            accountName: acc.accountName,
            balance,
          };
        })
      );

      result[type.toLowerCase()] = {
        details: details.filter(d => d.balance !== 0),
        total: total.toNumber(),
      };
    }

    await auditExport(req, 'BALANCE_SHEET', { asOfDate }, Object.values(result).reduce((sum, r) => sum + r.details.length, 0));

    res.json({
      success: true,
      data: {
        asOfDate,
        generatedAt: new Date(),
        assets: result.asset,
        liabilities: result.liability,
        equity: result.equity,
      },
    });
  })
);

/**
 * GET /api/v1/reports/loan-portfolio
 * Loan Portfolio Report
 */
router.get(
  '/loan-portfolio',
  requirePermission('ACCOUNTS:REPORTS_VIEW'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const branchId = req.query.branchId as string | undefined;

    const [summary, byProduct, byOfficer, aging] = await Promise.all([
      loanService.getPortfolioSummary(branchId),

      // By product
      prisma.loan.groupBy({
        by: ['productId'],
        where: { status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] }, ...(branchId ? { branchId } : {}) },
        _count: { id: true },
        _sum: { principalAmount: true },
      }),

      // By officer
      prisma.loan.groupBy({
        by: ['createdById'],
        where: { status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] }, ...(branchId ? { branchId } : {}) },
        _count: { id: true },
        _sum: { principalAmount: true },
      }),

      // Aging analysis
      prisma.loanSchedule.groupBy({
        by: ['status'],
        where: {
          loan: { status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] }, ...(branchId ? { branchId } : {}) },
        },
        _count: { id: true },
        _sum: { totalDue: true },
      }),
    ]);

    // Get product names
    const products = await prisma.loanProduct.findMany({
      where: { id: { in: byProduct.map(p => p.productId) } },
      select: { id: true, name: true },
    });

    // Get officer names
    const officers = await prisma.staff.findMany({
      where: { id: { in: byOfficer.map(o => o.createdById) } },
      select: { id: true, firstName: true, lastName: true },
    });

    await auditExport(req, 'LOAN_PORTFOLIO', { branchId }, summary.totalLoans);

    res.json({
      success: true,
      data: {
        generatedAt: new Date(),
        summary,
        byProduct: byProduct.map(p => ({
          product: products.find(pr => pr.id === p.productId)?.name || 'Unknown',
          count: p._count.id,
          amount: p._sum.principalAmount?.toNumber() || 0,
        })),
        byOfficer: byOfficer.map(o => ({
          officer: officers.find(of => of.id === o.createdById),
          count: o._count.id,
          amount: o._sum.principalAmount?.toNumber() || 0,
        })),
        aging: aging.map(a => ({
          status: a.status,
          count: a._count.id,
          amount: a._sum.totalDue?.toNumber() || 0,
        })),
      },
    });
  })
);

/**
 * GET /api/v1/reports/loan-aging
 * Detailed Loan Aging Report
 */
router.get(
  '/loan-aging',
  requirePermission('ACCOUNTS:REPORTS_VIEW'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const asOfDate = new Date();

    // Get overdue schedules grouped by days overdue
    const overdueSchedules = await prisma.loanSchedule.findMany({
      where: {
        status: ScheduleStatus.OVERDUE,
        dueDate: { lt: asOfDate },
      },
      include: {
        loan: {
          include: {
            customer: { select: { firstName: true, lastName: true, customerNumber: true } },
          },
        },
      },
    });

    // Group by aging buckets
    const agingBuckets = {
      '1-30': { count: 0, amount: 0, loans: [] as any[] },
      '31-60': { count: 0, amount: 0, loans: [] as any[] },
      '61-90': { count: 0, amount: 0, loans: [] as any[] },
      '91-180': { count: 0, amount: 0, loans: [] as any[] },
      '180+': { count: 0, amount: 0, loans: [] as any[] },
    };

    for (const schedule of overdueSchedules) {
      const daysOverdue = Math.floor((asOfDate.getTime() - schedule.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const amount = schedule.totalDue.toNumber() - schedule.totalPaid.toNumber();

      let bucket: keyof typeof agingBuckets;
      if (daysOverdue <= 30) bucket = '1-30';
      else if (daysOverdue <= 60) bucket = '31-60';
      else if (daysOverdue <= 90) bucket = '61-90';
      else if (daysOverdue <= 180) bucket = '91-180';
      else bucket = '180+';

      agingBuckets[bucket].count++;
      agingBuckets[bucket].amount += amount;
      agingBuckets[bucket].loans.push({
        loanNumber: schedule.loan.loanNumber,
        customer: `${schedule.loan.customer.firstName} ${schedule.loan.customer.lastName}`,
        dueDate: schedule.dueDate,
        daysOverdue,
        amount,
      });
    }

    await auditExport(req, 'LOAN_AGING', { asOfDate }, overdueSchedules.length);

    res.json({
      success: true,
      data: {
        asOfDate,
        generatedAt: new Date(),
        agingBuckets,
        totalOverdue: Object.values(agingBuckets).reduce((sum, b) => sum + b.amount, 0),
      },
    });
  })
);

/**
 * GET /api/v1/reports/customer-statement/:customerId
 * Customer Statement
 */
router.get(
  '/customer-statement/:customerId',
  requirePermission('ACCOUNTS:REPORTS_VIEW'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { customerId } = req.params;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().setMonth(new Date().getMonth() - 3));
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    // Get all loans
    const loans = await prisma.loan.findMany({
      where: { customerId },
      include: {
        repayments: {
          where: { collectedAt: { gte: startDate, lte: endDate } },
        },
        disbursement: true,
      },
    });

    // Get all savings accounts and transactions
    const savingsAccounts = await prisma.savingsAccount.findMany({
      where: { customerId },
      include: {
        transactions: {
          where: { processedAt: { gte: startDate, lte: endDate } },
        },
      },
    });

    // Get all fixed deposits
    const fixedDeposits = await prisma.fixedDeposit.findMany({
      where: { customerId },
    });

    await auditExport(req, 'CUSTOMER_STATEMENT', { customerId, startDate, endDate }, 1);

    res.json({
      success: true,
      data: {
        customer: {
          customerNumber: customer.customerNumber,
          name: `${customer.firstName} ${customer.lastName}`,
          phone: customer.phone,
          email: customer.email,
        },
        period: { startDate, endDate },
        generatedAt: new Date(),
        loans: loans.map(l => ({
          loanNumber: l.loanNumber,
          principal: l.principalAmount.toNumber(),
          status: l.status,
          disbursedAt: l.disbursedAt,
          repayments: l.repayments.map(r => ({
            date: r.collectedAt,
            amount: r.amount.toNumber(),
            receiptNumber: r.receiptNumber,
          })),
        })),
        savings: savingsAccounts.map(s => ({
          accountNumber: s.accountNumber,
          currentBalance: s.currentBalance.toNumber(),
          transactions: s.transactions.map(t => ({
            date: t.processedAt,
            type: t.transactionType,
            amount: t.amount.toNumber(),
            balance: t.balanceAfter.toNumber(),
          })),
        })),
        fixedDeposits: fixedDeposits.map(fd => ({
          certificateNumber: fd.certificateNumber,
          principal: fd.principalAmount.toNumber(),
          interestRate: fd.interestRate.toNumber(),
          maturityDate: fd.maturityDate,
          status: fd.status,
        })),
      },
    });
  })
);

/**
 * GET /api/v1/reports/cash-flow
 * Cash Flow Statement
 */
router.get(
  '/cash-flow',
  requirePermission('ACCOUNTS:REPORTS_VIEW'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    // Get journal entries grouped by source module
    const entries = await prisma.journalEntry.groupBy({
      by: ['sourceModule', 'sourceType'],
      where: {
        status: JournalStatus.POSTED,
        entryDate: { gte: startDate, lte: endDate },
      },
      _sum: { totalDebit: true },
      _count: { id: true },
    });

    const cashFlowByCategory = entries.reduce((acc, e) => {
      const key = e.sourceModule || 'OTHER';
      if (!acc[key]) {
        acc[key] = { transactions: 0, amount: 0 };
      }
      acc[key].transactions += e._count.id;
      acc[key].amount += e._sum.totalDebit?.toNumber() || 0;
      return acc;
    }, {} as Record<string, { transactions: number; amount: number }>);

    await auditExport(req, 'CASH_FLOW', { startDate, endDate }, entries.length);

    res.json({
      success: true,
      data: {
        period: { startDate, endDate },
        generatedAt: new Date(),
        byCategory: cashFlowByCategory,
      },
    });
  })
);

export default router;
