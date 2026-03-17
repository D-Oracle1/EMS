-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisciplinaryStatus" AS ENUM ('OPEN', 'RESPONDED', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'CORPORATE', 'GROUP');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLACKLISTED', 'DECEASED');

-- CreateEnum
CREATE TYPE "RiskRating" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "InterestType" AS ENUM ('FLAT', 'REDUCING_BALANCE', 'COMPOUND');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'VERIFICATION_IN_PROGRESS', 'VERIFIED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PENDING_DISBURSEMENT', 'DISBURSED', 'ACTIVE', 'OVERDUE', 'DEFAULTED', 'CLOSED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('ADDRESS', 'EMPLOYMENT', 'COLLATERAL', 'GUARANTOR', 'COMPREHENSIVE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationRecommendation" AS ENUM ('APPROVE', 'APPROVE_WITH_CONDITIONS', 'DECLINE', 'FURTHER_REVIEW');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'REFERRED_UP', 'RETURNED_FOR_REVIEW');

-- CreateEnum
CREATE TYPE "DisbursementMode" AS ENUM ('BANK_TRANSFER', 'CHEQUE', 'CASH', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'POS', 'DIRECT_DEBIT');

-- CreateEnum
CREATE TYPE "RestructuringType" AS ENUM ('TENURE_CHANGE', 'RATE_CHANGE', 'PARTIAL_WRITE_OFF', 'COMBINED');

-- CreateEnum
CREATE TYPE "RestructuringStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SavingsType" AS ENUM ('DAILY', 'TARGET', 'FIXED', 'CORPORATE', 'JUNIOR', 'CURRENT');

