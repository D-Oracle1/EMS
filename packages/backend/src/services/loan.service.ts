/**
 * Hylink EMS - Loan Service
 * Complete loan lifecycle management with workflow
 *
 * Workflow: Loan Officer → Verification Officer → Loan Officer → Manager/Director → Accounts → Disbursement
 *
 * Role Segregation:
 * - Loan Officer: Create loans, cannot approve or disburse
 * - Verification Officer: Verify only, cannot alter terms
 * - Manager/Director: Approve based on limits
 * - Accounts: Post financial entries and disburse
 */

import { Prisma, LoanStatus, ApprovalDecision, VerificationStatus, ScheduleStatus, JournalEntryType } from '@prisma/client';
import Decimal from 'decimal.js';
import { addMonths, isBefore, isAfter } from 'date-fns';
import { prisma, withTransaction } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { accountingService } from './accounting.service.js';
import {
  generateReference,
  calculateReducingBalanceSchedule,
  calculateFlatRateSchedule,
} from '../utils/helpers.js';
import {
  NotFoundError,
  BusinessError,
  WorkflowError,
  ApprovalError,
  ValidationError as AppValidationError,
} from '../utils/errors.js';
import { PaginatedResult, PaginationParams } from '../types/index.js';

// Account codes for loan accounting (should be configured)
const LOAN_ACCOUNTS = {
  LOANS_RECEIVABLE: '1300', // Asset - Loans to Customers
  CASH_BANK: '1100', // Asset - Cash/Bank
  INTEREST_INCOME: '4100', // Income - Interest Income
  FEE_INCOME: '4200', // Income - Fee Income
  LOAN_LOSS_PROVISION: '5100', // Expense - Loan Loss Provision
};

interface CreateLoanInput {
  customerId: string;
  productId: string;
  branchId?: string;
  principalAmount: number;
  tenure: number; // months
  interestRate?: number; // Override product rate if needed
  purpose?: string;
  collateralDetails?: string;
  guarantorDetails?: string;
  createdById: string;
}

interface LoanFilters {
  status?: LoanStatus[];
  customerId?: string;
  branchId?: string;
  createdById?: string;
  productId?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

interface VerificationInput {
  loanId: string;
  officerId: string;
  verificationType: string;
  addressVerified?: boolean;
  addressComments?: string;
  employmentVerified?: boolean;
  employmentComments?: string;
  propertyExists?: boolean;
  propertyCondition?: string;
  estimatedValue?: number;
  propertyComments?: string;
  riskLevel?: string;
  recommendation?: string;
  findings?: string;
  gpsCoordinates?: string;
}

interface DisbursementInput {
  loanId: string;
  disbursedById: string;
  disbursementMode: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  chequeNumber?: string;
  reference?: string;
  notes?: string;
}

interface RepaymentInput {
  loanId: string;
  amount: number;
  paymentMode: string;
  paymentReference?: string;
  collectedById: string;
  notes?: string;
}

export class LoanService {
  /**
   * Create new loan application
   * Can only be done by Loan Officer
   */
  async createLoan(input: CreateLoanInput): Promise<{ id: string; loanNumber: string }> {
    const { customerId, productId, branchId, principalAmount, tenure, interestRate, purpose, collateralDetails, guarantorDetails, createdById } = input;

    // Validate customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    if (customer.status !== 'ACTIVE') {
      throw new BusinessError('Customer account is not active');
    }

    // Validate product
    const product = await prisma.loanProduct.findUnique({
      where: { id: productId },
    });

    if (!product || !product.isActive) {
      throw new NotFoundError('Loan product not found or inactive');
    }

    // Validate amount and tenure against product limits
    if (principalAmount < product.minAmount.toNumber() || principalAmount > product.maxAmount.toNumber()) {
      throw new BusinessError(
        `Loan amount must be between ${product.minAmount} and ${product.maxAmount}`
      );
    }

