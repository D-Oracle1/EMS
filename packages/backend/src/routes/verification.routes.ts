/**
 * Hylink EMS - Verification Routes
 * Field verification task management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { verificationService } from '../services/verification.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { logger } from '../lib/logger.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /verification/tasks - Get verification task queue
 */
router.get(
  '/tasks',
  authorize('VERIFICATION:VIEW'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, taskType, priority, assigneeId, page, limit } = req.query;
      const result = await verificationService.getTaskQueue(
        {
          status: status as string,
          taskType: taskType as string,
          priority: priority as string,
          assigneeId: assigneeId as string,
        },
        {
          page: parseInt(page as string) || 1,
          limit: parseInt(limit as string) || 20,
        }
      );
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /verification/tasks/my - Get my assigned tasks
 */
router.get(
  '/tasks/my',
  authorize('VERIFICATION:VIEW'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, page, limit } = req.query;
      const result = await verificationService.getTaskQueue(
        {
          assigneeId: req.user!.id,
          status: status as string,
        },
        {
          page: parseInt(page as string) || 1,
          limit: parseInt(limit as string) || 20,
        }
      );
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /verification/tasks/:id - Get task details
 */
router.get(
  '/tasks/:id',
  authorize('VERIFICATION:VIEW'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await verificationService.getTaskById(req.params.id);
      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /verification/tasks - Create verification task
 */
router.post(
  '/tasks',
  authorize('VERIFICATION:CREATE'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await verificationService.createTask({
        ...req.body,
        createdById: req.user!.id,
      });
      res.status(201).json({
        success: true,
        message: 'Verification task created',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /verification/tasks/:id/start - Start verification
 */
router.post(
  '/tasks/:id/start',
  authorize('VERIFICATION:CONDUCT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await verificationService.startVerification(req.params.id, req.user!.id);
      res.json({
        success: true,
        message: 'Verification started',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /verification/tasks/:id/submit - Submit verification results
 */
router.post(
  '/tasks/:id/submit',
  authorize('VERIFICATION:CONDUCT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await verificationService.submitVerification({
        taskId: req.params.id,
        officerId: req.user!.id,
        ...req.body,
      });
      res.json({
        success: true,
        message: 'Verification submitted',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /verification/tasks/:id/reassign - Reassign task
 */
router.post(
  '/tasks/:id/reassign',
  authorize('VERIFICATION:ASSIGN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { newAssigneeId, reason } = req.body;
      await verificationService.reassignTask(
        req.params.id,
        newAssigneeId,
        reason
      );
      res.json({
        success: true,
        message: 'Task reassigned successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /verification/tasks/:id/cancel - Cancel task
 */
router.post(
  '/tasks/:id/cancel',
  authorize('VERIFICATION:ASSIGN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body;
      await verificationService.cancelTask(req.params.id, reason);
      res.json({
        success: true,
        message: 'Task cancelled',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /verification/stats - Get verification statistics
 */
router.get(
  '/stats',
  authorize('VERIFICATION:VIEW'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { officerId } = req.query;
      const stats = await verificationService.getStats(officerId as string);
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /verification/stats/my - Get my verification stats
 */
router.get(
  '/stats/my',
  authorize('VERIFICATION:VIEW'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await verificationService.getStats(req.user!.id);
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
