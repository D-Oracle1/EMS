/**
 * Hylink EMS - Batch Jobs Service
 * Scheduled tasks for overdue marking, interest accrual, etc.
 */

import { LoanStatus, ScheduleStatus, FixedDepositStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { fixedDepositService } from './fixed-deposit.service.js';
import { notificationService } from './notification.service.js';
import { differenceInDays, addDays, startOfDay } from 'date-fns';

export class BatchService {
  /**
   * Mark overdue loan schedules
   * Should run daily
   */
  async markOverdueLoans(): Promise<{ updated: number; notified: number }> {
    const today = startOfDay(new Date());

    // Find overdue schedules
    const overdueSchedules = await prisma.loanSchedule.findMany({
      where: {
        status: { in: [ScheduleStatus.PENDING, ScheduleStatus.PARTIAL] },
        dueDate: { lt: today },
      },
      include: {
        loan: {
          select: { id: true, loanNumber: true, status: true, customerId: true },
        },
      },
    });

    let updated = 0;
    let notified = 0;
    const notifiedLoans = new Set<string>();

    for (const schedule of overdueSchedules) {
      // Update schedule status
      await prisma.loanSchedule.update({
        where: { id: schedule.id },
        data: { status: ScheduleStatus.OVERDUE },
      });
      updated++;

      // Update loan status if not already overdue
      if (schedule.loan.status === LoanStatus.ACTIVE && !notifiedLoans.has(schedule.loan.id)) {
        await prisma.loan.update({
          where: { id: schedule.loan.id },
          data: { status: LoanStatus.OVERDUE },
        });

        const daysOverdue = differenceInDays(today, schedule.dueDate);

        // Send notification
        await notificationService.notifyLoanOverdue(
          schedule.loan.id,
          schedule.loan.loanNumber,
          daysOverdue
        );

        notifiedLoans.add(schedule.loan.id);
        notified++;
      }
    }

    logger.info('Overdue loans processed', { updated, notified });

    return { updated, notified };
  }

  /**
   * Accrue daily interest for fixed deposits
   * Should run daily
   */
  async accrueFixedDepositInterest(): Promise<{ processed: number; totalInterest: number }> {
    return fixedDepositService.accrueInterest();
  }

  /**
   * Process matured fixed deposits
   * Should run daily
   */
  async processMaturedFixedDeposits(): Promise<{ processed: number }> {
    const result = await fixedDepositService.processMaturedDeposits();
    return { processed: result.processed };
  }

  /**
   * Send FD maturity reminders (7 days before)
   * Should run daily
   */
  async sendMaturityReminders(): Promise<{ sent: number }> {
    const reminderDate = addDays(new Date(), 7);
    const startOfReminderDate = startOfDay(reminderDate);
    const endOfReminderDate = new Date(startOfReminderDate);
    endOfReminderDate.setHours(23, 59, 59, 999);

    const maturingFDs = await prisma.fixedDeposit.findMany({
      where: {
        status: FixedDepositStatus.ACTIVE,
        maturityDate: {
          gte: startOfReminderDate,
          lte: endOfReminderDate,
        },
      },
    });

    for (const fd of maturingFDs) {
      await notificationService.notifyFDMaturity(
        fd.id,
        fd.certificateNumber,
        fd.maturityDate
      );
    }

    logger.info('Maturity reminders sent', { count: maturingFDs.length });

    return { sent: maturingFDs.length };
  }

  /**
   * Calculate and post savings interest (monthly)
   * Should run on 1st of each month
   */
  async calculateSavingsInterest(): Promise<{ processed: number; totalInterest: number }> {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    // Get accounts with interest-bearing products
    const accounts = await prisma.savingsAccount.findMany({
      where: {
        status: 'ACTIVE',
        product: { interestRate: { gt: 0 } },
      },
      include: { product: true },
    });

    let processed = 0;
    let totalInterest = 0;

    for (const account of accounts) {
      const monthlyRate = account.product.interestRate.toNumber() / 12 / 100;
      const interest = account.currentBalance.toNumber() * monthlyRate;

      if (interest > 0) {
        // Update accrued interest (actual posting would require journal entry)
        await prisma.savingsAccount.update({
          where: { id: account.id },
          data: {
            interestAccrued: { increment: interest },
            lastInterestDate: new Date(),
          },
        });

        totalInterest += interest;
        processed++;
      }
    }

    logger.info('Savings interest calculated', { processed, totalInterest });

    return { processed, totalInterest: Math.round(totalInterest * 100) / 100 };
  }

  /**
   * Clean up expired sessions
   * Should run daily
   */
  async cleanupExpiredSessions(): Promise<{ deleted: number }> {
    const result = await prisma.userSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } },
        ],
      },
    });

    logger.info('Expired sessions cleaned up', { deleted: result.count });

    return { deleted: result.count };
  }

  /**
   * Generate daily summary report
   * Should run at end of day
   */
  async generateDailySummary(date: Date = new Date()): Promise<{
    loans: { disbursed: number; collected: number; newApplications: number };
    savings: { deposits: number; withdrawals: number };
    fixedDeposits: { created: number; matured: number };
  }> {
    const startOfDate = startOfDay(date);
    const endOfDate = new Date(startOfDate);
    endOfDate.setHours(23, 59, 59, 999);

    const [
      loansDisbursed,
      loansCollected,
      newLoanApplications,
      savingsDeposits,
      savingsWithdrawals,
      fdsCreated,
      fdsMatured,
    ] = await Promise.all([
      prisma.loanDisbursement.aggregate({
        where: { disbursedAt: { gte: startOfDate, lte: endOfDate } },
        _sum: { disbursedAmount: true },
        _count: { id: true },
      }),
      prisma.loanRepayment.aggregate({
        where: { collectedAt: { gte: startOfDate, lte: endOfDate } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.loan.count({
        where: { applicationDate: { gte: startOfDate, lte: endOfDate } },
      }),
      prisma.savingsTransaction.aggregate({
        where: {
          transactionType: 'DEPOSIT',
          processedAt: { gte: startOfDate, lte: endOfDate },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.savingsTransaction.aggregate({
        where: {
          transactionType: 'WITHDRAWAL',
          processedAt: { gte: startOfDate, lte: endOfDate },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.fixedDeposit.count({
        where: { createdAt: { gte: startOfDate, lte: endOfDate } },
      }),
      prisma.fixedDeposit.count({
        where: {
          status: FixedDepositStatus.MATURED,
          updatedAt: { gte: startOfDate, lte: endOfDate },
        },
      }),
    ]);

    const summary = {
      loans: {
        disbursed: loansDisbursed._sum.disbursedAmount?.toNumber() || 0,
        collected: loansCollected._sum.amount?.toNumber() || 0,
        newApplications,
      },
      savings: {
        deposits: savingsDeposits._sum.amount?.toNumber() || 0,
        withdrawals: savingsWithdrawals._sum.amount?.toNumber() || 0,
      },
      fixedDeposits: {
        created: fdsCreated,
        matured: fdsMatured,
      },
    };

    logger.info('Daily summary generated', { date: startOfDate, summary });

    return summary;
  }

  /**
   * Run all daily batch jobs
   */
  async runDailyJobs(): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    try {
      results.overdue = await this.markOverdueLoans();
    } catch (e) {
      results.overdue = { error: (e as Error).message };
    }

    try {
      results.fdInterest = await this.accrueFixedDepositInterest();
    } catch (e) {
      results.fdInterest = { error: (e as Error).message };
    }

    try {
      results.fdMaturity = await this.processMaturedFixedDeposits();
    } catch (e) {
      results.fdMaturity = { error: (e as Error).message };
    }

    try {
      results.reminders = await this.sendMaturityReminders();
    } catch (e) {
      results.reminders = { error: (e as Error).message };
    }

    try {
      results.sessions = await this.cleanupExpiredSessions();
    } catch (e) {
      results.sessions = { error: (e as Error).message };
    }

    try {
      results.summary = await this.generateDailySummary();
    } catch (e) {
      results.summary = { error: (e as Error).message };
    }

    logger.info('Daily batch jobs completed', results);

    return results;
  }
}

export const batchService = new BatchService();
