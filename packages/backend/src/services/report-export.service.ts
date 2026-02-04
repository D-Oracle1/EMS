/**
 * Hylink EMS - Report Export Service
 * PDF and Excel export functionality
 */

import { prisma } from '../lib/prisma.js';
import { accountingService } from './accounting.service.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/index.js';

interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv';
  filename?: string;
}

interface ReportData {
  title: string;
  subtitle?: string;
  generatedAt: Date;
  generatedBy: string;
  period?: { start: Date; end: Date };
  headers: string[];
  rows: (string | number)[][];
  totals?: (string | number)[];
  summary?: Record<string, string | number>;
}

export class ReportExportService {
  /**
   * Generate Trial Balance export data
   */
  async getTrialBalanceData(asOfDate: Date, generatedBy: string): Promise<ReportData> {
    const result = await accountingService.generateTrialBalance(asOfDate);

    return {
      title: 'Trial Balance',
      subtitle: config.companyName,
      generatedAt: new Date(),
      generatedBy,
      period: { start: asOfDate, end: asOfDate },
      headers: ['Account Code', 'Account Name', 'Account Type', 'Debit', 'Credit'],
      rows: result.accounts.map(acc => [
        acc.accountCode,
        acc.accountName,
        acc.accountType,
        acc.debitBalance || '',
        acc.creditBalance || '',
      ]),
      totals: ['', '', 'TOTALS', result.totals.debit, result.totals.credit],
    };
  }

