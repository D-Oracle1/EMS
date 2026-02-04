/**
 * Hylink EMS - HR Routes
 * Staff management, attendance, and performance
 */

import { Router, Request, Response, NextFunction } from 'express';
import { hrService } from '../services/hr.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { logger } from '../lib/logger.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /hr/staff - Create new staff member
 */
router.post(
  '/staff',
  authorize('STAFF:CREATE'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await hrService.createStaff(req.body, req.user!.id);
      res.status(201).json({
        success: true,
        message: 'Staff member created successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /hr/staff/:id - Update staff member
 */
router.put(
  '/staff/:id',
  authorize('STAFF:UPDATE'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await hrService.updateStaff(req.params.id, req.body);
      res.json({
        success: true,
        message: 'Staff member updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /hr/staff/:id/offboard - Offboard staff member
 */
router.post(
  '/staff/:id/offboard',
  authorize('STAFF:DELETE'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { terminationDate, reason } = req.body;
      await hrService.offboardStaff(
        req.params.id,
        new Date(terminationDate),
        reason
      );
      res.json({
        success: true,
        message: 'Staff member offboarded successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /hr/attendance/clock-in - Clock in
 */
router.post(
  '/attendance/clock-in',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ipAddress = req.ip || req.socket.remoteAddress;
      const { location } = req.body;
      const result = await hrService.clockIn(req.user!.id, ipAddress, location);
      res.json({
        success: true,
        message: 'Clocked in successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /hr/attendance/clock-out - Clock out
 */
router.post(
  '/attendance/clock-out',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await hrService.clockOut(req.user!.id);
      res.json({
        success: true,
        message: 'Clocked out successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /hr/attendance/status - Get current attendance status
 */
router.get(
  '/attendance/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await hrService.getAttendanceStatus(req.user!.id);
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
 * GET /hr/attendance - Get attendance records
 */
router.get(
  '/attendance',
  authorize('STAFF:VIEW'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { staffId, startDate, endDate, branchId } = req.query;
      const result = await hrService.getAttendanceRecords({
        staffId: staffId as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        branchId: branchId as string,
      });
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
 * POST /hr/attendance/mark-absent - Mark absentees for a date
 */
router.post(
  '/attendance/mark-absent',
  authorize('STAFF:UPDATE'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { date } = req.body;
      const count = await hrService.markAbsentees(new Date(date || new Date()));
      res.json({
        success: true,
        message: count + ' staff members marked as absent',
        data: { count },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /hr/leave/request - Request leave
 */
router.post(
  '/leave/request',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await hrService.requestLeave({
        ...req.body,
        staffId: req.user!.id,
      });
      res.status(201).json({
        success: true,
        message: 'Leave request submitted',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /hr/leave - Get leave requests
 */
router.get(
  '/leave',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, staffId } = req.query;
      const result = await hrService.getLeaveRequests({
        staffId: (staffId as string) || req.user!.id,
        status: status as string,
      });
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
 * POST /hr/leave/:id/approve - Approve/reject leave
 */
router.post(
  '/leave/:id/approve',
  authorize('STAFF:UPDATE'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { decision, comments } = req.body;
      await hrService.approveLeave(
        req.params.id,
        req.user!.id,
        decision,
        comments
      );
      res.json({
        success: true,
        message: 'Leave ' + decision.toLowerCase(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /hr/performance/review - Create performance review
 */
router.post(
  '/performance/review',
  authorize('STAFF:UPDATE'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await hrService.createPerformanceReview({
        ...req.body,
        reviewerId: req.user!.id,
      });
      res.status(201).json({
        success: true,
        message: 'Performance review created',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /hr/performance/reviews - Get performance reviews
 */
router.get(
  '/performance/reviews',
  authorize('STAFF:VIEW'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { staffId, period } = req.query;
      const result = await hrService.getPerformanceReviews({
        staffId: staffId as string,
        period: period as string,
      });
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
 * GET /hr/dashboard - Get HR dashboard stats
 */
router.get(
  '/dashboard',
  authorize('STAFF:VIEW'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { branchId } = req.query;
      const stats = await hrService.getDashboardStats(branchId as string);
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
