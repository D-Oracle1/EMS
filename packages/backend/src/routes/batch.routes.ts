/**
 * Hylink EMS - Batch Job Routes
 * Manual triggers for batch jobs (typically scheduled via cron)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { batchService } from '../services/batch.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { logger } from '../lib/logger.js';

const router = Router();

// All routes require authentication and admin permissions
router.use(authenticate);

/**
 * POST /batch/overdue - Mark overdue loans
 */
router.post(
  '/overdue',
  authorize('SYSTEM:ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Manual overdue marking triggered', { userId: req.user!.id });
      const result = await batchService.markOverdueLoans();
      res.json({
        success: true,
        message: 'Overdue loans processed',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /batch/fd-interest - Accrue FD interest
 */
router.post(
  '/fd-interest',
  authorize('SYSTEM:ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Manual FD interest accrual triggered', { userId: req.user!.id });
      const result = await batchService.accrueFixedDepositInterest();
      res.json({
        success: true,
        message: 'FD interest accrued',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /batch/fd-maturity - Process matured FDs
 */
router.post(
  '/fd-maturity',
  authorize('SYSTEM:ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Manual FD maturity processing triggered', { userId: req.user!.id });
      const result = await batchService.processMaturedFixedDeposits();
      res.json({
        success: true,
        message: 'Matured FDs processed',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /batch/reminders - Send maturity reminders
 */
router.post(
  '/reminders',
  authorize('SYSTEM:ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Manual maturity reminders triggered', { userId: req.user!.id });
      const result = await batchService.sendMaturityReminders();
      res.json({
        success: true,
        message: 'Maturity reminders sent',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /batch/savings-interest - Calculate savings interest
 */
router.post(
  '/savings-interest',
  authorize('SYSTEM:ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Manual savings interest calculation triggered', { userId: req.user!.id });
      const result = await batchService.calculateSavingsInterest();
      res.json({
        success: true,
        message: 'Savings interest calculated',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /batch/cleanup-sessions - Clean up expired sessions
 */
router.post(
  '/cleanup-sessions',
  authorize('SYSTEM:ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Manual session cleanup triggered', { userId: req.user!.id });
      const result = await batchService.cleanupExpiredSessions();
      res.json({
        success: true,
        message: 'Expired sessions cleaned up',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /batch/daily-summary - Get daily summary
 */
router.get(
  '/daily-summary',
  authorize('ACCOUNTS:REPORTS_VIEW'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { date } = req.query;
      const result = await batchService.generateDailySummary(
        date ? new Date(date as string) : new Date()
      );
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /batch/run-daily - Run all daily jobs
 */
router.post(
  '/run-daily',
  authorize('SYSTEM:ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Manual daily batch run triggered', { userId: req.user!.id });
      const result = await batchService.runDailyJobs();
      res.json({
        success: true,
        message: 'Daily batch jobs completed',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