  /**
   * Generate Loan Portfolio export data
   */
  async getLoanPortfolioData(branchId: string | undefined, generatedBy: string): Promise<ReportData> {
    const loans = await prisma.loan.findMany({
      where: {
        status: { in: ['ACTIVE', 'OVERDUE', 'DISBURSED'] },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        customer: { select: { firstName: true, lastName: true, customerNumber: true } },
        product: { select: { name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { applicationDate: 'desc' },
    });

    let totalPrincipal = 0;
    let totalOutstanding = 0;

    const rows = loans.map(loan => {
      totalPrincipal += loan.principalAmount.toNumber();
      // Calculate outstanding (simplified)
      const outstanding = loan.status === 'CLOSED' ? 0 : loan.principalAmount.toNumber();
      totalOutstanding += outstanding;

      return [
        loan.loanNumber,
        loan.customer.firstName + ' ' + loan.customer.lastName,
        loan.product.name,
        loan.principalAmount.toNumber(),
        loan.interestRate.toNumber() + '%',
        loan.tenure + ' months',
        loan.status,
        new Date(loan.applicationDate).toLocaleDateString(),
        loan.createdBy.firstName + ' ' + loan.createdBy.lastName,
      ];
    });

    return {
      title: 'Loan Portfolio Report',
      subtitle: config.companyName,
      generatedAt: new Date(),
      generatedBy,
      headers: ['Loan #', 'Customer', 'Product', 'Principal', 'Rate', 'Tenure', 'Status', 'Date', 'Officer'],
      rows,
      totals: ['', '', 'TOTALS', totalPrincipal, '', '', '', '', ''],
      summary: {
        'Total Loans': loans.length,
        'Total Principal': totalPrincipal,
        'Active Loans': loans.filter(l => l.status === 'ACTIVE').length,
        'Overdue Loans': loans.filter(l => l.status === 'OVERDUE').length,
      },
    };
  }

  /**
   * Generate Loan Aging export data
   */
  async getLoanAgingData(generatedBy: string): Promise<ReportData> {
    const today = new Date();
    
    const overdueSchedules = await prisma.loanSchedule.findMany({
      where: {
        status: 'OVERDUE',
        dueDate: { lt: today },
      },
      include: {
        loan: {
          include: {
            customer: { select: { firstName: true, lastName: true, customerNumber: true, phone: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const rows = overdueSchedules.map(schedule => {
      const daysOverdue = Math.floor((today.getTime() - schedule.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const outstanding = schedule.totalDue.toNumber() - schedule.totalPaid.toNumber();
      
      let bucket = '180+';
      if (daysOverdue <= 30) bucket = '1-30';
      else if (daysOverdue <= 60) bucket = '31-60';
      else if (daysOverdue <= 90) bucket = '61-90';
      else if (daysOverdue <= 180) bucket = '91-180';

      return [
        schedule.loan.loanNumber,
        schedule.loan.customer.firstName + ' ' + schedule.loan.customer.lastName,
        schedule.loan.customer.phone || '',
        new Date(schedule.dueDate).toLocaleDateString(),
        daysOverdue,
        bucket,
        outstanding,
      ];
    });

    return {
      title: 'Loan Aging Report',
      subtitle: config.companyName,
      generatedAt: new Date(),
      generatedBy,
      headers: ['Loan #', 'Customer', 'Phone', 'Due Date', 'Days Overdue', 'Bucket', 'Outstanding'],
      rows,
      summary: {
        'Total Overdue Schedules': overdueSchedules.length,
        'Total Outstanding': rows.reduce((sum, r) => sum + (r[6] as number), 0),
      },
    };
  }

  /**
   * Generate Customer Statement export data
   */
  async getCustomerStatementData(
    customerId: string,
    startDate: Date,
    endDate: Date,
    generatedBy: string
  ): Promise<ReportData> {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get all transactions
    const [loanRepayments, savingsTransactions] = await Promise.all([
      prisma.loanRepayment.findMany({
        where: {
          collectedAt: { gte: startDate, lte: endDate },
        },
        include: {
          schedule: {
            include: {
              loan: {
                where: { customerId },
                select: { loanNumber: true },
              },
            },
          },
        },
      }),
      prisma.savingsTransaction.findMany({
        where: {
          processedAt: { gte: startDate, lte: endDate },
          account: { customerId },
        },
        include: {
          account: { select: { accountNumber: true } },
        },
      }),
    ]);

    const rows: (string | number)[][] = [];

    // Add loan repayments
    for (const repayment of loanRepayments) {
      if (repayment.schedule?.loan) {
        rows.push([
          new Date(repayment.collectedAt).toLocaleDateString(),
          'LOAN_REPAYMENT',
          repayment.schedule.loan.loanNumber,
          repayment.receiptNumber,
          repayment.amount.toNumber(),
          '',
        ]);
      }
    }

    // Add savings transactions
    for (const txn of savingsTransactions) {
      const isDebit = ['WITHDRAWAL', 'FEE_DEBIT', 'TRANSFER_OUT'].includes(txn.transactionType);
      rows.push([
        new Date(txn.processedAt).toLocaleDateString(),
        txn.transactionType,
        txn.account.accountNumber,
        txn.transactionRef,
        isDebit ? '' : txn.amount.toNumber(),
        isDebit ? txn.amount.toNumber() : '',
      ]);
    }

    // Sort by date
    rows.sort((a, b) => new Date(a[0] as string).getTime() - new Date(b[0] as string).getTime());

    return {
      title: 'Customer Statement',
      subtitle: customer.firstName + ' ' + customer.lastName + ' (' + customer.customerNumber + ')',
      generatedAt: new Date(),
      generatedBy,
      period: { start: startDate, end: endDate },
      headers: ['Date', 'Type', 'Account/Loan', 'Reference', 'Credit', 'Debit'],
      rows,
      summary: {
        'Customer': customer.firstName + ' ' + customer.lastName,
        'Customer Number': customer.customerNumber,
        'Phone': customer.phone,
      },
    };
  }

  /**
   * Generate Savings Summary export data
   */
  async getSavingsSummaryData(branchId: string | undefined, generatedBy: string): Promise<ReportData> {
    const accounts = await prisma.savingsAccount.findMany({
      where: branchId ? { branchId } : {},
      include: {
        customer: { select: { firstName: true, lastName: true, customerNumber: true } },
        product: { select: { name: true, savingsType: true } },
      },
      orderBy: { currentBalance: 'desc' },
    });

    let totalBalance = 0;

    const rows = accounts.map(acc => {
      totalBalance += acc.currentBalance.toNumber();
      return [
        acc.accountNumber,
        acc.customer.firstName + ' ' + acc.customer.lastName,
        acc.product.name,
        acc.product.savingsType,
        acc.currentBalance.toNumber(),
        acc.status,
        new Date(acc.openedAt).toLocaleDateString(),
      ];
    });

    return {
      title: 'Savings Accounts Summary',
      subtitle: config.companyName,
      generatedAt: new Date(),
      generatedBy,
      headers: ['Account #', 'Customer', 'Product', 'Type', 'Balance', 'Status', 'Opened'],
      rows,
      totals: ['', '', '', 'TOTAL', totalBalance, '', ''],
      summary: {
        'Total Accounts': accounts.length,
        'Active Accounts': accounts.filter(a => a.status === 'ACTIVE').length,
        'Total Balance': totalBalance,
      },
    };
  }

  /**
   * Generate Fixed Deposit Summary export data
   */
  async getFixedDepositSummaryData(branchId: string | undefined, generatedBy: string): Promise<ReportData> {
    const deposits = await prisma.fixedDeposit.findMany({
      where: branchId ? { branchId } : {},
      include: {
        customer: { select: { firstName: true, lastName: true, customerNumber: true } },
      },
      orderBy: { maturityDate: 'asc' },
    });

    let totalPrincipal = 0;
    let totalInterest = 0;

    const rows = deposits.map(fd => {
      totalPrincipal += fd.principalAmount.toNumber();
      totalInterest += fd.interestAmount.toNumber();
      return [
        fd.certificateNumber,
        fd.customer.firstName + ' ' + fd.customer.lastName,
        fd.principalAmount.toNumber(),
        fd.interestRate.toNumber() + '%',
        fd.tenure + ' days',
        fd.interestAmount.toNumber(),
        fd.maturityAmount.toNumber(),
        new Date(fd.maturityDate).toLocaleDateString(),
        fd.status,
      ];
    });

    return {
      title: 'Fixed Deposit Summary',
      subtitle: config.companyName,
      generatedAt: new Date(),
      generatedBy,
      headers: ['Certificate #', 'Customer', 'Principal', 'Rate', 'Tenure', 'Interest', 'Maturity Amt', 'Maturity Date', 'Status'],
      rows,
      totals: ['', 'TOTALS', totalPrincipal, '', '', totalInterest, totalPrincipal + totalInterest, '', ''],
      summary: {
        'Total Deposits': deposits.length,
        'Active Deposits': deposits.filter(d => d.status === 'ACTIVE').length,
        'Total Principal': totalPrincipal,
        'Total Interest': totalInterest,
      },
    };
  }

  /**
   * Convert report data to CSV string
   */
  toCSV(data: ReportData): string {
    const lines: string[] = [];
    
    // Header info
    lines.push(data.title);
    if (data.subtitle) lines.push(data.subtitle);
    lines.push('Generated: ' + data.generatedAt.toLocaleString());
    lines.push('Generated By: ' + data.generatedBy);
    if (data.period) {
      lines.push('Period: ' + data.period.start.toLocaleDateString() + ' to ' + data.period.end.toLocaleDateString());
    }
    lines.push('');

    // Column headers
    lines.push(data.headers.map(h => '"' + h + '"').join(','));

    // Data rows
    for (const row of data.rows) {
      lines.push(row.map(cell => {
        if (typeof cell === 'string') return '"' + cell.replace(/"/g, '""') + '"';
        return cell.toString();
      }).join(','));
    }

    // Totals
    if (data.totals) {
      lines.push(data.totals.map(cell => {
        if (typeof cell === 'string') return '"' + cell + '"';
        return cell.toString();
      }).join(','));
    }

    // Summary
    if (data.summary) {
      lines.push('');
      lines.push('Summary');
      for (const [key, value] of Object.entries(data.summary)) {
        lines.push('"' + key + '","' + value + '"');
      }
    }

    return lines.join('\n');
  }

  /**
   * Export report
   */
  async exportReport(
    reportType: string,
    params: Record<string, any>,
    generatedBy: string,
    options: ExportOptions
  ): Promise<{ data: string; filename: string; contentType: string }> {
    let reportData: ReportData;

    switch (reportType) {
      case 'trial-balance':
        reportData = await this.getTrialBalanceData(
          params.asOfDate ? new Date(params.asOfDate) : new Date(),
          generatedBy
        );
        break;
      case 'loan-portfolio':
        reportData = await this.getLoanPortfolioData(params.branchId, generatedBy);
        break;
      case 'loan-aging':
        reportData = await this.getLoanAgingData(generatedBy);
        break;
      case 'customer-statement':
        reportData = await this.getCustomerStatementData(
          params.customerId,
          new Date(params.startDate),
          new Date(params.endDate),
          generatedBy
        );
        break;
      case 'savings-summary':
        reportData = await this.getSavingsSummaryData(params.branchId, generatedBy);
        break;
      case 'fixed-deposit-summary':
        reportData = await this.getFixedDepositSummaryData(params.branchId, generatedBy);
        break;
      default:
        throw new Error('Unknown report type: ' + reportType);
    }

    const filename = options.filename || reportType + '-' + new Date().toISOString().split('T')[0];
    
    // For now, only CSV is implemented
    // PDF would require a library like pdfkit or puppeteer
    // Excel would require a library like exceljs
    const csvData = this.toCSV(reportData);

    logger.info('Report exported', { reportType, format: options.format, generatedBy });

    return {
      data: csvData,
      filename: filename + '.csv',
      contentType: 'text/csv',
    };
  }
}

export const reportExportService = new ReportExportService();