    if (tenure < product.minTenure || tenure > product.maxTenure) {
      throw new BusinessError(
        `Loan tenure must be between ${product.minTenure} and ${product.maxTenure} months`
      );
    }

    // Use product interest rate if not overridden
    const finalInterestRate = interestRate ?? product.interestRate.toNumber();

    // Calculate loan schedule
    const startDate = new Date();
    const scheduleCalc = product.interestType === 'REDUCING_BALANCE'
      ? calculateReducingBalanceSchedule(principalAmount, finalInterestRate, tenure, startDate)
      : calculateFlatRateSchedule(principalAmount, finalInterestRate, tenure, startDate);

    // Calculate fees
    const processingFee = new Decimal(principalAmount)
      .times(product.processingFee)
      .div(100)
      .toDecimalPlaces(2)
      .toNumber();

    const insuranceFee = product.insuranceFee
      ? new Decimal(principalAmount)
          .times(product.insuranceFee)
          .div(100)
          .toDecimalPlaces(2)
          .toNumber()
      : 0;

    const totalFees = processingFee + insuranceFee;

    // Generate loan number
    const loanNumber = await generateReference('LOAN');

    // Create loan with schedule in transaction
    const loan = await withTransaction(async (tx) => {
      const newLoan = await tx.loan.create({
        data: {
          loanNumber,
          customerId,
          productId,
          branchId,
          principalAmount,
          interestRate: finalInterestRate,
          tenure,
          processingFee,
          insuranceFee,
          totalFees,
          totalInterest: scheduleCalc.totalInterest,
          totalRepayment: scheduleCalc.totalRepayment,
          monthlyInstalment: scheduleCalc.monthlyInstalment,
          purpose,
          collateralDetails,
          guarantorDetails,
          status: LoanStatus.DRAFT,
          createdById,
        },
      });

      // Create repayment schedule
      await tx.loanSchedule.createMany({
        data: scheduleCalc.schedule.map(entry => ({
          loanId: newLoan.id,
          installmentNumber: entry.installmentNumber,
          dueDate: entry.dueDate,
          principalDue: entry.principalDue,
          interestDue: entry.interestDue,
          totalDue: entry.totalDue,
          outstandingBalance: entry.outstandingBalance,
          status: ScheduleStatus.PENDING,
        })),
      });

      return newLoan;
    });

    logger.info('Loan created', { loanNumber, customerId, amount: principalAmount });

    return { id: loan.id, loanNumber: loan.loanNumber };
  }

