import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { prisma } from '../lib/prisma.js';

const router = Router();
router.use(authenticate as any);

router.get('/', requirePermission('CUSTOMERS:READ'), asyncHandler(async (req, res) => {
  const { search, limit = '50' } = req.query;
  const where: any = {};
  if (search) {
    where.OR = [
      { firstName: { contains: String(search), mode: 'insensitive' } },
      { lastName: { contains: String(search), mode: 'insensitive' } },
      { customerNumber: { contains: String(search), mode: 'insensitive' } },
      { phone: { contains: String(search) } },
    ];
  }
  const customers = await prisma.customer.findMany({ where, take: parseInt(String(limit)), orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: customers });
}));

router.get('/:id', requirePermission('CUSTOMERS:READ'), asyncHandler(async (req, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  res.json({ success: true, data: customer });
}));

export default router;
