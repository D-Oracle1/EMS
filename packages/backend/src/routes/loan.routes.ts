/**
 * Hylink EMS - Loan Routes
 * Complete loan lifecycle with workflow
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { loanService } from '../services/loan.service.js';
import { authenticate, requirePermission, preventSelfApproval } from '../middleware/auth.js';
import { validateBody, validateQuery, asyncHandler } from '../middleware/errorHandler.js';
import { auditEntityChange, auditApproval } from '../middleware/audit.js';
import { AuthenticatedRequest } from '../types/index.js';
import { LoanStatus, ApprovalDecision } from '@prisma/client';

const router = Router();

// All routes require authentication
router.use(authenticate as any);

// Validation schemas
const createLoanSchema = z.object({
  customerId: z.string().uuid(),
  productId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  principalAmount: z.number().positive(),
  tenure: z.number().int().positive(),
  interestRate: z.number().positive().optional(),
  purpose: z.string().optional(),
  collateralDetails: z.string().optional(),
  guarantorDetails: z.string().optional(),
});

const verificationSchema = z.object({
  verificationType: z.enum(['ADDRESS', 'EMPLOYMENT', 'COLLATERAL', 'GUARANTOR', 'COMPREHENSIVE']),
  addressVerified: z.boolean().optional(),
  addressComments: z.string().optional(),
  employmentVerified: z.boolean().optional(),
  employmentComments: z.string().optional(),
  propertyExists: z.boolean().optional(),
  propertyCondition: z.string().optional(),
  estimatedValue: z.number().optional(),
  propertyComments: z.string().optional(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']).optional(),
  recommendation: z.enum(['APPROVE', 'APPROVE_WITH_CONDITIONS', 'DECLINE', 'FURTHER_REVIEW']).optional(),
  findings: z.string().optional(),
  gpsCoordinates: z.string().optional(),
});

const approvalSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'REFERRED_UP', 'RETURNED_FOR_REVIEW']),
  comments: z.string().optional(),
  approvedAmount: z.number().positive().optional(),
});

const disbursementSchema = z.object({
  disbursementMode: z.enum(['BANK_TRANSFER', 'CHEQUE', 'CASH', 'MOBILE_MONEY']),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
  chequeNumber: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

const repaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMode: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'POS', 'DIRECT_DEBIT']),
  paymentReference: z.string().optional(),
  notes: z.string().optional(),
});

const listQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  status: z.string().optional(),
  customerId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  search: z.string().optional(),
  sortBy: z.string().default('applicationDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * POST /api/v1/loans
 * Create new loan application
 * Role: LOAN_OFFICER
 */
router.post(
  '/',
  requirePermission('LOANS:CREATE'),
  validateBody(createLoanSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await loanService.createLoan({
      ...req.body,
      createdById: req.user.id,
    });

    await auditEntityChange(req, 'CREATE', 'LOANS', 'Loan', result.id, `Created loan ${result.loanNumber}`);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Loan application created successfully',
    });
  })
);

/**
 * GET /api/v1/loans
 * List loans with filters
 */
router.get(
  '/',
  requirePermission('LOANS:READ'),
  validateQuery(listQuerySchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, status, customerId, branchId, productId, search, sortBy, sortOrder } = req.query as any;

    const result = await loanService.getLoans(
      {
        status: status ? status.split(',') : undefined,
        customerId,
        branchId,
        productId,
        search,
      },
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
 * GET /api/v1/loans/portfolio
 * Get loan portfolio summary
 */
router.get(
  '/portfolio',
  requirePermission('LOANS:READ'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const branchId = req.query.branchId as string | undefined;
    const summary = await loanService.getPortfolioSummary(branchId);

    res.json({
      success: true,
      data: summary,
    });
  })
);

/**
 * GET /api/v1/loans/:id
 * Get loan by ID
 */
router.get(
  '/:id',
  requirePermission('LOANS:READ'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const loan = await loanService.getLoanById(req.params.id);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found',
      });
    }

    res.json({
      success: true,
      data: loan,
    });
  })
);