  /**
   * Get loan by ID with full details
   */
  async getLoanById(id: string): Promise<Prisma.LoanGetPayload<{
    include: {
      customer: true;
      product: true;
      branch: true;
      createdBy: { select: { id: true; firstName: true; lastName: true } };
      schedule: true;
      verifications: { include: { officer: { select: { id: true; firstName: true; lastName: true } } } };
      approvals: { include: { approver: { select: { id: true; firstName: true; lastName: true } } } };
      disbursement: true;
      repayments: true;
    };
  }> | null> {
    return prisma.loan.findUnique({
      where: { id },
      include: {
        customer: true,
        product: true,
        branch: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        schedule: {
          orderBy: { installmentNumber: 'asc' },
        },
        verifications: {
          include: {
            officer: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        approvals: {
          include: {
            approver: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        disbursement: true,
        repayments: {
          orderBy: { collectedAt: 'desc' },
        },
      },
    });
  }

  /**
   * Get loans with filters and pagination
   */
  async getLoans(
    filters: LoanFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Prisma.LoanGetPayload<{
    include: {
      customer: { select: { firstName: true; lastName: true; customerNumber: true } };
      product: { select: { name: true; code: true } };
      createdBy: { select: { firstName: true; lastName: true } };
    };
  }>>> {
    const { page, limit, sortBy = 'applicationDate', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.LoanWhereInput = {};

    if (filters.status?.length) {
      where.status = { in: filters.status };
    }
    if (filters.customerId) {
      where.customerId = filters.customerId;
    }
    if (filters.branchId) {
      where.branchId = filters.branchId;
    }
    if (filters.createdById) {
      where.createdById = filters.createdById;
    }
    if (filters.productId) {
      where.productId = filters.productId;
    }
    if (filters.startDate && filters.endDate) {
      where.applicationDate = {
        gte: filters.startDate,
        lte: filters.endDate,
      };
    }
    if (filters.search) {
      where.OR = [
        { loanNumber: { contains: filters.search, mode: 'insensitive' } },
        { customer: { firstName: { contains: filters.search, mode: 'insensitive' } } },
        { customer: { lastName: { contains: filters.search, mode: 'insensitive' } } },
        { customer: { customerNumber: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          customer: {
            select: { firstName: true, lastName: true, customerNumber: true },
          },
          product: {
            select: { name: true, code: true },
          },
          createdBy: {
            select: { firstName: true, lastName: true },
          },
        },
      }),
      prisma.loan.count({ where }),
    ]);

    return {
      data: loans,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Submit loan for verification
   */
  async submitForVerification(loanId: string, submittedById: string): Promise<void> {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
    });

    if (!loan) {
      throw new NotFoundError('Loan not found');
    }

    if (loan.status !== LoanStatus.DRAFT) {
      throw new WorkflowError(`Cannot submit loan with status: ${loan.status}`);
    }

    // Loan officer can only submit their own loans
    if (loan.createdById !== submittedById) {
      throw new WorkflowError('You can only submit loans you created');
    }

    await prisma.loan.update({
      where: { id: loanId },
      data: { status: LoanStatus.PENDING_VERIFICATION },
    });

    logger.info('Loan submitted for verification', { loanId, submittedById });
  }

  /**
   * Submit verification report
   * Can only be done by Verification Officer
   */
  async submitVerification(input: VerificationInput): Promise<{ id: string }> {
    const loan = await prisma.loan.findUnique({
      where: { id: input.loanId },
    });

    if (!loan) {
      throw new NotFoundError('Loan not found');
    }

    if (loan.status !== LoanStatus.PENDING_VERIFICATION && loan.status !== LoanStatus.VERIFICATION_IN_PROGRESS) {
      throw new WorkflowError(`Cannot verify loan with status: ${loan.status}`);
    }

    const verification = await withTransaction(async (tx) => {
      // Create verification record
      const verif = await tx.loanVerification.create({
        data: {
          loanId: input.loanId,
          officerId: input.officerId,
          verificationType: input.verificationType as any,
          addressVerified: input.addressVerified,
          addressComments: input.addressComments,
          employmentVerified: input.employmentVerified,
          employmentComments: input.employmentComments,
          propertyExists: input.propertyExists,
          propertyCondition: input.propertyCondition,
          estimatedValue: input.estimatedValue,
          propertyComments: input.propertyComments,
          riskLevel: input.riskLevel as any,
          recommendation: input.recommendation as any,
          findings: input.findings,
          gpsCoordinates: input.gpsCoordinates,
          status: VerificationStatus.COMPLETED,
          submittedAt: new Date(),
          visitedAt: new Date(),
        },
      });

      // Update loan status
      await tx.loan.update({
        where: { id: input.loanId },
        data: { status: LoanStatus.VERIFIED },
      });

      return verif;
    });

    logger.info('Loan verification submitted', { loanId: input.loanId, verificationId: verification.id });

    return { id: verification.id };
  }

  /**
   * Submit loan for approval
   */
  async submitForApproval(loanId: string, submittedById: string): Promise<void> {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { verifications: true },
    });

    if (!loan) {
      throw new NotFoundError('Loan not found');
    }

    if (loan.status !== LoanStatus.VERIFIED) {
      throw new WorkflowError(`Loan must be verified before approval. Current status: ${loan.status}`);
    }

    // Ensure at least one verification exists
    if (loan.verifications.length === 0) {
      throw new WorkflowError('Loan must have at least one verification report');
    }

    await prisma.loan.update({
      where: { id: loanId },
      data: { status: LoanStatus.PENDING_APPROVAL },
    });

    logger.info('Loan submitted for approval', { loanId, submittedById });
  }

  /**
   * Approve or reject loan
   * Manager/Director only - based on approval limits
   */
  async processApproval(
    loanId: string,
    approverId: string,
    decision: ApprovalDecision,
    approvalLimit: number,
    level: number,
    comments?: string,
    approvedAmount?: number
  ): Promise<void> {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { approvals: true },
    });

    if (!loan) {
      throw new NotFoundError('Loan not found');
    }

    if (loan.status !== LoanStatus.PENDING_APPROVAL) {
      throw new WorkflowError(`Cannot approve loan with status: ${loan.status}`);
    }

    // Segregation of duties - creator cannot approve
    if (loan.createdById === approverId) {
      throw new ApprovalError('You cannot approve a loan you created (Segregation of Duties)');
    }

    // Check approval limit
    const loanAmount = loan.principalAmount.toNumber();
    if (decision === ApprovalDecision.APPROVED && loanAmount > approvalLimit) {
      throw new ApprovalError(
        `Loan amount (${loanAmount}) exceeds your approval limit (${approvalLimit}). Please escalate.`
      );
    }

    await withTransaction(async (tx) => {
      // Create approval record
      await tx.loanApproval.create({
        data: {
          loanId,
          approverId,
          level,
          decision,
          comments,
          approvedAmount: approvedAmount ?? loan.principalAmount,
        },
      });

      // Update loan status based on decision
      let newStatus: LoanStatus;
      switch (decision) {
        case ApprovalDecision.APPROVED:
          newStatus = LoanStatus.APPROVED;
          break;
        case ApprovalDecision.REJECTED:
          newStatus = LoanStatus.REJECTED;
          break;
        case ApprovalDecision.REFERRED_UP:
          newStatus = LoanStatus.PENDING_APPROVAL; // Stay in pending for higher authority
          break;
        case ApprovalDecision.RETURNED_FOR_REVIEW:
          newStatus = LoanStatus.DRAFT; // Return to loan officer
          break;
        default:
          throw new ApprovalError('Invalid approval decision');
      }

      await tx.loan.update({
        where: { id: loanId },
        data: {
          status: newStatus,
          approvedAt: decision === ApprovalDecision.APPROVED ? new Date() : undefined,
        },
      });

      // Create approval history record
      await tx.approvalHistory.create({
        data: {
          entityType: 'LOAN',
          entityId: loanId,
          workflowStep: 'APPROVAL',
          stepOrder: level,
          action: decision === ApprovalDecision.APPROVED ? 'APPROVED' :
                  decision === ApprovalDecision.REJECTED ? 'REJECTED' : 'RETURNED',
          actorId: approverId,
          actorRole: 'APPROVER',
          comments,
          previousStatus: loan.status,
          newStatus,
        },
      });
    });

    logger.info('Loan approval processed', { loanId, approverId, decision });
  }

  /**
   * Disburse approved loan
   * Accounts department only - posts accounting entries
   */
  async disburseLoan(input: DisbursementInput): Promise<{ disbursementId: string; journalEntryId: string }> {
    const loan = await prisma.loan.findUnique({
      where: { id: input.loanId },
      include: { customer: true, schedule: true },
    });

    if (!loan) {
      throw new NotFoundError('Loan not found');
    }

    if (loan.status !== LoanStatus.APPROVED && loan.status !== LoanStatus.PENDING_DISBURSEMENT) {
      throw new WorkflowError(`Cannot disburse loan with status: ${loan.status}`);
    }

    // Get account IDs
    const loansReceivable = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: LOAN_ACCOUNTS.LOANS_RECEIVABLE },
    });

    const cashBank = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: LOAN_ACCOUNTS.CASH_BANK },
    });

    const feeIncome = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: LOAN_ACCOUNTS.FEE_INCOME },
    });

    if (!loansReceivable || !cashBank || !feeIncome) {
      throw new BusinessError('Required accounting accounts not configured');
    }

    const disbursedAmount = new Decimal(loan.principalAmount.toNumber())
      .minus(loan.totalFees.toNumber())
      .toNumber();

    const result = await withTransaction(async (tx) => {
      // Create journal entry for disbursement
      // Debit: Loans Receivable (full principal)
      // Credit: Cash/Bank (disbursed amount)
      // Credit: Fee Income (fees)
      const journalEntry = await accountingService.createJournalEntry({
        entryDate: new Date(),
        entryType: JournalEntryType.STANDARD,
        description: `Loan disbursement - ${loan.loanNumber} - ${loan.customer.firstName} ${loan.customer.lastName}`,
        sourceModule: 'LOANS',
        sourceType: 'DISBURSEMENT',
        sourceId: loan.id,
        loanId: loan.id,
        branchId: loan.branchId ?? undefined,
        lines: [
          {
            accountId: loansReceivable.id,
            debitAmount: loan.principalAmount.toNumber(),
            description: 'Loan principal',
            customerId: loan.customerId,
            referenceType: 'LOAN',
            referenceId: loan.id,
          },
          {
            accountId: cashBank.id,
            creditAmount: disbursedAmount,
            description: 'Disbursement to customer',
          },
          {
            accountId: feeIncome.id,
            creditAmount: loan.totalFees.toNumber(),
            description: 'Processing and insurance fees',
          },
        ],
        createdById: input.disbursedById,
        autoPost: true,
      });

      // Create disbursement record
      const disbursement = await tx.loanDisbursement.create({
        data: {
          loanId: input.loanId,
          disbursedAmount,
          disbursementMode: input.disbursementMode as any,
          bankName: input.bankName,
          accountNumber: input.accountNumber,
          accountName: input.accountName,
          chequeNumber: input.chequeNumber,
          reference: input.reference,
          notes: input.notes,
          disbursedById: input.disbursedById,
          journalEntryId: journalEntry.id,
        },
      });

      // Update loan status and dates
      const firstDueDate = loan.schedule[0]?.dueDate || addMonths(new Date(), 1);
      const lastSchedule = loan.schedule[loan.schedule.length - 1];
      const maturityDate = lastSchedule?.dueDate || addMonths(new Date(), loan.tenure);

      await tx.loan.update({
        where: { id: input.loanId },
        data: {
          status: LoanStatus.ACTIVE,
          disbursedAt: new Date(),
          firstRepaymentDate: firstDueDate,
          maturityDate,
        },
      });

      return { disbursement, journalEntry };
    });

    logger.info('Loan disbursed', {
      loanId: input.loanId,
      disbursedAmount,
      journalEntryId: result.journalEntry.id,
    });

    return {
      disbursementId: result.disbursement.id,
      journalEntryId: result.journalEntry.id,
    };
  }

  /**
   * Process loan repayment
   */
  async processRepayment(input: RepaymentInput): Promise<{
    receiptNumber: string;
    journalEntryId: string;
    allocation: {
      principal: number;
      interest: number;
      fees: number;
      penalty: number;
    };
  }> {
    const loan = await prisma.loan.findUnique({
      where: { id: input.loanId },
      include: {
        customer: true,
        schedule: {
          where: {
            status: { in: [ScheduleStatus.PENDING, ScheduleStatus.PARTIAL, ScheduleStatus.OVERDUE] },
          },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan not found');
    }

    if (loan.status !== LoanStatus.ACTIVE && loan.status !== LoanStatus.OVERDUE) {
      throw new WorkflowError(`Cannot accept payment for loan with status: ${loan.status}`);
    }

    // Get accounts
    const loansReceivable = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: LOAN_ACCOUNTS.LOANS_RECEIVABLE },
    });

    const cashBank = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: LOAN_ACCOUNTS.CASH_BANK },
    });

    const interestIncome = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: LOAN_ACCOUNTS.INTEREST_INCOME },
    });

    if (!loansReceivable || !cashBank || !interestIncome) {
      throw new BusinessError('Required accounting accounts not configured');
    }

    // Allocate payment to schedules (FIFO - oldest first)
    let remainingAmount = new Decimal(input.amount);
    const allocation = {
      principal: new Decimal(0),
      interest: new Decimal(0),
      fees: new Decimal(0),
      penalty: new Decimal(0),
    };
    const scheduleUpdates: Array<{ id: string; principalPaid: Decimal; interestPaid: Decimal; status: ScheduleStatus }> = [];

    for (const schedule of loan.schedule) {
      if (remainingAmount.isZero()) break;

      const principalDue = new Decimal(schedule.principalDue.toNumber()).minus(schedule.principalPaid.toNumber());
      const interestDue = new Decimal(schedule.interestDue.toNumber()).minus(schedule.interestPaid.toNumber());
      const totalDue = principalDue.plus(interestDue);

      if (totalDue.isZero()) continue;

      // Pay interest first, then principal
      let interestPayment = Decimal.min(interestDue, remainingAmount);
      remainingAmount = remainingAmount.minus(interestPayment);

      let principalPayment = Decimal.min(principalDue, remainingAmount);
      remainingAmount = remainingAmount.minus(principalPayment);

      allocation.interest = allocation.interest.plus(interestPayment);
      allocation.principal = allocation.principal.plus(principalPayment);

      const newPrincipalPaid = new Decimal(schedule.principalPaid.toNumber()).plus(principalPayment);
      const newInterestPaid = new Decimal(schedule.interestPaid.toNumber()).plus(interestPayment);
      const isFullyPaid = newPrincipalPaid.gte(schedule.principalDue.toNumber()) &&
                          newInterestPaid.gte(schedule.interestDue.toNumber());

      scheduleUpdates.push({
        id: schedule.id,
        principalPaid: principalPayment,
        interestPaid: interestPayment,
        status: isFullyPaid ? ScheduleStatus.PAID : ScheduleStatus.PARTIAL,
      });
    }

    // Generate receipt number
    const receiptNumber = await generateReference('RECEIPT');

    const result = await withTransaction(async (tx) => {
      // Create journal entry
      // Debit: Cash/Bank
      // Credit: Loans Receivable (principal portion)
      // Credit: Interest Income (interest portion)
      const journalLines = [
        {
          accountId: cashBank!.id,
          debitAmount: input.amount,
          description: 'Loan repayment received',
        },
      ];

      if (allocation.principal.gt(0)) {
        journalLines.push({
          accountId: loansReceivable!.id,
          creditAmount: allocation.principal.toNumber(),
          description: 'Principal repayment',
          customerId: loan.customerId,
          referenceType: 'LOAN',
          referenceId: loan.id,
        });
      }

      if (allocation.interest.gt(0)) {
        journalLines.push({
          accountId: interestIncome!.id,
          creditAmount: allocation.interest.toNumber(),
          description: 'Interest income',
        });
      }

      const journalEntry = await accountingService.createJournalEntry({
        entryDate: new Date(),
        entryType: JournalEntryType.STANDARD,
        description: `Loan repayment - ${loan.loanNumber} - ${loan.customer.firstName} ${loan.customer.lastName}`,
        sourceModule: 'LOANS',
        sourceType: 'REPAYMENT',
        sourceId: loan.id,
        loanId: loan.id,
        branchId: loan.branchId ?? undefined,
        lines: journalLines,
        createdById: input.collectedById,
        autoPost: true,
      });

      // Create repayment record
      const repayment = await tx.loanRepayment.create({
        data: {
          loanId: input.loanId,
          scheduleId: scheduleUpdates[0]?.id,
          receiptNumber,
          amount: input.amount,
          principalPortion: allocation.principal.toNumber(),
          interestPortion: allocation.interest.toNumber(),
          feesPortion: allocation.fees.toNumber(),
          penaltyPortion: allocation.penalty.toNumber(),
          paymentMode: input.paymentMode as any,
          paymentReference: input.paymentReference,
          collectedById: input.collectedById,
          notes: input.notes,
          journalEntryId: journalEntry.id,
        },
      });

      // Update schedules
      for (const update of scheduleUpdates) {
        await tx.loanSchedule.update({
          where: { id: update.id },
          data: {
            principalPaid: { increment: update.principalPaid.toNumber() },
            interestPaid: { increment: update.interestPaid.toNumber() },
            totalPaid: { increment: update.principalPaid.plus(update.interestPaid).toNumber() },
            status: update.status,
            paidDate: update.status === ScheduleStatus.PAID ? new Date() : undefined,
          },
        });
      }

      // Check if loan is fully paid
      const remainingSchedules = await tx.loanSchedule.count({
        where: {
          loanId: input.loanId,
          status: { not: ScheduleStatus.PAID },
        },
      });

      if (remainingSchedules === 0) {
        await tx.loan.update({
          where: { id: input.loanId },
          data: {
            status: LoanStatus.CLOSED,
            closedAt: new Date(),
          },
        });
      }

      return { repayment, journalEntry };
    });

    logger.info('Loan repayment processed', {
      loanId: input.loanId,
      receiptNumber,
      amount: input.amount,
      allocation: {
        principal: allocation.principal.toNumber(),
        interest: allocation.interest.toNumber(),
      },
    });

    return {
      receiptNumber,
      journalEntryId: result.journalEntry.id,
      allocation: {
        principal: allocation.principal.toNumber(),
        interest: allocation.interest.toNumber(),
        fees: allocation.fees.toNumber(),
        penalty: allocation.penalty.toNumber(),
      },
    };
  }

  /**
   * Get loan portfolio summary
   */
  async getPortfolioSummary(branchId?: string): Promise<{
    totalLoans: number;
    totalDisbursed: number;
    totalOutstanding: number;
    totalCollected: number;
    overdueCount: number;
    overdueAmount: number;
    byStatus: Record<string, { count: number; amount: number }>;
  }> {
    const where: Prisma.LoanWhereInput = {};
    if (branchId) {
      where.branchId = branchId;
    }

    const [
      totalCount,
      statusGroups,
      repaymentTotals,
      overdueData,
    ] = await Promise.all([
      prisma.loan.count({ where }),
      prisma.loan.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        _sum: { principalAmount: true },
      }),
      prisma.loanRepayment.aggregate({
        where: { loanId: { in: await prisma.loan.findMany({ where, select: { id: true } }).then(loans => loans.map(l => l.id)) } },
        _sum: { amount: true },
      }),
      prisma.loanSchedule.aggregate({
        where: {
          status: ScheduleStatus.OVERDUE,
          loan: where,
        },
        _count: { id: true },
        _sum: { totalDue: true },
      }),
    ]);

    const byStatus: Record<string, { count: number; amount: number }> = {};
    let totalDisbursed = 0;
    let totalOutstanding = 0;

    for (const group of statusGroups) {
      const amount = group._sum.principalAmount?.toNumber() || 0;
      byStatus[group.status] = {
        count: group._count.id,
        amount,
      };

      if (['ACTIVE', 'OVERDUE', 'CLOSED'].includes(group.status)) {
        totalDisbursed += amount;
      }
      if (['ACTIVE', 'OVERDUE'].includes(group.status)) {
        totalOutstanding += amount;
      }
    }

    return {
      totalLoans: totalCount,
      totalDisbursed,
      totalOutstanding,
      totalCollected: repaymentTotals._sum.amount?.toNumber() || 0,
      overdueCount: overdueData._count.id,
      overdueAmount: overdueData._sum.totalDue?.toNumber() || 0,
      byStatus,
    };
  }
}

export const loanService = new LoanService();
