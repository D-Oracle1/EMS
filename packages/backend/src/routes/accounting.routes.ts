import { Router, Response } from 'express';
import { accountingService } from '../services/accounting.service.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { prisma } from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();
router.use(authenticate as any);

router.get('/chart-of-accounts', requirePermission('ACCOUNTS:REPORTS_VIEW'), asyncHandler(async (req, res) => {
  const accounts = await prisma.chartOfAccounts.findMany({ orderBy: { accountCode: 'asc' } });
  res.json({ success: true, data: accounts });
}));

router.get('/trial-balance', requirePermission('ACCOUNTS:REPORTS_VIEW'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate as string) : new Date();
  const result = await accountingService.generateTrialBalance(asOfDate);
  res.json({ success: true, data: result });
}));

export default router;
