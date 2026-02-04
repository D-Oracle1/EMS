/**
 * Hylink EMS - Fixed Deposit Routes
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { fixedDepositService } from '../services/fixed-deposit.service.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validateBody, validateQuery, asyncHandler } from '../middleware/errorHandler.js';
import { auditEntityChange, auditFinancialTransaction } from '../middleware/audit.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.use(authenticate as any);

// Validation schemas
const createFDSchema = z.object({
  customerId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  principalAmount: z.number().positive(),
  tenure: z.number().int().positive(), // Days
  interestRate: z.number().positive().optional(),
  fundingMode: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'POS', 'DIRECT_DEBIT']),
  fundingReference: z.string().optional(),
  interestPayment: z.enum(['AT_MATURITY', 'MONTHLY', 'QUARTERLY']).optional(),
  maturityInstruction: z.enum([
    'ROLLOVER_PRINCIPAL_AND_INTEREST',
    'ROLLOVER_PRINCIPAL_ONLY',
    'PAY_OUT',
    'TRANSFER_TO_SAVINGS',
  ]).optional(),
});

const withdrawalSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
  penaltyRate: z.number().min(0).max(100).optional(),
});

const listQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  customerId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().default('startDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * POST /api/v1/fixed-deposits
 * Create new fixed deposit
 */
router.post(
  '/',
  requirePermission('FIXED_DEPOSITS:CREATE'),
  validateBody(createFDSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await fixedDepositService.createFixedDeposit({
      ...req.body,
      createdById: req.user.id,
    });

    await auditEntityChange(
      req,
      'CREATE',
      'FIXED_DEPOSITS',
      'FixedDeposit',
      result.id,
      `Created FD ${result.certificateNumber}`
    );

    res.status(201).json({
      success: true,
      data: result,
      message: 'Fixed deposit created successfully',
    });
  })
);

/**
 * GET /api/v1/fixed-deposits
 * List fixed deposits
 */
router.get(
  '/',
  requirePermission('FIXED_DEPOSITS:READ'),
  validateQuery(listQuerySchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, customerId, branchId, status, search, sortBy, sortOrder } = req.query as any;

    const result = await fixedDepositService.getFixedDeposits(
      { customerId, branchId, status, search },
      { page, limit, sortBy, sortOrder }
    );

    res.json({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  })
);

/**
 * GET /api/v1/fixed-deposits/summary
 * Get FD summary
 */
router.get(
  '/summary',
  requirePermission('FIXED_DEPOSITS:READ'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const branchId = req.query.branchId as string | undefined;
    const summary = await fixedDepositService.getFixedDepositSummary(branchId);

    res.json({
      success: true,
      data: summary,
    });
  })
);

/**
 * GET /api/v1/fixed-deposits/:id
 * Get FD by ID
 */
router.get(
  '/:id',
  requirePermission('FIXED_DEPOSITS:READ'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const fd = await fixedDepositService.getFixedDepositById(req.params.id);

    if (!fd) {
      return res.status(404).json({
        success: false,
        message: 'Fixed deposit not found',
      });
    }

    res.json({
      success: true,
      data: fd,
    });
  })
);

/**
 * POST /api/v1/fixed-deposits/:id/withdraw
 * Premature withdrawal
 */
router.post(
  '/:id/withdraw',
  requirePermission('FIXED_DEPOSITS:LIQUIDATE'),
  validateBody(withdrawalSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { reason, penaltyRate } = req.body;

    const result = await fixedDepositService.processWithdrawal(
      req.params.id,
      reason,
      req.user.id,
      penaltyRate
    );

    await auditFinancialTransaction(req, 'FD_WITHDRAWAL', {
      amount: result.netAmount,
      reference: req.params.id,
      description: `FD premature withdrawal: ${reason}`,
    });

    res.json({
      success: true,
      data: result,
      message: 'Fixed deposit withdrawn successfully',
    });
  })
);

/**
 * POST /api/v1/fixed-deposits/accrue-interest
 * Run interest accrual (batch job endpoint)
 */
router.post(
  '/accrue-interest',
  requirePermission('ACCOUNTS:JOURNAL_POST'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await fixedDepositService.accrueInterest();

    res.json({
      success: true,
      data: result,
      message: `Accrued interest for ${result.processed} fixed deposits`,
    });
  })
);

/**
 * POST /api/v1/fixed-deposits/process-matured
 * Process matured FDs (batch job endpoint)
 */
router.post(
  '/process-matured',
  requirePermission('ACCOUNTS:JOURNAL_POST'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await fixedDepositService.processMaturedDeposits();

    res.json({
      success: true,
      data: result,
      message: `Processed ${result.processed} matured fixed deposits`,
    });
  })
);

export default router;
