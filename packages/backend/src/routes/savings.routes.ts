import { Router, Response } from 'express';
import { savingsService } from '../services/savings.service.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();
router.use(authenticate as any);

router.get('/summary', requirePermission('SAVINGS:READ'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const summary = await savingsService.getSavingsSummary(req.query.branchId as string);
  res.json({ success: true, data: summary });
}));

router.get('/', requirePermission('SAVINGS:READ'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await savingsService.getAccounts({}, { page: 1, limit: 50 });
  res.json({ success: true, data: result.data, meta: result.meta });
}));

export default router;
