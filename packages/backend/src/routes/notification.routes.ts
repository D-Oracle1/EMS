/**
 * Hylink EMS - Notification Routes
 * In-app notification management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /notifications - Get user notifications
 */
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { isRead, type, limit } = req.query;
      const notifications = await notificationService.getNotifications(
        {
          userId: req.user!.id,
          isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
          type: type as any,
        },
        parseInt(limit as string) || 50
      );
      res.json({
        success: true,
        data: notifications,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /notifications/unread-count - Get unread count
 */
router.get(
  '/unread-count',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const count = await notificationService.getUnreadCount(req.user!.id);
      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /notifications/:id/read - Mark notification as read
 */
router.post(
  '/:id/read',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await notificationService.markAsRead(req.params.id, req.user!.id);
      res.json({
        success: true,
        message: 'Notification marked as read',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /notifications/read-all - Mark all as read
 */
router.post(
  '/read-all',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const count = await notificationService.markAllAsRead(req.user!.id);
      res.json({
        success: true,
        message: count + ' notifications marked as read',
        data: { count },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