-- CreateEnum
CREATE TYPE "InterestFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DORMANT', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SavingsTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'INTEREST_CREDIT', 'FEE_DEBIT', 'TRANSFER_IN', 'TRANSFER_OUT', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WithdrawalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InterestPaymentOption" AS ENUM ('AT_MATURITY', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "MaturityInstruction" AS ENUM ('ROLLOVER_PRINCIPAL_AND_INTEREST', 'ROLLOVER_PRINCIPAL_ONLY', 'PAY_OUT', 'TRANSFER_TO_SAVINGS');

-- CreateEnum
CREATE TYPE "FixedDepositStatus" AS ENUM ('ACTIVE', 'MATURED', 'WITHDRAWN', 'ROLLED_OVER', 'PREMATURE_CLOSED');

-- CreateEnum
CREATE TYPE "InterestPaymentStatus" AS ENUM ('ACCRUED', 'PAID', 'CAPITALIZED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('ADDRESS_VERIFICATION', 'EMPLOYMENT_VERIFICATION', 'COLLATERAL_VERIFICATION', 'GUARANTOR_VERIFICATION', 'KYC_VERIFICATION', 'BUSINESS_VERIFICATION');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "BalanceType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('CUSTOMER_LOAN', 'CUSTOMER_SAVINGS', 'CUSTOMER_FD', 'SUSPENSE', 'CONTROL');

-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('STANDARD', 'OPENING', 'CLOSING', 'ADJUSTMENT', 'REVERSAL', 'ACCRUAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'SOFT_CLOSE', 'HARD_CLOSE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ARCHIVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE', 'EXPORT', 'PRINT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'ESCALATED', 'RECALLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'WARNING', 'ERROR', 'APPROVAL_REQUIRED', 'TASK_ASSIGNED', 'PAYMENT_RECEIVED', 'LOAN_OVERDUE', 'MATURITY_REMINDER');

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "approvalLimit" DECIMAL(18,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "address" TEXT,
    "emergencyContact" TEXT,
    "nationalId" TEXT,
    "profilePhoto" TEXT,
    "departmentId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "branchId" TEXT,
    "supervisorId" TEXT,
    "hireDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminationDate" TIMESTAMP(3),
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clockIn" TIMESTAMP(3),
    "clockOut" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "notes" TEXT,
    "ipAddress" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewPeriod" TEXT NOT NULL,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "productivity" INTEGER NOT NULL,
    "quality" INTEGER NOT NULL,
    "attendance" INTEGER NOT NULL,
    "teamwork" INTEGER NOT NULL,
    "initiative" INTEGER NOT NULL,
    "overallRating" DECIMAL(3,2) NOT NULL,
    "strengths" TEXT,
    "areasForImprovement" TEXT,
    "goals" TEXT,
    "comments" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approverComments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplinaryAction" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "actionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "status" "DisciplinaryStatus" NOT NULL DEFAULT 'OPEN',
    "attachments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisciplinaryAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "customerNumber" TEXT NOT NULL,
    "customerType" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "maritalStatus" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "alternatePhone" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Nigeria',
    "nationalId" TEXT,
    "bvn" TEXT,
    "passportNumber" TEXT,
    "driversLicense" TEXT,
    "occupation" TEXT,
    "employer" TEXT,
    "employerAddress" TEXT,
    "monthlyIncome" DECIMAL(18,2),
    "nokName" TEXT,
    "nokRelationship" TEXT,
    "nokPhone" TEXT,
    "nokAddress" TEXT,
    "companyName" TEXT,
    "rcNumber" TEXT,
    "taxId" TEXT,
    "branchId" TEXT,
    "profilePhoto" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "riskRating" "RiskRating" NOT NULL DEFAULT 'MEDIUM',
    "kycVerified" BOOLEAN NOT NULL DEFAULT false,
    "kycVerifiedAt" TIMESTAMP(3),
    "kycVerifiedBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanProduct" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "minAmount" DECIMAL(18,2) NOT NULL,
    "maxAmount" DECIMAL(18,2) NOT NULL,
    "minTenure" INTEGER NOT NULL,
    "maxTenure" INTEGER NOT NULL,
    "interestRate" DECIMAL(5,2) NOT NULL,
    "interestType" "InterestType" NOT NULL DEFAULT 'FLAT',
    "processingFee" DECIMAL(5,2) NOT NULL,
    "insuranceFee" DECIMAL(5,2),
    "lateFee" DECIMAL(18,2),
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "penaltyRate" DECIMAL(5,2),
    "requiresCollateral" BOOLEAN NOT NULL DEFAULT false,
    "requiresGuarantor" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "loanReceivableAccountId" TEXT,
    "interestIncomeAccountId" TEXT,
    "feeIncomeAccountId" TEXT,

    CONSTRAINT "LoanProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "loanNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT,
    "principalAmount" DECIMAL(18,2) NOT NULL,
    "interestRate" DECIMAL(5,2) NOT NULL,
    "tenure" INTEGER NOT NULL,
    "processingFee" DECIMAL(18,2) NOT NULL,
    "insuranceFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalFees" DECIMAL(18,2) NOT NULL,
    "totalInterest" DECIMAL(18,2) NOT NULL,
    "totalRepayment" DECIMAL(18,2) NOT NULL,
    "monthlyInstalment" DECIMAL(18,2) NOT NULL,
    "purpose" TEXT,
    "collateralDetails" TEXT,
    "guarantorDetails" TEXT,
    "owingBypass" BOOLEAN NOT NULL DEFAULT false,
    "owingBypassReason" TEXT,
    "owingBypassLoanIds" TEXT[],
    "status" "LoanStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "applicationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "disbursedAt" TIMESTAMP(3),
    "firstRepaymentDate" TIMESTAMP(3),
    "maturityDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "verificationOfficerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanVerification" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "verificationType" "VerificationType" NOT NULL,
    "addressVerified" BOOLEAN,
    "addressComments" TEXT,
    "employmentVerified" BOOLEAN,
    "employmentComments" TEXT,
    "propertyExists" BOOLEAN,
    "propertyCondition" TEXT,
    "estimatedValue" DECIMAL(18,2),
    "propertyComments" TEXT,
    "riskLevel" "RiskRating",
    "recommendation" "VerificationRecommendation",
    "findings" TEXT,
    "photos" TEXT[],
    "documents" TEXT[],
    "gpsCoordinates" TEXT,
    "visitedAt" TIMESTAMP(3),
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "LoanVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanApproval" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comments" TEXT,
    "conditions" TEXT,
    "approvedAmount" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanDisbursement" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "disbursedAmount" DECIMAL(18,2) NOT NULL,
    "disbursementMode" "DisbursementMode" NOT NULL,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "chequeNumber" TEXT,
    "cashReceiverName" TEXT,
    "cashReceiverIdType" TEXT,
    "cashReceiverIdNumber" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "disbursedById" TEXT NOT NULL,
    "disbursedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journalEntryId" TEXT,

    CONSTRAINT "LoanDisbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanSchedule" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "principalDue" DECIMAL(18,2) NOT NULL,
    "interestDue" DECIMAL(18,2) NOT NULL,
    "feesDue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDue" DECIMAL(18,2) NOT NULL,
    "principalPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "interestPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "feesPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "penaltyPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "outstandingBalance" DECIMAL(18,2) NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'PENDING',
    "paidDate" TIMESTAMP(3),
    "restructuringId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanRepayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "principalPortion" DECIMAL(18,2) NOT NULL,
    "interestPortion" DECIMAL(18,2) NOT NULL,
    "feesPortion" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "penaltyPortion" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paymentMode" "PaymentMode" NOT NULL,
    "paymentReference" TEXT,
    "collectedById" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanRestructuring" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "restructuringNumber" TEXT NOT NULL,
    "restructuringType" "RestructuringType" NOT NULL,
    "previousTenure" INTEGER NOT NULL,
    "previousInterestRate" DECIMAL(5,2) NOT NULL,
    "previousOutstandingBalance" DECIMAL(18,2) NOT NULL,
    "newTenure" INTEGER,
    "newInterestRate" DECIMAL(5,2),
    "writeOffAmount" DECIMAL(18,2),
    "effectiveBalance" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RestructuringStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvalComments" TEXT,
    "journalEntryId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanRestructuring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsProduct" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "savingsType" "SavingsType" NOT NULL,
    "minBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "maxBalance" DECIMAL(18,2),
    "minDeposit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "maxDailyWithdrawal" DECIMAL(18,2),
    "interestRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "interestFrequency" "InterestFrequency" NOT NULL DEFAULT 'MONTHLY',
    "allowWithdrawal" BOOLEAN NOT NULL DEFAULT true,
    "withdrawalNotice" INTEGER NOT NULL DEFAULT 0,
    "monthlyFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "transactionFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "liabilityAccountId" TEXT,
    "interestExpenseAccountId" TEXT,

    CONSTRAINT "SavingsProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsAccount" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT,
    "currentBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "availableBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "holdAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "targetAmount" DECIMAL(18,2),
    "targetDate" TIMESTAMP(3),
    "interestAccrued" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lastInterestDate" TIMESTAMP(3),
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "lastTransactionAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "transactionRef" TEXT NOT NULL,
    "transactionType" "SavingsTransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balanceBefore" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL,
    "paymentReference" TEXT,
    "description" TEXT,
    "narration" TEXT,
    "processedById" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journalEntryId" TEXT,
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "reversedAt" TIMESTAMP(3),
    "reversalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT,
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "paymentReference" TEXT,
    "status" "WithdrawalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedDepositRate" (
    "id" TEXT NOT NULL,
    "minTenure" INTEGER NOT NULL,
    "maxTenure" INTEGER NOT NULL,
    "minAmount" DECIMAL(18,2) NOT NULL,
    "maxAmount" DECIMAL(18,2),
    "interestRate" DECIMAL(5,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedDepositRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedDeposit" (
    "id" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT,
    "principalAmount" DECIMAL(18,2) NOT NULL,
    "interestRate" DECIMAL(5,2) NOT NULL,
    "tenure" INTEGER NOT NULL,
    "interestAmount" DECIMAL(18,2) NOT NULL,
    "maturityAmount" DECIMAL(18,2) NOT NULL,
    "interestPayment" "InterestPaymentOption" NOT NULL DEFAULT 'AT_MATURITY',
    "interestAccountId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "fundingMode" "PaymentMode" NOT NULL,
    "fundingReference" TEXT,
    "maturityInstruction" "MaturityInstruction" NOT NULL DEFAULT 'ROLLOVER_PRINCIPAL_AND_INTEREST',
    "status" "FixedDepositStatus" NOT NULL DEFAULT 'ACTIVE',
    "accruedInterest" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lastAccrualDate" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "penaltyAmount" DECIMAL(18,2),
    "amountPaid" DECIMAL(18,2),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedDepositInterest" (
    "id" TEXT NOT NULL,
    "fixedDepositId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "daysInPeriod" INTEGER NOT NULL,
    "interestAmount" DECIMAL(18,2) NOT NULL,
    "status" "InterestPaymentStatus" NOT NULL DEFAULT 'ACCRUED',
    "paidAt" TIMESTAMP(3),
    "paymentMode" "PaymentMode",
    "paymentReference" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedDepositInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationTask" (
    "id" TEXT NOT NULL,
    "taskType" "TaskType" NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "loanId" TEXT,
    "customerId" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "dueDate" TIMESTAMP(3),
    "address" TEXT NOT NULL,
    "city" TEXT,
    "gpsCoordinates" TEXT,
    "instructions" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "addressVerified" BOOLEAN,
    "employmentVerified" BOOLEAN,
    "incomeVerified" BOOLEAN,
    "collateralVerified" BOOLEAN,
    "remarks" TEXT,
    "findings" TEXT,
    "recommendation" TEXT,
    "verifiedAddress" TEXT,
    "photos" TEXT[],
    "attachments" TEXT[],
    "visitAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartOfAccounts" (
    "id" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "isHeader" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystemAccount" BOOLEAN NOT NULL DEFAULT false,
    "normalBalance" "BalanceType" NOT NULL,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartOfAccounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "customerId" TEXT,
    "ledgerType" "LedgerType" NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "currentBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "valueDate" DATE NOT NULL,
    "entryType" "JournalEntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "narration" TEXT,
    "sourceModule" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "loanId" TEXT,
    "savingsAccountId" TEXT,
    "fixedDepositId" TEXT,
    "totalDebit" DECIMAL(18,2) NOT NULL,
    "totalCredit" DECIMAL(18,2) NOT NULL,
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "branchId" TEXT,
    "departmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "reversedAt" TIMESTAMP(3),
    "reversalEntryId" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "customerId" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPeriod" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "documentDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "customerId" TEXT,
    "loanId" TEXT,
    "staffId" TEXT,
    "departmentCode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,
    "accessLevel" TEXT NOT NULL DEFAULT 'INTERNAL',
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeNotes" TEXT,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "userRole" TEXT,
    "action" "AuditAction" NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "description" TEXT NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "changedFields" TEXT[],
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalHistory" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "workflowStep" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "comments" TEXT,
    "conditions" TEXT,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "actionUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "currentValue" INTEGER NOT NULL DEFAULT 0,
    "padLength" INTEGER NOT NULL DEFAULT 6,
    "resetFrequency" TEXT,
    "lastResetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "SystemConfig_category_idx" ON "SystemConfig"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "Permission_module_idx" ON "Permission"("module");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_module_action_key" ON "Permission"("module", "action");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_employeeId_key" ON "Staff"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");

-- CreateIndex
CREATE INDEX "Staff_departmentId_idx" ON "Staff"("departmentId");

-- CreateIndex
CREATE INDEX "Staff_roleId_idx" ON "Staff"("roleId");

-- CreateIndex
CREATE INDEX "Staff_branchId_idx" ON "Staff"("branchId");

-- CreateIndex
CREATE INDEX "Staff_status_idx" ON "Staff"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_token_key" ON "UserSession"("token");

-- CreateIndex
CREATE INDEX "UserSession_staffId_idx" ON "UserSession"("staffId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_staffId_date_key" ON "Attendance"("staffId", "date");

-- CreateIndex
CREATE INDEX "PerformanceReview_staffId_idx" ON "PerformanceReview"("staffId");

-- CreateIndex
CREATE INDEX "PerformanceReview_reviewPeriod_idx" ON "PerformanceReview"("reviewPeriod");

-- CreateIndex
CREATE INDEX "LeaveRequest_staffId_idx" ON "LeaveRequest"("staffId");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "LeaveRequest_startDate_endDate_idx" ON "LeaveRequest"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_staffId_idx" ON "DisciplinaryAction"("staffId");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_status_idx" ON "DisciplinaryAction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerNumber_key" ON "Customer"("customerNumber");

-- CreateIndex
CREATE INDEX "Customer_customerNumber_idx" ON "Customer"("customerNumber");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_branchId_idx" ON "Customer"("branchId");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LoanProduct_code_key" ON "LoanProduct"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_loanNumber_key" ON "Loan"("loanNumber");

-- CreateIndex
CREATE INDEX "Loan_loanNumber_idx" ON "Loan"("loanNumber");

-- CreateIndex
CREATE INDEX "Loan_customerId_idx" ON "Loan"("customerId");

-- CreateIndex
CREATE INDEX "Loan_status_idx" ON "Loan"("status");

-- CreateIndex
CREATE INDEX "Loan_createdById_idx" ON "Loan"("createdById");

-- CreateIndex
CREATE INDEX "Loan_verificationOfficerId_idx" ON "Loan"("verificationOfficerId");

-- CreateIndex
CREATE INDEX "Loan_applicationDate_idx" ON "Loan"("applicationDate");

-- CreateIndex
CREATE INDEX "LoanVerification_loanId_idx" ON "LoanVerification"("loanId");

-- CreateIndex
CREATE INDEX "LoanVerification_officerId_idx" ON "LoanVerification"("officerId");

-- CreateIndex
CREATE INDEX "LoanVerification_status_idx" ON "LoanVerification"("status");

-- CreateIndex
CREATE INDEX "LoanApproval_loanId_idx" ON "LoanApproval"("loanId");

-- CreateIndex
CREATE INDEX "LoanApproval_approverId_idx" ON "LoanApproval"("approverId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanDisbursement_loanId_key" ON "LoanDisbursement"("loanId");

-- CreateIndex
CREATE INDEX "LoanDisbursement_disbursedAt_idx" ON "LoanDisbursement"("disbursedAt");

-- CreateIndex
CREATE INDEX "LoanSchedule_dueDate_idx" ON "LoanSchedule"("dueDate");

-- CreateIndex
CREATE INDEX "LoanSchedule_status_idx" ON "LoanSchedule"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LoanSchedule_loanId_installmentNumber_key" ON "LoanSchedule"("loanId", "installmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LoanRepayment_receiptNumber_key" ON "LoanRepayment"("receiptNumber");

-- CreateIndex
CREATE INDEX "LoanRepayment_loanId_idx" ON "LoanRepayment"("loanId");

-- CreateIndex
CREATE INDEX "LoanRepayment_receiptNumber_idx" ON "LoanRepayment"("receiptNumber");

-- CreateIndex
CREATE INDEX "LoanRepayment_collectedAt_idx" ON "LoanRepayment"("collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoanRestructuring_restructuringNumber_key" ON "LoanRestructuring"("restructuringNumber");

-- CreateIndex
CREATE INDEX "LoanRestructuring_loanId_idx" ON "LoanRestructuring"("loanId");

-- CreateIndex
CREATE INDEX "LoanRestructuring_status_idx" ON "LoanRestructuring"("status");

-- CreateIndex
CREATE INDEX "LoanRestructuring_requestedById_idx" ON "LoanRestructuring"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsProduct_code_key" ON "SavingsProduct"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsAccount_accountNumber_key" ON "SavingsAccount"("accountNumber");

-- CreateIndex
CREATE INDEX "SavingsAccount_accountNumber_idx" ON "SavingsAccount"("accountNumber");

-- CreateIndex
CREATE INDEX "SavingsAccount_customerId_idx" ON "SavingsAccount"("customerId");

-- CreateIndex
CREATE INDEX "SavingsAccount_status_idx" ON "SavingsAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsTransaction_transactionRef_key" ON "SavingsTransaction"("transactionRef");

-- CreateIndex
CREATE INDEX "SavingsTransaction_accountId_idx" ON "SavingsTransaction"("accountId");

-- CreateIndex
CREATE INDEX "SavingsTransaction_transactionRef_idx" ON "SavingsTransaction"("transactionRef");

-- CreateIndex
CREATE INDEX "SavingsTransaction_processedAt_idx" ON "SavingsTransaction"("processedAt");

-- CreateIndex
CREATE INDEX "SavingsTransaction_transactionType_idx" ON "SavingsTransaction"("transactionType");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalRequest_requestNumber_key" ON "WithdrawalRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_accountId_idx" ON "WithdrawalRequest"("accountId");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_requestedById_idx" ON "WithdrawalRequest"("requestedById");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_status_idx" ON "WithdrawalRequest"("status");

-- CreateIndex
CREATE INDEX "FixedDepositRate_isActive_idx" ON "FixedDepositRate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FixedDeposit_certificateNumber_key" ON "FixedDeposit"("certificateNumber");

-- CreateIndex
CREATE INDEX "FixedDeposit_certificateNumber_idx" ON "FixedDeposit"("certificateNumber");

-- CreateIndex
CREATE INDEX "FixedDeposit_customerId_idx" ON "FixedDeposit"("customerId");

-- CreateIndex
CREATE INDEX "FixedDeposit_status_idx" ON "FixedDeposit"("status");

-- CreateIndex
CREATE INDEX "FixedDeposit_maturityDate_idx" ON "FixedDeposit"("maturityDate");

-- CreateIndex
CREATE INDEX "FixedDepositInterest_fixedDepositId_idx" ON "FixedDepositInterest"("fixedDepositId");

-- CreateIndex
CREATE INDEX "FixedDepositInterest_status_idx" ON "FixedDepositInterest"("status");

-- CreateIndex
CREATE INDEX "VerificationTask_assignedToId_idx" ON "VerificationTask"("assignedToId");

-- CreateIndex
CREATE INDEX "VerificationTask_createdById_idx" ON "VerificationTask"("createdById");

-- CreateIndex
CREATE INDEX "VerificationTask_status_idx" ON "VerificationTask"("status");

-- CreateIndex
CREATE INDEX "VerificationTask_loanId_idx" ON "VerificationTask"("loanId");

-- CreateIndex
CREATE INDEX "VerificationTask_customerId_idx" ON "VerificationTask"("customerId");

-- CreateIndex
CREATE INDEX "VerificationTask_referenceType_referenceId_idx" ON "VerificationTask"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccounts_accountCode_key" ON "ChartOfAccounts"("accountCode");

-- CreateIndex
CREATE INDEX "ChartOfAccounts_accountCode_idx" ON "ChartOfAccounts"("accountCode");

-- CreateIndex
CREATE INDEX "ChartOfAccounts_accountType_idx" ON "ChartOfAccounts"("accountType");

-- CreateIndex
CREATE INDEX "ChartOfAccounts_parentId_idx" ON "ChartOfAccounts"("parentId");

-- CreateIndex
CREATE INDEX "LedgerAccount_customerId_idx" ON "LedgerAccount"("customerId");

-- CreateIndex
CREATE INDEX "LedgerAccount_ledgerType_idx" ON "LedgerAccount"("ledgerType");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_accountId_referenceType_referenceId_key" ON "LedgerAccount"("accountId", "referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber");

-- CreateIndex
CREATE INDEX "JournalEntry_entryNumber_idx" ON "JournalEntry"("entryNumber");

-- CreateIndex
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_sourceModule_sourceType_sourceId_idx" ON "JournalEntry"("sourceModule", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntry_status_idx" ON "JournalEntry"("status");

-- CreateIndex
CREATE INDEX "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_accountId_idx" ON "JournalEntryLine"("accountId");

-- CreateIndex
CREATE INDEX "FinancialPeriod_status_idx" ON "FinancialPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialPeriod_year_month_key" ON "FinancialPeriod"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCategory_code_key" ON "DocumentCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Document_documentNumber_key" ON "Document"("documentNumber");

-- CreateIndex
CREATE INDEX "Document_documentNumber_idx" ON "Document"("documentNumber");

-- CreateIndex
CREATE INDEX "Document_categoryId_idx" ON "Document"("categoryId");

-- CreateIndex
CREATE INDEX "Document_customerId_idx" ON "Document"("customerId");

-- CreateIndex
CREATE INDEX "Document_loanId_idx" ON "Document"("loanId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_module_idx" ON "AuditLog"("module");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "ApprovalHistory_entityType_entityId_idx" ON "ApprovalHistory"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ApprovalHistory_actorId_idx" ON "ApprovalHistory"("actorId");

-- CreateIndex
CREATE INDEX "ApprovalHistory_createdAt_idx" ON "ApprovalHistory"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sequence_code_key" ON "Sequence"("code");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "LoanProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_verificationOfficerId_fkey" FOREIGN KEY ("verificationOfficerId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanVerification" ADD CONSTRAINT "LoanVerification_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanVerification" ADD CONSTRAINT "LoanVerification_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanApproval" ADD CONSTRAINT "LoanApproval_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanApproval" ADD CONSTRAINT "LoanApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanDisbursement" ADD CONSTRAINT "LoanDisbursement_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanDisbursement" ADD CONSTRAINT "LoanDisbursement_disbursedById_fkey" FOREIGN KEY ("disbursedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanSchedule" ADD CONSTRAINT "LoanSchedule_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "LoanSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRestructuring" ADD CONSTRAINT "LoanRestructuring_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRestructuring" ADD CONSTRAINT "LoanRestructuring_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRestructuring" ADD CONSTRAINT "LoanRestructuring_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsAccount" ADD CONSTRAINT "SavingsAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsAccount" ADD CONSTRAINT "SavingsAccount_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SavingsProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsAccount" ADD CONSTRAINT "SavingsAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsTransaction" ADD CONSTRAINT "SavingsTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SavingsAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsTransaction" ADD CONSTRAINT "SavingsTransaction_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SavingsAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedDeposit" ADD CONSTRAINT "FixedDeposit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedDeposit" ADD CONSTRAINT "FixedDeposit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedDeposit" ADD CONSTRAINT "FixedDeposit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedDepositInterest" ADD CONSTRAINT "FixedDepositInterest_fixedDepositId_fkey" FOREIGN KEY ("fixedDepositId") REFERENCES "FixedDeposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationTask" ADD CONSTRAINT "VerificationTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationTask" ADD CONSTRAINT "VerificationTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationTask" ADD CONSTRAINT "VerificationTask_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationTask" ADD CONSTRAINT "VerificationTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccounts" ADD CONSTRAINT "ChartOfAccounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChartOfAccounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_savingsAccountId_fkey" FOREIGN KEY ("savingsAccountId") REFERENCES "SavingsAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_fixedDepositId_fkey" FOREIGN KEY ("fixedDepositId") REFERENCES "FixedDeposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCategory" ADD CONSTRAINT "DocumentCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DocumentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DocumentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
