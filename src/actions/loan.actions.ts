'use server';

import { LoanStatus, ScheduleStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma, withTransaction } from '@/lib/prisma';
import { requirePermission, requireAnyPermission, getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import {
  generateReference,
  calculateReducingBalanceSchedule,
  calculateFlatRateSchedule,
} from '@/lib/utils';
import { createJournalEntry, getAccountByCode } from '@/lib/accounting-engine';
import { createNotification, createNotificationForUsers, getUsersWithPermission, getUsersWithAnyPermission } from '@/lib/notifications';
import { recordApprovalHistory } from '@/lib/approval-history';
import type { ActionResult } from '@/types';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// GL Account codes
const LOAN_GL = {
  LOANS_RECEIVABLE: '1310',
  CASH_BANK: '1120',
  INTEREST_INCOME: '4110',
  FEE_INCOME: '4210',
};

export async function getLoans(filters?: {
  status?: string[];
  customerId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { user } = await getSession();
  if (!user.permissions.includes('LOANS:READ') && !user.permissions.includes('LOANS:CREATE')) {
    throw new Error('Permission denied');
  }

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  // Loan Officers (LOANS:CREATE without LOANS:MANAGE_ALL) only see their own loans
  const isLoanOfficerOnly =
    user.permissions.includes('LOANS:CREATE') &&
    !user.permissions.includes('LOANS:MANAGE_ALL');

  const where: Record<string, unknown> = {};
  if (isLoanOfficerOnly) where.createdById = user.id;
  if (filters?.status?.length) where.status = { in: filters.status };
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.search) {
    where.OR = [
      { loanNumber: { contains: filters.search, mode: 'insensitive' } },
      { customer: { firstName: { contains: filters.search, mode: 'insensitive' } } },
      { customer: { lastName: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.loan.findMany({
      where: where as any,
      include: {
        customer: { select: { customerNumber: true, firstName: true, lastName: true } },
        product: { select: { name: true, code: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.loan.count({ where: where as any }),
  ]);

  return {
    data: data.map((l) => ({
      ...l,
      principalAmount: l.principalAmount.toNumber(),
      interestRate: l.interestRate.toNumber(),
      totalRepayment: l.totalRepayment.toNumber(),
      monthlyInstalment: l.monthlyInstalment.toNumber(),
      totalInterest: l.totalInterest.toNumber(),
      processingFee: l.processingFee.toNumber(),
      insuranceFee: l.insuranceFee.toNumber(),
      totalFees: l.totalFees.toNumber(),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getLoan(id: string) {
  const { user } = await getSession();
  if (!user.permissions.includes('LOANS:READ') && !user.permissions.includes('LOANS:CREATE')) {
    throw new Error('Permission denied');
  }

  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      customer: true,
      product: true,
      createdBy: { select: { firstName: true, lastName: true, employeeId: true } },
      verificationOfficer: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      verifications: {
        include: { officer: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      },
      approvals: {
        include: { approver: { select: { firstName: true, lastName: true, role: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
      },
      disbursement: {
        include: { disbursedBy: { select: { firstName: true, lastName: true } } },
      },
      schedule: { orderBy: { installmentNumber: 'asc' } },
      repayments: { orderBy: { collectedAt: 'desc' } },
      restructurings: {
        include: {
          requestedBy: { select: { firstName: true, lastName: true } },
          approvedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!loan) throw new Error('Loan not found');

  // Loan Officers can only view loans they created
  const isLoanOfficerOnly =
    user.permissions.includes('LOANS:CREATE') &&
    !user.permissions.includes('LOANS:MANAGE_ALL');
  if (isLoanOfficerOnly && loan.createdById !== user.id) {
    throw new Error('Access denied: you can only view loans you created');
  }

  return {
    ...loan,
    principalAmount: loan.principalAmount.toNumber(),
    interestRate: loan.interestRate.toNumber(),
    totalRepayment: loan.totalRepayment.toNumber(),
    monthlyInstalment: loan.monthlyInstalment.toNumber(),
    totalInterest: loan.totalInterest.toNumber(),
    processingFee: loan.processingFee.toNumber(),
    insuranceFee: loan.insuranceFee.toNumber(),
    totalFees: loan.totalFees.toNumber(),
    customer: {
      ...loan.customer,
      monthlyIncome: loan.customer.monthlyIncome?.toNumber() || 0,
    },
    product: {
      ...loan.product,
      minAmount: loan.product.minAmount.toNumber(),
      maxAmount: loan.product.maxAmount.toNumber(),
      interestRate: loan.product.interestRate.toNumber(),
      processingFee: loan.product.processingFee.toNumber(),
      insuranceFee: loan.product.insuranceFee?.toNumber() ?? null,
      lateFee: loan.product.lateFee?.toNumber() ?? null,
      penaltyRate: loan.product.penaltyRate?.toNumber() ?? null,
    },
    disbursement: loan.disbursement ? {
      ...loan.disbursement,
      disbursedAmount: loan.disbursement.disbursedAmount.toNumber(),
    } : null,
    schedule: loan.schedule.map((s) => ({
      ...s,
      principalDue: s.principalDue.toNumber(),
      interestDue: s.interestDue.toNumber(),
      totalDue: s.totalDue.toNumber(),
      principalPaid: s.principalPaid.toNumber(),
      interestPaid: s.interestPaid.toNumber(),
      totalPaid: s.totalPaid.toNumber(),
      outstandingBalance: s.outstandingBalance.toNumber(),
    })),
    repayments: loan.repayments.map((r) => ({
      ...r,
      amount: r.amount.toNumber(),
      principalPortion: r.principalPortion.toNumber(),
      interestPortion: r.interestPortion.toNumber(),
    })),
    verifications: loan.verifications.map((v) => ({
      ...v,
      estimatedValue: v.estimatedValue?.toNumber() || 0,
    })),
    approvals: loan.approvals.map((a) => ({
      ...a,
      approvedAmount: a.approvedAmount?.toNumber() || 0,
    })),
    restructurings: loan.restructurings.map((r) => ({
      ...r,
      previousInterestRate: r.previousInterestRate.toNumber(),
      previousOutstandingBalance: r.previousOutstandingBalance.toNumber(),
      newInterestRate: r.newInterestRate?.toNumber() ?? null,
      writeOffAmount: r.writeOffAmount?.toNumber() ?? null,
      effectiveBalance: r.effectiveBalance.toNumber(),
    })),
  };
}

/**
 * Check if a customer has outstanding (ACTIVE/OVERDUE) loans
 */
export async function checkCustomerOutstandingLoans(customerId: string) {
  await requirePermission('LOANS:READ');

  const loans = await prisma.loan.findMany({
    where: {
      customerId,
      status: { in: ['ACTIVE', 'OVERDUE'] },
      isDeleted: false,
    },
    select: {
      id: true,
      loanNumber: true,
      principalAmount: true,
      status: true,
      disbursedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    hasOutstanding: loans.length > 0,
    loans: loans.map((l) => ({
      id: l.id,
      loanNumber: l.loanNumber,
      principalAmount: l.principalAmount.toNumber(),
      status: l.status,
      disbursedAt: l.disbursedAt,
    })),
  };
}

/**
 * Create loan application - LOAN_OFFICER only
 * State: → DRAFT
 */
export async function createLoan(data: {
  customerId: string;
  productId: string;
  principalAmount: number;
  tenure: number;
  interestRate?: number;
  purpose?: string;
  collateralDetails?: string;
  guarantorDetails?: string;
  branchId?: string;
  owingBypass?: boolean;
  owingBypassReason?: string;
}): Promise<ActionResult<{ id: string; loanNumber: string }>> {
  try {
    const user = await requirePermission('LOANS:CREATE');

    // Validate customer
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer || customer.status !== 'ACTIVE') {
      return { success: false, error: 'Customer not found or not active' };
    }

    // Check for outstanding loans
    const outstandingLoans = await prisma.loan.findMany({
      where: {
        customerId: data.customerId,
        status: { in: ['ACTIVE', 'OVERDUE'] },
        isDeleted: false,
      },
      select: { id: true },
    });

    if (outstandingLoans.length > 0 && !data.owingBypass) {
      return {
        success: false,
        error: 'Customer has outstanding loans. Use the bypass option with justification.',
      };
    }

    if (data.owingBypass && (!data.owingBypassReason || data.owingBypassReason.trim().length < 10)) {
      return {
        success: false,
        error: 'Owing bypass requires a justification reason (at least 10 characters).',
      };
    }

    const outstandingLoanIds = outstandingLoans.map((l) => l.id);

    // Validate product
    const product = await prisma.loanProduct.findUnique({ where: { id: data.productId } });
    if (!product || !product.isActive) {
      return { success: false, error: 'Loan product not found or inactive' };
    }

    // Validate amount/tenure against product limits
    if (data.principalAmount < product.minAmount.toNumber() || data.principalAmount > product.maxAmount.toNumber()) {
      return { success: false, error: `Amount must be between ${product.minAmount} and ${product.maxAmount}` };
    }
    if (data.tenure < product.minTenure || data.tenure > product.maxTenure) {
      return { success: false, error: `Tenure must be between ${product.minTenure} and ${product.maxTenure} months` };
    }

    const finalRate = data.interestRate ?? product.interestRate.toNumber();
    const startDate = new Date();

    // Calculate schedule
    const scheduleCalc = product.interestType === 'REDUCING_BALANCE'
      ? calculateReducingBalanceSchedule(data.principalAmount, finalRate, data.tenure, startDate)
      : calculateFlatRateSchedule(data.principalAmount, finalRate, data.tenure, startDate);

    // Calculate fees
    const processingFee = new Decimal(data.principalAmount).times(product.processingFee).div(100).toDecimalPlaces(2).toNumber();
    const insuranceFee = product.insuranceFee
      ? new Decimal(data.principalAmount).times(product.insuranceFee).div(100).toDecimalPlaces(2).toNumber()
      : 0;
    const totalFees = processingFee + insuranceFee;

    const loanNumber = await generateReference('LOAN');

    const loan = await withTransaction(async (tx) => {
      const newLoan = await tx.loan.create({
        data: {
          loanNumber,
          customerId: data.customerId,
          productId: data.productId,
          branchId: data.branchId || user.branchId,
          principalAmount: data.principalAmount,
          interestRate: finalRate,
          tenure: data.tenure,
          processingFee,
          insuranceFee,
          totalFees,
          totalInterest: scheduleCalc.totalInterest,
          totalRepayment: scheduleCalc.totalRepayment,
          monthlyInstalment: scheduleCalc.monthlyInstalment,
          purpose: data.purpose,
          collateralDetails: data.collateralDetails,
          guarantorDetails: data.guarantorDetails,
          owingBypass: data.owingBypass || false,
          owingBypassReason: data.owingBypass ? data.owingBypassReason : undefined,
          owingBypassLoanIds: data.owingBypass ? outstandingLoanIds : [],
          status: LoanStatus.DRAFT,
          createdById: user.id,
        },
      });

      // Create schedule
      for (const item of scheduleCalc.schedule) {
        await tx.loanSchedule.create({
          data: {
            loanId: newLoan.id,
            installmentNumber: item.installmentNumber,
            dueDate: item.dueDate,
            principalDue: item.principalDue,
            interestDue: item.interestDue,
            totalDue: item.totalDue,
            outstandingBalance: item.outstandingBalance,
            status: ScheduleStatus.PENDING,
          },
        });
      }

      return newLoan;
    });

    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: 'CREATE', module: 'LOANS', entityType: 'LOAN', entityId: loan.id,
      description: `Created loan ${loanNumber} for ${customer.firstName} ${customer.lastName} - ${data.principalAmount}`,
    });

    await recordApprovalHistory({
      entityType: 'LOAN', entityId: loan.id, workflowStep: 'CREATION', stepOrder: 1,
      action: 'SUBMITTED', actorId: user.id, actorRole: user.roleCode,
      previousStatus: '', newStatus: 'DRAFT',
    });

    return { success: true, message: `Loan ${loanNumber} created`, data: { id: loan.id, loanNumber } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Submit for verification - LOAN_OFFICER
 * State: DRAFT → PENDING_VERIFICATION
 * Creates a VerificationTask and assigns it to the selected verification officer
 */
export async function submitForVerification(loanId: string, verificationOfficerId: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('LOANS:CREATE');

    if (!verificationOfficerId) return { success: false, error: 'Please select a verification officer' };

    // Validate the verification officer
    const officer = await prisma.staff.findFirst({
      where: {
        id: verificationOfficerId,
        status: 'ACTIVE',
        isDeleted: false,
        role: { permissions: { some: { permission: { code: 'LOANS:VERIFY' } } } },
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!officer) return { success: false, error: 'Invalid verification officer selected' };

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, address: true, city: true } },
      },
    });
    if (!loan) return { success: false, error: 'Loan not found' };
    if (loan.status !== 'DRAFT') return { success: false, error: `Cannot submit loan with status ${loan.status}` };

    await withTransaction(async (tx) => {
      // Update loan status and assign verification officer
      await tx.loan.update({
        where: { id: loanId },
        data: {
          status: LoanStatus.PENDING_VERIFICATION,
          verificationOfficerId,
        },
      });

      // Auto-create verification task assigned to the selected officer
      await tx.verificationTask.create({
        data: {
          taskType: 'ADDRESS_VERIFICATION',
          referenceType: 'LOAN',
          referenceId: loanId,
          loanId: loanId,
          customerId: loan.customerId,
          createdById: user.id,
          assignedToId: verificationOfficerId,
          priority: 'NORMAL',
          address: loan.customer?.address || 'Address not provided',
          city: loan.customer?.city,
          instructions: `Verify customer ${loan.customer?.firstName} ${loan.customer?.lastName} for loan application ${loan.loanNumber}. Verify address, employment, income documentation, and collateral where applicable.`,
          status: 'ASSIGNED',
        },
      });
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'LOANS', entityType: 'LOAN', entityId: loanId,
      description: `Submitted loan ${loan.loanNumber} for verification, assigned to ${officer.firstName} ${officer.lastName}`,
    });

    await recordApprovalHistory({
      entityType: 'LOAN', entityId: loanId, workflowStep: 'SUBMIT_FOR_VERIFICATION', stepOrder: 2,
      action: 'SUBMITTED', actorId: user.id, actorRole: user.roleCode,
      previousStatus: 'DRAFT', newStatus: 'PENDING_VERIFICATION',
      comments: `Assigned to ${officer.firstName} ${officer.lastName}`,
    });

    // Notify only the assigned verification officer
    await createNotification({
      userId: verificationOfficerId,
      type: 'TASK_ASSIGNED',
      title: 'New Verification Task Assigned',
      message: `Loan ${loan.loanNumber} for ${loan.customer?.firstName} ${loan.customer?.lastName} has been assigned to you for verification`,
      entityType: 'VERIFICATION_TASK',
      entityId: loanId,
      actionUrl: '/verification',
    });

    return { success: true, message: 'Loan submitted for verification' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get list of active verification officers (staff with LOANS:VERIFY permission)
 */
export async function getVerificationOfficers(): Promise<Array<{ id: string; firstName: string; lastName: string; employeeId: string }>> {
  await requirePermission('LOANS:CREATE');

  return prisma.staff.findMany({
    where: {
      status: 'ACTIVE',
      isDeleted: false,
      role: { permissions: { some: { permission: { code: 'LOANS:VERIFY' } } } },
    },
    select: { id: true, firstName: true, lastName: true, employeeId: true },
    orderBy: { firstName: 'asc' },
  });
}

/**
 * Submit verification result - VERIFICATION_OFFICER
 * State: PENDING_VERIFICATION → VERIFIED (or stays if rejected)
 */
export async function submitVerification(data: {
  loanId: string;
  verificationType: string;
  addressVerified?: boolean;
  addressComments?: string;
  employmentVerified?: boolean;
  employmentComments?: string;
  riskLevel?: string;
  recommendation: string;
  findings?: string;
  gpsCoordinates?: string;
}): Promise<ActionResult> {
  try {
    const user = await requirePermission('LOANS:VERIFY');

    const loan = await prisma.loan.findUnique({ where: { id: data.loanId } });
    if (!loan) return { success: false, error: 'Loan not found' };
    if (loan.status !== 'PENDING_VERIFICATION' && loan.status !== 'VERIFICATION_IN_PROGRESS') {
      return { success: false, error: `Cannot verify loan with status ${loan.status}` };
    }
    // Only the assigned verification officer can verify this loan
    if (loan.verificationOfficerId && loan.verificationOfficerId !== user.id) {
      return { success: false, error: 'You are not assigned to verify this loan' };
    }

    await withTransaction(async (tx) => {
      await tx.loanVerification.create({
        data: {
          loanId: data.loanId,
          officerId: user.id,
          verificationType: data.verificationType as any,
          addressVerified: data.addressVerified,
          addressComments: data.addressComments,
          employmentVerified: data.employmentVerified,
          employmentComments: data.employmentComments,
          riskLevel: data.riskLevel as any,
          recommendation: data.recommendation as any,
          findings: data.findings,
          gpsCoordinates: data.gpsCoordinates,
          status: 'COMPLETED',
          submittedAt: new Date(),
        },
      });

      // Update loan status based on recommendation
      const newStatus = data.recommendation === 'DECLINE'
        ? LoanStatus.REJECTED
        : LoanStatus.VERIFIED;

      await tx.loan.update({
        where: { id: data.loanId },
        data: { status: newStatus },
      });
    });

    const verificationNewStatus = data.recommendation === 'DECLINE' ? 'REJECTED' : 'VERIFIED';

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'LOANS', entityType: 'LOAN', entityId: data.loanId,
      description: `Verification completed for loan ${loan.loanNumber}: ${data.recommendation}`,
    });

    await recordApprovalHistory({
      entityType: 'LOAN', entityId: data.loanId, workflowStep: 'VERIFICATION', stepOrder: 3,
      action: data.recommendation === 'DECLINE' ? 'REJECTED' : 'APPROVED',
      actorId: user.id, actorRole: user.roleCode,
      previousStatus: loan.status, newStatus: verificationNewStatus,
      comments: data.findings || data.recommendation,
    });

    // Notify the loan officer who created the loan
    await createNotification({
      userId: loan.createdById,
      type: data.recommendation === 'DECLINE' ? 'WARNING' : 'INFO',
      title: `Verification ${data.recommendation === 'DECLINE' ? 'Failed' : 'Completed'}`,
      message: `Verification for loan ${loan.loanNumber}: ${data.recommendation.replace(/_/g, ' ')}`,
      entityType: 'LOAN',
      entityId: data.loanId,
      actionUrl: `/loans/${data.loanId}`,
    });

    return { success: true, message: 'Verification submitted' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Submit for approval - LOAN_OFFICER
 * State: VERIFIED → PENDING_APPROVAL
 */
export async function submitForApproval(loanId: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('LOANS:CREATE');

    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) return { success: false, error: 'Loan not found' };
    if (loan.status !== 'VERIFIED') return { success: false, error: `Cannot submit for approval with status ${loan.status}` };

    await prisma.loan.update({
      where: { id: loanId },
      data: { status: LoanStatus.PENDING_APPROVAL },
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'LOANS', entityType: 'LOAN', entityId: loanId,
      description: `Submitted loan ${loan.loanNumber} for approval`,
    });

    await recordApprovalHistory({
      entityType: 'LOAN', entityId: loanId, workflowStep: 'SUBMIT_FOR_APPROVAL', stepOrder: 4,
      action: 'SUBMITTED', actorId: user.id, actorRole: user.roleCode,
      previousStatus: 'VERIFIED', newStatus: 'PENDING_APPROVAL',
    });

    // Notify approvers (managers/directors)
    const approverIds = await getUsersWithAnyPermission(['LOANS:APPROVE_L1', 'LOANS:APPROVE_L2']);
    await createNotificationForUsers(
      approverIds.filter((id) => id !== user.id),
      {
        type: 'APPROVAL_REQUIRED',
        title: 'Loan Pending Approval',
        message: `Loan ${loan.loanNumber} is awaiting your approval`,
        entityType: 'LOAN',
        entityId: loanId,
        actionUrl: `/loans/${loanId}`,
      }
    );

    return { success: true, message: 'Loan submitted for approval' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Process approval - MANAGER/DIRECTOR (not same as creator)
 * State: PENDING_APPROVAL → APPROVED or REJECTED
 */
export async function processApproval(data: {
  loanId: string;
  decision: 'APPROVED' | 'REJECTED';
  comments?: string;
  conditions?: string;
  approvedAmount?: number;
}): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['LOANS:APPROVE_L1', 'LOANS:APPROVE_L2']);

    const loan = await prisma.loan.findUnique({ where: { id: data.loanId } });
    if (!loan) return { success: false, error: 'Loan not found' };
    if (loan.status !== 'PENDING_APPROVAL') return { success: false, error: `Cannot approve loan with status ${loan.status}` };

    // Segregation of duties: creator cannot approve
    if (loan.createdById === user.id) {
      return { success: false, error: 'You cannot approve a loan you created' };
    }

    // Check approval limit
    if (data.decision === 'APPROVED' && user.approvalLimit > 0) {
      if (loan.principalAmount.toNumber() > user.approvalLimit) {
        return { success: false, error: `Loan amount exceeds your approval limit of ${user.approvalLimit}` };
      }
    }

    await withTransaction(async (tx) => {
      await tx.loanApproval.create({
        data: {
          loanId: data.loanId,
          approverId: user.id,
          level: user.roleLevel >= 90 ? 2 : 1,
          decision: data.decision as any,
          comments: data.comments,
          conditions: data.conditions,
          approvedAmount: data.approvedAmount || loan.principalAmount.toNumber(),
        },
      });

      // APPROVED → PENDING_DISBURSEMENT (proper workflow step)
      const newStatus = data.decision === 'APPROVED'
        ? LoanStatus.PENDING_DISBURSEMENT
        : LoanStatus.REJECTED;

      await tx.loan.update({
        where: { id: data.loanId },
        data: {
          status: newStatus,
          approvedAt: data.decision === 'APPROVED' ? new Date() : undefined,
          rejectionReason: data.decision === 'REJECTED' ? data.comments : undefined,
        },
      });
    });

    const approvalNewStatus = data.decision === 'APPROVED' ? 'PENDING_DISBURSEMENT' : 'REJECTED';

    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: data.decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
      module: 'LOANS', entityType: 'LOAN', entityId: data.loanId,
      description: `Loan ${loan.loanNumber} ${data.decision.toLowerCase()} by ${user.firstName} ${user.lastName}`,
    });

    await recordApprovalHistory({
      entityType: 'LOAN', entityId: data.loanId, workflowStep: 'APPROVAL', stepOrder: 5,
      action: data.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      actorId: user.id, actorRole: user.roleCode,
      previousStatus: 'PENDING_APPROVAL', newStatus: approvalNewStatus,
      comments: data.comments, conditions: data.conditions,
    });

    // Notify the loan officer who created the loan
    await createNotification({
      userId: loan.createdById,
      type: data.decision === 'APPROVED' ? 'INFO' : 'WARNING',
      title: `Loan ${data.decision === 'APPROVED' ? 'Approved' : 'Rejected'}`,
      message: `Loan ${loan.loanNumber} has been ${data.decision.toLowerCase()}${data.comments ? ': ' + data.comments : ''}`,
      entityType: 'LOAN',
      entityId: data.loanId,
      actionUrl: `/loans/${data.loanId}`,
    });

    return { success: true, message: `Loan ${data.decision.toLowerCase()}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Disburse loan - ACCOUNTS_OFFICER
 * State: APPROVED → ACTIVE
 * Posts GL: Dr Loans Receivable, Cr Cash/Bank
 */
export async function disburseLoan(data: {
  loanId: string;
  disbursementMode: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  chequeNumber?: string;
  reference?: string;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const user = await requirePermission('LOANS:DISBURSE');

    const loan = await prisma.loan.findUnique({
      where: { id: data.loanId },
      include: {
        customer: true,
        product: true,
        approvals: {
          where: { decision: 'APPROVED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!loan) return { success: false, error: 'Loan not found' };
    if (loan.status !== 'PENDING_DISBURSEMENT' && loan.status !== 'APPROVED') {
      return { success: false, error: `Cannot disburse loan with status ${loan.status}` };
    }

    // Segregation of duties: creator cannot disburse their own loan
    if (loan.createdById === user.id) {
      return { success: false, error: 'You cannot disburse a loan you created (segregation of duties)' };
    }

    // Get GL accounts
    const loansReceivable = await getAccountByCode(LOAN_GL.LOANS_RECEIVABLE);
    const cashBank = await getAccountByCode(LOAN_GL.CASH_BANK);
    const feeIncome = await getAccountByCode(LOAN_GL.FEE_INCOME);

    if (!loansReceivable || !cashBank) {
      return { success: false, error: 'GL accounts not configured properly' };
    }

    // Use the approved amount from the latest approval, not the original requested amount
    const latestApproval = loan.approvals[0];
    const disbursedAmount = latestApproval?.approvedAmount
      ? latestApproval.approvedAmount.toNumber()
      : loan.principalAmount.toNumber();
    const netDisbursement = new Decimal(disbursedAmount).minus(loan.totalFees.toNumber()).toNumber();
    const firstRepaymentDate = new Date();
    firstRepaymentDate.setMonth(firstRepaymentDate.getMonth() + 1);
    const maturityDate = new Date();
    maturityDate.setMonth(maturityDate.getMonth() + loan.tenure);

    await withTransaction(async (tx) => {
      // Create disbursement record
      await tx.loanDisbursement.create({
        data: {
          loanId: data.loanId,
          disbursedAmount,
          disbursementMode: data.disbursementMode as any,
          bankName: data.bankName,
          accountNumber: data.accountNumber,
          accountName: data.accountName,
          chequeNumber: data.chequeNumber,
          reference: data.reference,
          notes: data.notes,
          disbursedById: user.id,
        },
      });

      // Update loan status
      await tx.loan.update({
        where: { id: data.loanId },
        data: {
          status: LoanStatus.ACTIVE,
          disbursedAt: new Date(),
          firstRepaymentDate,
          maturityDate,
        },
      });
    });

    // Post GL journal entry: Dr Loans Receivable, Cr Cash/Bank [+ Cr Fee Income]
    // If feeIncome account is not available, credit Cash for the full disbursedAmount
    // to keep the entry balanced (prevents unbalanced-entry error after DB commit).
    const hasFees = loan.totalFees.toNumber() > 0 && feeIncome !== null;
    const cashCredit = hasFees ? netDisbursement : disbursedAmount;

    const journalLines = [
      {
        accountId: loansReceivable.id,
        debitAmount: disbursedAmount,
        creditAmount: 0,
        description: `Loan disbursement - ${loan.loanNumber}`,
        customerId: loan.customerId,
        referenceType: 'LOAN',
        referenceId: loan.id,
      },
      {
        accountId: cashBank.id,
        debitAmount: 0,
        creditAmount: cashCredit,
        description: `Cash disbursement - ${loan.loanNumber}`,
      },
    ];

    // Fee income entry if fees exist and the GL account is configured
    if (hasFees && feeIncome) {
      journalLines.push({
        accountId: feeIncome.id,
        debitAmount: 0,
        creditAmount: loan.totalFees.toNumber(),
        description: `Processing fees - ${loan.loanNumber}`,
        customerId: loan.customerId,
        referenceType: 'LOAN',
        referenceId: loan.id,
      });
    }

    await createJournalEntry({
      entryDate: new Date(),
      description: `Loan disbursement: ${loan.loanNumber} to ${loan.customer.firstName} ${loan.customer.lastName}`,
      sourceModule: 'LOANS',
      sourceType: 'DISBURSEMENT',
      sourceId: loan.id,
      loanId: loan.id,
      branchId: loan.branchId || undefined,
      lines: journalLines,
      createdById: user.id,
      autoPost: true,
    });

    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: 'UPDATE', module: 'LOANS', entityType: 'LOAN', entityId: data.loanId,
      description: `Disbursed loan ${loan.loanNumber}: ${disbursedAmount} via ${data.disbursementMode}`,
    });

    await recordApprovalHistory({
      entityType: 'LOAN', entityId: data.loanId, workflowStep: 'DISBURSEMENT', stepOrder: 6,
      action: 'APPROVED', actorId: user.id, actorRole: user.roleCode,
      previousStatus: loan.status, newStatus: 'ACTIVE',
      comments: `Disbursed ${disbursedAmount} via ${data.disbursementMode}`,
    });

    // Notify the loan officer who created the loan
    await createNotification({
      userId: loan.createdById,
      type: 'PAYMENT_RECEIVED',
      title: 'Loan Disbursed',
      message: `Loan ${loan.loanNumber} has been disbursed (${data.disbursementMode.replace(/_/g, ' ')})`,
      entityType: 'LOAN',
      entityId: data.loanId,
      actionUrl: `/loans/${data.loanId}`,
    });

    return { success: true, message: `Loan disbursed: ${disbursedAmount}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Process repayment - FIFO allocation
 * Posts GL: Dr Cash/Bank, Cr Loans Receivable (principal), Cr Interest Income (interest)
 */
export async function processRepayment(data: {
  loanId: string;
  amount: number;
  paymentMode: string;
  paymentReference?: string;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['LOANS:COLLECT', 'SAVINGS:DEPOSIT']);

    const loan = await prisma.loan.findUnique({
      where: { id: data.loanId },
      include: {
        customer: true,
        schedule: { where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } }, orderBy: { installmentNumber: 'asc' } },
      },
    });
    if (!loan) return { success: false, error: 'Loan not found' };
    if (loan.status !== 'ACTIVE' && loan.status !== 'OVERDUE') {
      return { success: false, error: `Cannot process repayment for loan with status ${loan.status}` };
    }

    let remainingAmount = new Decimal(data.amount);
    let totalPrincipal = new Decimal(0);
    let totalInterest = new Decimal(0);
    let scheduleId: string | null = null;

    const receiptNumber = await generateReference('RECEIPT');

    await withTransaction(async (tx) => {
      // FIFO: Allocate to oldest unpaid schedule first, interest before principal
      for (const schedule of loan.schedule) {
        if (remainingAmount.lte(0)) break;

        const interestOwed = new Decimal(schedule.interestDue.toString()).minus(schedule.interestPaid.toString());
        const principalOwed = new Decimal(schedule.principalDue.toString()).minus(schedule.principalPaid.toString());

        let interestPaid = new Decimal(0);
        let principalPaid = new Decimal(0);

        // Pay interest first
        if (interestOwed.gt(0) && remainingAmount.gt(0)) {
          interestPaid = Decimal.min(interestOwed, remainingAmount);
          remainingAmount = remainingAmount.minus(interestPaid);
          totalInterest = totalInterest.plus(interestPaid);
        }

        // Then principal
        if (principalOwed.gt(0) && remainingAmount.gt(0)) {
          principalPaid = Decimal.min(principalOwed, remainingAmount);
          remainingAmount = remainingAmount.minus(principalPaid);
          totalPrincipal = totalPrincipal.plus(principalPaid);
        }

        if (interestPaid.gt(0) || principalPaid.gt(0)) {
          const newInterestPaid = new Decimal(schedule.interestPaid.toString()).plus(interestPaid);
          const newPrincipalPaid = new Decimal(schedule.principalPaid.toString()).plus(principalPaid);
          const newTotalPaid = newInterestPaid.plus(newPrincipalPaid);
          const totalDue = new Decimal(schedule.totalDue.toString());

          const newStatus = newTotalPaid.gte(totalDue) ? ScheduleStatus.PAID
            : newTotalPaid.gt(0) ? ScheduleStatus.PARTIAL
            : schedule.status;

          await tx.loanSchedule.update({
            where: { id: schedule.id },
            data: {
              interestPaid: newInterestPaid.toNumber(),
              principalPaid: newPrincipalPaid.toNumber(),
              totalPaid: newTotalPaid.toNumber(),
              status: newStatus,
              paidDate: newStatus === 'PAID' ? new Date() : undefined,
            },
          });

          if (!scheduleId) scheduleId = schedule.id;
        }
      }

      // Create repayment record
      await tx.loanRepayment.create({
        data: {
          loanId: data.loanId,
          scheduleId,
          receiptNumber,
          amount: data.amount,
          principalPortion: totalPrincipal.toNumber(),
          interestPortion: totalInterest.toNumber(),
          paymentMode: data.paymentMode as any,
          paymentReference: data.paymentReference,
          collectedById: user.id,
          notes: data.notes,
        },
      });

      // Check if loan is fully repaid
      const unpaidSchedules = await tx.loanSchedule.count({
        where: { loanId: data.loanId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      });

      if (unpaidSchedules === 0) {
        await tx.loan.update({
          where: { id: data.loanId },
          data: { status: LoanStatus.CLOSED, closedAt: new Date() },
        });
      }
    });

    // Post GL: Dr Cash, Cr Loans Receivable (principal), Cr Interest Income
    const loansReceivable = await getAccountByCode(LOAN_GL.LOANS_RECEIVABLE);
    const cashBank = await getAccountByCode(LOAN_GL.CASH_BANK);
    const interestIncome = await getAccountByCode(LOAN_GL.INTEREST_INCOME);

    if (loansReceivable && cashBank && interestIncome) {
      const glLines = [
        {
          accountId: cashBank.id,
          debitAmount: data.amount,
          creditAmount: 0,
          description: `Loan repayment - ${loan.loanNumber}`,
        },
      ];

      if (totalPrincipal.gt(0)) {
        glLines.push({
          accountId: loansReceivable.id,
          debitAmount: 0,
          creditAmount: totalPrincipal.toNumber(),
          description: `Principal repayment - ${loan.loanNumber}`,
          customerId: loan.customerId,
          referenceType: 'LOAN',
          referenceId: loan.id,
        } as any);
      }

      if (totalInterest.gt(0)) {
        glLines.push({
          accountId: interestIncome.id,
          debitAmount: 0,
          creditAmount: totalInterest.toNumber(),
          description: `Interest payment - ${loan.loanNumber}`,
        });
      }

      await createJournalEntry({
        entryDate: new Date(),
        description: `Loan repayment: ${loan.loanNumber} - ${receiptNumber}`,
        sourceModule: 'LOANS',
        sourceType: 'REPAYMENT',
        sourceId: loan.id,
        loanId: loan.id,
        lines: glLines,
        createdById: user.id,
        autoPost: true,
      });
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'LOANS', entityType: 'LOAN_REPAYMENT', entityId: data.loanId,
      description: `Repayment ${receiptNumber}: ${data.amount} for loan ${loan.loanNumber}`,
    });

    // Notify the loan officer who created the loan
    if (loan.createdById !== user.id) {
      await createNotification({
        userId: loan.createdById,
        type: 'PAYMENT_RECEIVED',
        title: 'Loan Repayment Received',
        message: `Payment of ${data.amount} received for loan ${loan.loanNumber}. Receipt: ${receiptNumber}`,
        entityType: 'LOAN',
        entityId: data.loanId,
        actionUrl: `/loans/${data.loanId}`,
      });
    }

    return {
      success: true,
      message: `Payment of ${data.amount} received. Receipt: ${receiptNumber}`,
      data: { receiptNumber, principalPaid: totalPrincipal.toNumber(), interestPaid: totalInterest.toNumber() },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getLoanProducts() {
  const products = await prisma.loanProduct.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  return products.map((p) => ({
    ...p,
    minAmount: p.minAmount.toNumber(),
    maxAmount: p.maxAmount.toNumber(),
    interestRate: p.interestRate.toNumber(),
    processingFee: p.processingFee.toNumber(),
    insuranceFee: p.insuranceFee?.toNumber() ?? null,
    lateFee: p.lateFee?.toNumber() ?? null,
    penaltyRate: p.penaltyRate?.toNumber() ?? null,
  }));
}

/**
 * Mark overdue loans - scans all ACTIVE loans for past-due unpaid schedules
 * Updates schedule status → OVERDUE, loan status → OVERDUE
 * Sends notifications for newly overdue loans
 */
export async function markOverdueLoans(): Promise<ActionResult<{ loansMarked: number; schedulesMarked: number }>> {
  try {
    const user = await requireAnyPermission(['LOANS:READ', 'LOANS:APPROVE_L1', 'LOANS:APPROVE_L2']);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all unpaid schedules that are past their due date for ACTIVE loans
    const overdueSchedules = await prisma.loanSchedule.findMany({
      where: {
        status: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { lt: today },
        loan: { status: { in: ['ACTIVE'] } },
      },
      include: {
        loan: {
          select: { id: true, loanNumber: true, createdById: true, customerId: true },
        },
      },
    });

    if (overdueSchedules.length === 0) {
      return { success: true, message: 'No overdue schedules found', data: { loansMarked: 0, schedulesMarked: 0 } };
    }

    // Mark schedules as overdue
    const scheduleIds = overdueSchedules.map((s) => s.id);
    await prisma.loanSchedule.updateMany({
      where: { id: { in: scheduleIds } },
      data: { status: ScheduleStatus.OVERDUE },
    });

    // Get unique loan IDs that now have overdue schedules
    const uniqueLoanIds = [...new Set(overdueSchedules.map((s) => s.loanId))];

    // Mark those loans as OVERDUE
    await prisma.loan.updateMany({
      where: { id: { in: uniqueLoanIds }, status: LoanStatus.ACTIVE },
      data: { status: LoanStatus.OVERDUE },
    });

    // Send notifications to loan officers
    const loanMap = new Map<string, { loanNumber: string; createdById: string }>();
    for (const s of overdueSchedules) {
      if (!loanMap.has(s.loanId)) {
        loanMap.set(s.loanId, { loanNumber: s.loan.loanNumber, createdById: s.loan.createdById });
      }
    }

    for (const [loanId, info] of loanMap) {
      await createNotification({
        userId: info.createdById,
        type: 'WARNING',
        title: 'Loan Overdue',
        message: `Loan ${info.loanNumber} has overdue instalments requiring attention`,
        entityType: 'LOAN',
        entityId: loanId,
        actionUrl: `/loans/${loanId}`,
      });
    }

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'LOANS', entityType: 'LOAN',
      entityId: 'BATCH',
      description: `Marked ${uniqueLoanIds.length} loans and ${scheduleIds.length} schedules as overdue`,
    });

    return {
      success: true,
      message: `Marked ${uniqueLoanIds.length} loan(s) and ${scheduleIds.length} schedule(s) as overdue`,
      data: { loansMarked: uniqueLoanIds.length, schedulesMarked: scheduleIds.length },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// LOAN RESTRUCTURING
// ============================================================================

/**
 * Request loan restructuring - LOAN_OFFICER or MANAGER
 * Only ACTIVE or OVERDUE loans can be restructured.
 */
export async function requestRestructuring(data: {
  loanId: string;
  restructuringType: 'TENURE_CHANGE' | 'RATE_CHANGE' | 'PARTIAL_WRITE_OFF' | 'COMBINED';
  newTenure?: number;
  newInterestRate?: number;
  writeOffAmount?: number;
  reason: string;
}): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['LOANS:CREATE', 'LOANS:APPROVE_L1']);

    const loan = await prisma.loan.findUnique({
      where: { id: data.loanId },
      include: {
        schedule: { where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } } },
      },
    });
    if (!loan) return { success: false, error: 'Loan not found' };
    if (loan.status !== 'ACTIVE' && loan.status !== 'OVERDUE') {
      return { success: false, error: `Cannot restructure loan with status ${loan.status}` };
    }
    if (!data.reason || data.reason.trim().length < 10) {
      return { success: false, error: 'A detailed reason is required (min 10 characters)' };
    }

    // Calculate outstanding balance from unpaid schedule items
    const outstandingBalance = loan.schedule.reduce((sum, s) => {
      const due = new Decimal(s.totalDue.toString());
      const paid = new Decimal(s.totalPaid.toString());
      return sum.plus(due.minus(paid));
    }, new Decimal(0));

    // Validate write-off amount
    if (data.restructuringType === 'PARTIAL_WRITE_OFF' || data.restructuringType === 'COMBINED') {
      if (!data.writeOffAmount || data.writeOffAmount <= 0) {
        return { success: false, error: 'Write-off amount must be positive' };
      }
      if (new Decimal(data.writeOffAmount).gt(outstandingBalance)) {
        return { success: false, error: 'Write-off amount cannot exceed outstanding balance' };
      }
    }

    const effectiveBalance = data.writeOffAmount
      ? outstandingBalance.minus(data.writeOffAmount).toNumber()
      : outstandingBalance.toNumber();

    const restructuringNumber = await generateReference('RESTR');

    const restructuring = await prisma.loanRestructuring.create({
      data: {
        loanId: data.loanId,
        restructuringNumber,
        restructuringType: data.restructuringType,
        previousTenure: loan.tenure,
        previousInterestRate: loan.interestRate,
        previousOutstandingBalance: outstandingBalance.toNumber(),
        newTenure: data.newTenure,
        newInterestRate: data.newInterestRate,
        writeOffAmount: data.writeOffAmount,
        effectiveBalance,
        reason: data.reason.trim(),
        status: 'PENDING',
        requestedById: user.id,
      },
    });

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'LOANS',
      entityType: 'LOAN_RESTRUCTURING', entityId: restructuring.id,
      description: `Restructuring requested for loan ${loan.loanNumber}: ${data.restructuringType}`,
    });

    await recordApprovalHistory({
      entityType: 'LOAN_RESTRUCTURING', entityId: restructuring.id,
      workflowStep: 'RESTRUCTURING_REQUEST', stepOrder: 1,
      action: 'SUBMITTED', actorId: user.id, actorRole: user.roleCode,
      previousStatus: '', newStatus: 'PENDING',
      comments: data.reason,
    });

    // Notify approvers
    const approverIds = await getUsersWithAnyPermission(['LOANS:APPROVE_L1', 'LOANS:APPROVE_L2']);
    await createNotificationForUsers(
      approverIds.filter((id) => id !== user.id),
      {
        type: 'APPROVAL_REQUIRED',
        title: 'Loan Restructuring Request',
        message: `Restructuring requested for loan ${loan.loanNumber}: ${data.restructuringType.replace(/_/g, ' ')}`,
        entityType: 'LOAN',
        entityId: data.loanId,
        actionUrl: `/loans/${data.loanId}`,
      }
    );

    return { success: true, message: `Restructuring ${restructuringNumber} submitted for approval` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Approve or reject loan restructuring - MANAGER/DIRECTOR
 */
export async function processRestructuring(data: {
  restructuringId: string;
  decision: 'APPROVED' | 'REJECTED';
  comments?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['LOANS:APPROVE_L1', 'LOANS:APPROVE_L2']);

    const restructuring = await prisma.loanRestructuring.findUnique({
      where: { id: data.restructuringId },
      include: { loan: { select: { loanNumber: true, createdById: true } } },
    });
    if (!restructuring) return { success: false, error: 'Restructuring request not found' };
    if (restructuring.status !== 'PENDING') {
      return { success: false, error: `Cannot process restructuring with status ${restructuring.status}` };
    }

    // Segregation of duties
    if (restructuring.requestedById === user.id) {
      return { success: false, error: 'You cannot approve a restructuring you requested' };
    }

    const newStatus = data.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';

    await prisma.loanRestructuring.update({
      where: { id: data.restructuringId },
      data: {
        status: newStatus as any,
        approvedById: user.id,
        approvedAt: new Date(),
        approvalComments: data.comments,
      },
    });

    await auditLog({
      userId: user.id, action: data.decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
      module: 'LOANS', entityType: 'LOAN_RESTRUCTURING', entityId: data.restructuringId,
      description: `Restructuring ${restructuring.restructuringNumber} ${newStatus.toLowerCase()}`,
    });

    await recordApprovalHistory({
      entityType: 'LOAN_RESTRUCTURING', entityId: data.restructuringId,
      workflowStep: 'RESTRUCTURING_APPROVAL', stepOrder: 2,
      action: data.decision, actorId: user.id, actorRole: user.roleCode,
      previousStatus: 'PENDING', newStatus,
      comments: data.comments,
    });

    // Notify requester
    await createNotification({
      userId: restructuring.requestedById,
      type: data.decision === 'APPROVED' ? 'INFO' : 'WARNING',
      title: `Restructuring ${data.decision === 'APPROVED' ? 'Approved' : 'Rejected'}`,
      message: `Restructuring ${restructuring.restructuringNumber} for loan ${restructuring.loan.loanNumber} has been ${newStatus.toLowerCase()}`,
      entityType: 'LOAN',
      entityId: restructuring.loanId,
      actionUrl: `/loans/${restructuring.loanId}`,
    });

    return { success: true, message: `Restructuring ${newStatus.toLowerCase()}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Apply approved restructuring - generates new schedule
 */
export async function applyRestructuring(restructuringId: string): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['LOANS:CREATE', 'LOANS:APPROVE_L1']);

    const restructuring = await prisma.loanRestructuring.findUnique({
      where: { id: restructuringId },
      include: {
        loan: { include: { product: true, customer: true } },
      },
    });
    if (!restructuring) return { success: false, error: 'Restructuring request not found' };
    if (restructuring.status !== 'APPROVED') {
      return { success: false, error: 'Restructuring must be approved before applying' };
    }

    const loan = restructuring.loan;
    const newTenure = restructuring.newTenure || loan.tenure;
    const newRate = restructuring.newInterestRate
      ? restructuring.newInterestRate.toNumber()
      : loan.interestRate.toNumber();
    const effectiveBalance = restructuring.effectiveBalance.toNumber();

    // Generate new schedule from effective balance
    const startDate = new Date();
    const scheduleCalc = loan.product.interestType === 'REDUCING_BALANCE'
      ? calculateReducingBalanceSchedule(effectiveBalance, newRate, newTenure, startDate)
      : calculateFlatRateSchedule(effectiveBalance, newRate, newTenure, startDate);

    await withTransaction(async (tx) => {
      // Mark old unpaid schedule items as SUPERSEDED
      await tx.loanSchedule.updateMany({
        where: {
          loanId: loan.id,
          status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        },
        data: { status: 'SUPERSEDED' as any, restructuringId },
      });

      // Create new schedule
      const maxInstalment = await tx.loanSchedule.aggregate({
        where: { loanId: loan.id },
        _max: { installmentNumber: true },
      });
      const startNum = (maxInstalment._max.installmentNumber || 0) + 1;

      for (let i = 0; i < scheduleCalc.schedule.length; i++) {
        const item = scheduleCalc.schedule[i];
        await tx.loanSchedule.create({
          data: {
            loanId: loan.id,
            installmentNumber: startNum + i,
            dueDate: item.dueDate,
            principalDue: item.principalDue,
            interestDue: item.interestDue,
            totalDue: item.totalDue,
            outstandingBalance: item.outstandingBalance,
            status: ScheduleStatus.PENDING,
            restructuringId,
          },
        });
      }

      // Update loan terms
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          tenure: newTenure,
          interestRate: newRate,
          monthlyInstalment: scheduleCalc.monthlyInstalment,
          maturityDate: new Date(startDate.getFullYear(), startDate.getMonth() + newTenure, startDate.getDate()),
          status: LoanStatus.ACTIVE, // Reset to ACTIVE if was OVERDUE
        },
      });

      // Mark restructuring as applied
      await tx.loanRestructuring.update({
        where: { id: restructuringId },
        data: { status: 'APPLIED' as any, effectiveDate: new Date() },
      });
    });

    // If there's a write-off, post GL entries
    if (restructuring.writeOffAmount && restructuring.writeOffAmount.toNumber() > 0) {
      const loansReceivable = await getAccountByCode(LOAN_GL.LOANS_RECEIVABLE);
      // Use fee income account as a proxy for bad debt expense (or create one)
      const badDebtAccount = await getAccountByCode('5310') || await getAccountByCode(LOAN_GL.FEE_INCOME);

      if (loansReceivable && badDebtAccount) {
        await createJournalEntry({
          entryDate: new Date(),
          description: `Loan restructuring write-off: ${loan.loanNumber} - ${restructuring.restructuringNumber}`,
          sourceModule: 'LOANS',
          sourceType: 'WRITE_OFF',
          sourceId: restructuringId,
          loanId: loan.id,
          lines: [
            {
              accountId: badDebtAccount.id,
              debitAmount: restructuring.writeOffAmount.toNumber(),
              creditAmount: 0,
              description: `Write-off - ${loan.loanNumber}`,
            },
            {
              accountId: loansReceivable.id,
              debitAmount: 0,
              creditAmount: restructuring.writeOffAmount.toNumber(),
              description: `Write-off reduction - ${loan.loanNumber}`,
              customerId: loan.customerId,
              referenceType: 'LOAN',
              referenceId: loan.id,
            },
          ],
          createdById: user.id,
          autoPost: true,
        });
      }
    }

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'LOANS',
      entityType: 'LOAN_RESTRUCTURING', entityId: restructuringId,
      description: `Applied restructuring ${restructuring.restructuringNumber} to loan ${loan.loanNumber}`,
    });

    return { success: true, message: `Restructuring applied. New schedule generated with ${scheduleCalc.schedule.length} instalments.` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// LOAN WRITE-OFF
// ============================================================================

/**
 * Write off a defaulted loan - DIRECTOR only
 * Posts GL: Dr Bad Debt Expense, Cr Loans Receivable
 */
export async function writeOffLoan(data: {
  loanId: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    const user = await requirePermission('LOANS:APPROVE_L2');

    if (!data.reason || data.reason.trim().length < 10) {
      return { success: false, error: 'A detailed reason is required for write-off (min 10 characters)' };
    }

    const loan = await prisma.loan.findUnique({
      where: { id: data.loanId },
      include: {
        customer: true,
        schedule: { where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } } },
      },
    });
    if (!loan) return { success: false, error: 'Loan not found' };
    if (loan.status !== 'DEFAULTED' && loan.status !== 'OVERDUE') {
      return { success: false, error: `Only DEFAULTED or OVERDUE loans can be written off. Current status: ${loan.status}` };
    }

    // Calculate remaining balance
    const outstandingBalance = loan.schedule.reduce((sum, s) => {
      const due = new Decimal(s.totalDue.toString());
      const paid = new Decimal(s.totalPaid.toString());
      return sum.plus(due.minus(paid));
    }, new Decimal(0));

    if (outstandingBalance.isZero()) {
      return { success: false, error: 'No outstanding balance to write off' };
    }

    await withTransaction(async (tx) => {
      // Mark all unpaid schedules as WAIVED
      await tx.loanSchedule.updateMany({
        where: {
          loanId: data.loanId,
          status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        },
        data: { status: 'WAIVED' as any },
      });

      // Update loan status
      await tx.loan.update({
        where: { id: data.loanId },
        data: {
          status: LoanStatus.WRITTEN_OFF,
          closedAt: new Date(),
          rejectionReason: `Written off: ${data.reason.trim()}`,
        },
      });
    });

    // Post GL entries: Dr Bad Debt Expense, Cr Loans Receivable
    const loansReceivable = await getAccountByCode(LOAN_GL.LOANS_RECEIVABLE);
    const badDebtAccount = await getAccountByCode('5310') || await getAccountByCode(LOAN_GL.FEE_INCOME);

    if (loansReceivable && badDebtAccount) {
      await createJournalEntry({
        entryDate: new Date(),
        description: `Loan write-off: ${loan.loanNumber} - ${data.reason.trim()}`,
        sourceModule: 'LOANS',
        sourceType: 'WRITE_OFF',
        sourceId: loan.id,
        loanId: loan.id,
        lines: [
          {
            accountId: badDebtAccount.id,
            debitAmount: outstandingBalance.toNumber(),
            creditAmount: 0,
            description: `Write-off - ${loan.loanNumber}`,
          },
          {
            accountId: loansReceivable.id,
            debitAmount: 0,
            creditAmount: outstandingBalance.toNumber(),
            description: `Write-off - ${loan.loanNumber}`,
            customerId: loan.customerId,
            referenceType: 'LOAN',
            referenceId: loan.id,
          },
        ],
        createdById: user.id,
        autoPost: true,
      });
    }

    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: 'UPDATE', module: 'LOANS', entityType: 'LOAN', entityId: data.loanId,
      description: `Written off loan ${loan.loanNumber}: ${outstandingBalance.toNumber()} - ${data.reason}`,
    });

    await recordApprovalHistory({
      entityType: 'LOAN', entityId: data.loanId,
      workflowStep: 'WRITE_OFF', stepOrder: 10,
      action: 'APPROVED', actorId: user.id, actorRole: user.roleCode,
      previousStatus: loan.status, newStatus: 'WRITTEN_OFF',
      comments: data.reason,
    });

    // Notify the loan officer
    if (loan.createdById !== user.id) {
      await createNotification({
        userId: loan.createdById,
        type: 'WARNING',
        title: 'Loan Written Off',
        message: `Loan ${loan.loanNumber} has been written off. Amount: ${outstandingBalance.toNumber()}`,
        entityType: 'LOAN',
        entityId: data.loanId,
        actionUrl: `/loans/${data.loanId}`,
      });
    }

    return { success: true, message: `Loan written off. Amount: ${outstandingBalance.toNumber()}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
