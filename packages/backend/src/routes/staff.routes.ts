import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { prisma } from '../lib/prisma.js';

const router = Router();
router.use(authenticate as any);

router.get('/', requirePermission('HR:STAFF_READ'), asyncHandler(async (req, res) => {
  const staff = await prisma.staff.findMany({
    include: { role: true, department: true, branch: true },
    orderBy: { firstName: 'asc' },
  });
  res.json({ success: true, data: staff });
}));

export default router;