/**
 * POST /api/v1/loans/:id/submit-verification
 * Submit loan for verification
 * Role: LOAN_OFFICER (own loans only)
 */
router.post(
  '/:id/submit-verification',
  requirePermission('LOANS:UPDATE'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await loanService.submitForVerification(req.params.id, req.user.id);

    await auditEntityChange(req, 'UPDATE', 'LOANS', 'Loan', req.params.id, 'Submitted for verification');

    res.json({
      success: true,
      message: 'Loan submitted for verification',
    });
  })
);

/**
 * POST /api/v1/loans/:id/verification
 * Submit verification report
 * Role: VERIFICATION_OFFICER
 */
router.post(
  '/:id/verification',
  requirePermission('LOANS:VERIFY'),
  validateBody(verificationSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await loanService.submitVerification({
      loanId: req.params.id,
      officerId: req.user.id,
      ...req.body,
    });

    await auditEntityChange(req, 'CREATE', 'LOANS', 'LoanVerification', result.id, 'Verification report submitted');

    res.status(201).json({
      success: true,
      data: result,
      message: 'Verification report submitted',
    });
  })
);

/**
 * POST /api/v1/loans/:id/submit-approval
 * Submit verified loan for approval
 * Role: LOAN_OFFICER
 */
router.post(
  '/:id/submit-approval',
  requirePermission('LOANS:UPDATE'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await loanService.submitForApproval(req.params.id, req.user.id);

    await auditEntityChange(req, 'UPDATE', 'LOANS', 'Loan', req.params.id, 'Submitted for approval');

    res.json({
      success: true,
      message: 'Loan submitted for approval',
    });
  })
);

/**
 * POST /api/v1/loans/:id/approval
 * Approve or reject loan
 * Role: LOAN_MANAGER, DIRECTOR (based on limits)
 */
router.post(
  '/:id/approval',
  requirePermission('LOANS:APPROVE_L1', 'LOANS:APPROVE_L2'),
  validateBody(approvalSchema),
  // Prevent self-approval
  preventSelfApproval(async (req) => {
    const loan = await loanService.getLoanById(req.params.id);
    return loan?.createdById || '';
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { decision, comments, approvedAmount } = req.body;

    await loanService.processApproval(
      req.params.id,
      req.user.id,
      decision as ApprovalDecision,
      req.user.approvalLimit || 0,
      req.user.roleLevel,
      comments,
      approvedAmount
    );

    await auditApproval(req, 'Loan', req.params.id, decision as any, comments);

    res.json({
      success: true,
      message: `Loan ${decision.toLowerCase()}`,
    });
  })
);

/**
 * POST /api/v1/loans/:id/disburse
 * Disburse approved loan
 * Role: ACCOUNTANT, FINANCE_MANAGER
 */
router.post(
  '/:id/disburse',
  requirePermission('LOANS:DISBURSE'),
  validateBody(disbursementSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await loanService.disburseLoan({
      loanId: req.params.id,
      disbursedById: req.user.id,
      ...req.body,
    });

    await auditEntityChange(req, 'CREATE', 'LOANS', 'LoanDisbursement', result.disbursementId, 'Loan disbursed');

    res.status(201).json({
      success: true,
      data: result,
      message: 'Loan disbursed successfully',
    });
  })
);

/**
 * POST /api/v1/loans/:id/repayment
 * Process loan repayment
 * Role: LOAN_OFFICER, CASHIER
 */
router.post(
  '/:id/repayment',
  requirePermission('LOANS:COLLECT'),
  validateBody(repaymentSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await loanService.processRepayment({
      loanId: req.params.id,
      collectedById: req.user.id,
      ...req.body,
    });

    await auditEntityChange(
      req,
      'CREATE',
      'LOANS',
      'LoanRepayment',
      result.receiptNumber,
      `Repayment of ${req.body.amount} received`
    );

    res.status(201).json({
      success: true,
      data: result,
      message: 'Repayment processed successfully',
    });
  })
);

export default router;
