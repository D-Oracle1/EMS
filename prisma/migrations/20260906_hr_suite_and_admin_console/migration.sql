-- Migration: HR suite (payroll, leave, recruitment, lifecycle, assets) +
--            administration console (roles, config, sessions, products)
-- Hylink Finance Limited EMS
-- Generated: 2026-09-06
--
-- Written to be idempotent so it can be applied with:
--   npx prisma db execute --file prisma/migrations/20260906_hr_suite_and_admin_console/migration.sql --schema prisma/schema.prisma
--   npx prisma migrate resolve --applied 20260906_hr_suite_and_admin_console
--
-- (The Supabase pooler will not grant the shadow database `prisma migrate dev`
-- requires, so migrations here are applied by hand — see the repo convention in
-- prisma/migrations/20260702_add_guarantor_model.)

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmploymentType') THEN
    CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'NYSC', 'CONSULTANT');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayrollComponentType') THEN
    CREATE TYPE "PayrollComponentType" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayrollCalculationType') THEN
    CREATE TYPE "PayrollCalculationType" AS ENUM ('FIXED', 'PERCENT_OF_BASIC', 'PERCENT_OF_GROSS');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayrollStatus') THEN
    CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PROCESSING', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'CANCELLED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'JobOpeningStatus') THEN
    CREATE TYPE "JobOpeningStatus" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'FILLED', 'CANCELLED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApplicationStatus') THEN
    CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SCREENING', 'SHORTLISTED', 'INTERVIEWING', 'OFFER_SENT', 'OFFER_ACCEPTED', 'HIRED', 'REJECTED', 'WITHDRAWN');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InterviewStatus') THEN
    CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InterviewRecommendation') THEN
    CREATE TYPE "InterviewRecommendation" AS ENUM ('STRONG_HIRE', 'HIRE', 'NEUTRAL', 'NO_HIRE', 'STRONG_NO_HIRE');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OnboardingType') THEN
    CREATE TYPE "OnboardingType" AS ENUM ('ONBOARDING', 'OFFBOARDING');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OnboardingStatus') THEN
    CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OnboardingTaskStatus') THEN
    CREATE TYPE "OnboardingTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TrainingStatus') THEN
    CREATE TYPE "TrainingStatus" AS ENUM ('PLANNED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EnrollmentStatus') THEN
    CREATE TYPE "EnrollmentStatus" AS ENUM ('NOMINATED', 'ENROLLED', 'ATTENDED', 'COMPLETED', 'FAILED', 'CANCELLED', 'NO_SHOW');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssetStatus') THEN
    CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST', 'DAMAGED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AnnouncementAudience') THEN
    CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'DEPARTMENT', 'BRANCH', 'ROLE');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MovementType') THEN
    CREATE TYPE "MovementType" AS ENUM ('PROMOTION', 'DEMOTION', 'TRANSFER', 'CONFIRMATION', 'ROLE_CHANGE', 'DEPARTMENT_CHANGE', 'SALARY_REVIEW', 'SUSPENSION', 'REINSTATEMENT', 'CONTRACT_RENEWAL', 'EXIT');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExitType') THEN
    CREATE TYPE "ExitType" AS ENUM ('RESIGNATION', 'TERMINATION', 'RETIREMENT', 'CONTRACT_END', 'REDUNDANCY', 'DEATH', 'ABANDONMENT');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClearanceStatus') THEN
    CREATE TYPE "ClearanceStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'CLEARED', 'BLOCKED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GoalStatus') THEN
    CREATE TYPE "GoalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ACHIEVED', 'MISSED', 'CANCELLED');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "dataType" TEXT NOT NULL DEFAULT 'STRING',
ADD COLUMN IF NOT EXISTS "description" TEXT,
ADD COLUMN IF NOT EXISTS "isEditable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "isSecret" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "label" TEXT,
ADD COLUMN IF NOT EXISTS "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "bankAccountName" TEXT,
ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT,
ADD COLUMN IF NOT EXISTS "bankName" TEXT,
ADD COLUMN IF NOT EXISTS "bloodGroup" TEXT,
ADD COLUMN IF NOT EXISTS "confirmationDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "contractEndDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "emergencyRelation" TEXT,
ADD COLUMN IF NOT EXISTS "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
ADD COLUMN IF NOT EXISTS "gradeId" TEXT,
ADD COLUMN IF NOT EXISTS "jobTitle" TEXT,
ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT,
ADD COLUMN IF NOT EXISTS "nationality" TEXT DEFAULT 'Nigerian',
ADD COLUMN IF NOT EXISTS "nhfNumber" TEXT,
ADD COLUMN IF NOT EXISTS "nhisNumber" TEXT,
ADD COLUMN IF NOT EXISTS "pensionPin" TEXT,
ADD COLUMN IF NOT EXISTS "pensionProvider" TEXT,
ADD COLUMN IF NOT EXISTS "probationEndDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "religion" TEXT,
ADD COLUMN IF NOT EXISTS "stateOfOrigin" TEXT,
ADD COLUMN IF NOT EXISTS "taxId" TEXT,
ADD COLUMN IF NOT EXISTS "workLocation" TEXT;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "minutesLate" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "shiftId" TEXT,
ADD COLUMN IF NOT EXISTS "workedMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT,
ADD COLUMN IF NOT EXISTS "contactDuringLeave" TEXT,
ADD COLUMN IF NOT EXISTS "handoverToId" TEXT,
ADD COLUMN IF NOT EXISTS "leaveTypeId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LeaveType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "carryForward" BOOLEAN NOT NULL DEFAULT false,
    "maxCarryForwardDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "maxConsecutiveDays" INTEGER,
    "minServiceMonths" INTEGER NOT NULL DEFAULT 0,
    "genderRestriction" TEXT,
    "countsWeekends" BOOLEAN NOT NULL DEFAULT false,
    "colorHex" TEXT DEFAULT '#64748b',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LeaveBalance" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "entitledDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "carriedForwardDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "accruedDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "usedDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "pendingDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Holiday" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "isWorkingDay" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkShift" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "workDays" INTEGER[],
    "branchId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalaryGrade" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "minGross" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "maxGross" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "annualLeaveDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollComponent" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PayrollComponentType" NOT NULL,
    "calculationType" "PayrollCalculationType" NOT NULL DEFAULT 'FIXED',
    "defaultValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isStatutory" BOOLEAN NOT NULL DEFAULT false,
    "isPensionable" BOOLEAN NOT NULL DEFAULT false,
    "glAccountCode" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StaffCompensation" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "gradeId" TEXT,
    "basicSalary" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "payFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffCompensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StaffCompensationItem" (
    "id" TEXT NOT NULL,
    "compensationId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "percentage" DECIMAL(7,4),

    CONSTRAINT "StaffCompensationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "payDate" DATE NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "staffCount" INTEGER NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalEmployerCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Payslip" (
    "id" TEXT NOT NULL,
    "payslipNumber" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "basicSalary" DECIMAL(18,2) NOT NULL,
    "grossEarnings" DECIMAL(18,2) NOT NULL,
    "totalDeductions" DECIMAL(18,2) NOT NULL,
    "netPay" DECIMAL(18,2) NOT NULL,
    "employerCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "workingDays" INTEGER NOT NULL DEFAULT 0,
    "daysPresent" INTEGER NOT NULL DEFAULT 0,
    "daysAbsent" INTEGER NOT NULL DEFAULT 0,
    "lopDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "lopAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "gradeName" TEXT,
    "jobTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayslipLine" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "componentCode" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "type" "PayrollComponentType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "glAccountCode" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PayslipLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "JobOpening" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "branchId" TEXT,
    "gradeId" TEXT,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "responsibilities" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "vacancies" INTEGER NOT NULL DEFAULT 1,
    "filledCount" INTEGER NOT NULL DEFAULT 0,
    "minSalary" DECIMAL(18,2),
    "maxSalary" DECIMAL(18,2),
    "status" "JobOpeningStatus" NOT NULL DEFAULT 'DRAFT',
    "openedAt" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "hiringManagerId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "JobApplication" (
    "id" TEXT NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "resumeUrl" TEXT,
    "coverLetter" TEXT,
    "yearsExperience" INTEGER,
    "currentEmployer" TEXT,
    "currentPosition" TEXT,
    "expectedSalary" DECIMAL(18,2),
    "noticePeriodDays" INTEGER,
    "highestQualification" TEXT,
    "source" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "rating" INTEGER,
    "screeningNotes" TEXT,
    "rejectionReason" TEXT,
    "hiredStaffId" TEXT,
    "hiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Interview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "stageOrder" INTEGER NOT NULL DEFAULT 1,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 45,
    "mode" TEXT NOT NULL DEFAULT 'IN_PERSON',
    "location" TEXT,
    "interviewerId" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "score" INTEGER,
    "feedback" TEXT,
    "recommendation" "InterviewRecommendation",
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OnboardingTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OnboardingType" NOT NULL DEFAULT 'ONBOARDING',
    "departmentId" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OnboardingTemplateTask" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "dueDayOffset" INTEGER NOT NULL DEFAULT 0,
    "ownerRoleCode" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OnboardingTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StaffOnboarding" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "templateId" TEXT,
    "type" "OnboardingType" NOT NULL DEFAULT 'ONBOARDING',
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startDate" DATE NOT NULL,
    "targetDate" DATE,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OnboardingTask" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "dueDate" DATE,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "OnboardingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "assigneeId" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TrainingProgram" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "provider" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'IN_PERSON',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "venue" TEXT,
    "capacity" INTEGER,
    "costPerSeat" DECIMAL(18,2),
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "passMark" INTEGER DEFAULT 50,
    "facilitatorId" TEXT,
    "status" "TrainingStatus" NOT NULL DEFAULT 'PLANNED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TrainingEnrollment" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'NOMINATED',
    "attendedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "score" INTEGER,
    "passed" BOOLEAN,
    "feedback" TEXT,
    "certificateUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompanyAsset" (
    "id" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'IT',
    "make" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "purchaseDate" DATE,
    "purchaseCost" DECIMAL(18,2),
    "warrantyUntil" DATE,
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "branchId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssetAssignment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT NOT NULL,
    "dueReturnAt" DATE,
    "acknowledgedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "returnCondition" TEXT,
    "returnNotes" TEXT,
    "notes" TEXT,

    CONSTRAINT "AssetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "audienceType" "AnnouncementAudience" NOT NULL DEFAULT 'ALL',
    "audienceId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "requiresAck" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "attachmentUrl" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AnnouncementAck" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementAck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StaffMovement" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "fromRoleId" TEXT,
    "toRoleId" TEXT,
    "fromDepartmentId" TEXT,
    "toDepartmentId" TEXT,
    "fromBranchId" TEXT,
    "toBranchId" TEXT,
    "fromGradeId" TEXT,
    "toGradeId" TEXT,
    "fromSalary" DECIMAL(18,2),
    "toSalary" DECIMAL(18,2),
    "fromJobTitle" TEXT,
    "toJobTitle" TEXT,
    "reason" TEXT NOT NULL,
    "remarks" TEXT,
    "documentUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StaffExit" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "type" "ExitType" NOT NULL,
    "noticeDate" DATE NOT NULL,
    "lastWorkingDay" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "detailedReason" TEXT,
    "exitInterviewDate" TIMESTAMP(3),
    "exitInterviewNotes" TEXT,
    "wouldRecommend" BOOLEAN,
    "rehireEligible" BOOLEAN NOT NULL DEFAULT true,
    "clearanceStatus" "ClearanceStatus" NOT NULL DEFAULT 'PENDING',
    "assetsReturned" BOOLEAN NOT NULL DEFAULT false,
    "handoverCompleted" BOOLEAN NOT NULL DEFAULT false,
    "accessRevoked" BOOLEAN NOT NULL DEFAULT false,
    "finalSettlementAmount" DECIMAL(18,2),
    "settledAt" TIMESTAMP(3),
    "processedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffExit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StaffGoal" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'PERFORMANCE',
    "targetValue" DECIMAL(18,2),
    "actualValue" DECIMAL(18,2),
    "unit" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "startDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'DRAFT',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "ratedScore" INTEGER,
    "reviewPeriod" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LeaveType_code_key" ON "LeaveType"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeaveType_isActive_idx" ON "LeaveType"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeaveBalance_year_idx" ON "LeaveBalance"("year");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LeaveBalance_staffId_leaveTypeId_year_key" ON "LeaveBalance"("staffId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Holiday_date_idx" ON "Holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Holiday_name_date_key" ON "Holiday"("name", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkShift_code_key" ON "WorkShift"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkShift_isActive_idx" ON "WorkShift"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShiftAssignment_staffId_idx" ON "ShiftAssignment"("staffId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShiftAssignment_shiftId_idx" ON "ShiftAssignment"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SalaryGrade_code_key" ON "SalaryGrade"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalaryGrade_isActive_idx" ON "SalaryGrade"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollComponent_code_key" ON "PayrollComponent"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollComponent_type_idx" ON "PayrollComponent"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollComponent_isActive_idx" ON "PayrollComponent"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffCompensation_staffId_idx" ON "StaffCompensation"("staffId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffCompensation_isCurrent_idx" ON "StaffCompensation"("isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StaffCompensationItem_compensationId_componentId_key" ON "StaffCompensationItem"("compensationId", "componentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPeriod_code_key" ON "PayrollPeriod"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollPeriod_status_idx" ON "PayrollPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPeriod_year_month_key" ON "PayrollPeriod"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Payslip_payslipNumber_key" ON "Payslip"("payslipNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payslip_staffId_idx" ON "Payslip"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Payslip_payrollPeriodId_staffId_key" ON "Payslip"("payrollPeriodId", "staffId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayslipLine_payslipId_idx" ON "PayslipLine"("payslipId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "JobOpening_code_key" ON "JobOpening"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobOpening_status_idx" ON "JobOpening"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobOpening_departmentId_idx" ON "JobOpening"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "JobApplication_applicationNumber_key" ON "JobApplication"("applicationNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobApplication_openingId_idx" ON "JobApplication"("openingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobApplication_status_idx" ON "JobApplication"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobApplication_email_idx" ON "JobApplication"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Interview_applicationId_idx" ON "Interview"("applicationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Interview_scheduledAt_idx" ON "Interview"("scheduledAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingTemplateTask_templateId_idx" ON "OnboardingTemplateTask"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffOnboarding_staffId_idx" ON "StaffOnboarding"("staffId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffOnboarding_status_idx" ON "StaffOnboarding"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingTask_onboardingId_idx" ON "OnboardingTask"("onboardingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingTask_assigneeId_idx" ON "OnboardingTask"("assigneeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingTask_status_idx" ON "OnboardingTask"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TrainingProgram_code_key" ON "TrainingProgram"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrainingProgram_status_idx" ON "TrainingProgram"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrainingProgram_startDate_idx" ON "TrainingProgram"("startDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrainingEnrollment_staffId_idx" ON "TrainingEnrollment"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TrainingEnrollment_programId_staffId_key" ON "TrainingEnrollment"("programId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyAsset_assetTag_key" ON "CompanyAsset"("assetTag");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompanyAsset_status_idx" ON "CompanyAsset"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompanyAsset_category_idx" ON "CompanyAsset"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssetAssignment_assetId_idx" ON "AssetAssignment"("assetId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssetAssignment_staffId_idx" ON "AssetAssignment"("staffId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Announcement_isPublished_publishedAt_idx" ON "Announcement"("isPublished", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementAck_announcementId_staffId_key" ON "AnnouncementAck"("announcementId", "staffId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffMovement_staffId_idx" ON "StaffMovement"("staffId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffMovement_type_idx" ON "StaffMovement"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffMovement_effectiveDate_idx" ON "StaffMovement"("effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StaffExit_staffId_key" ON "StaffExit"("staffId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffExit_clearanceStatus_idx" ON "StaffExit"("clearanceStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffGoal_staffId_idx" ON "StaffGoal"("staffId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StaffGoal_status_idx" ON "StaffGoal"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Staff_gradeId_idx" ON "Staff"("gradeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeaveRequest_leaveTypeId_idx" ON "LeaveRequest"("leaveTypeId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Staff_gradeId_fkey') THEN
    ALTER TABLE "Staff" ADD CONSTRAINT "Staff_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "SalaryGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Attendance_shiftId_fkey') THEN
    ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveRequest_leaveTypeId_fkey') THEN
    ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveBalance_staffId_fkey') THEN
    ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveBalance_leaveTypeId_fkey') THEN
    ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkShift_branchId_fkey') THEN
    ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ShiftAssignment_staffId_fkey') THEN
    ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ShiftAssignment_shiftId_fkey') THEN
    ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffCompensation_staffId_fkey') THEN
    ALTER TABLE "StaffCompensation" ADD CONSTRAINT "StaffCompensation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffCompensation_createdById_fkey') THEN
    ALTER TABLE "StaffCompensation" ADD CONSTRAINT "StaffCompensation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffCompensation_gradeId_fkey') THEN
    ALTER TABLE "StaffCompensation" ADD CONSTRAINT "StaffCompensation_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "SalaryGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffCompensationItem_compensationId_fkey') THEN
    ALTER TABLE "StaffCompensationItem" ADD CONSTRAINT "StaffCompensationItem_compensationId_fkey" FOREIGN KEY ("compensationId") REFERENCES "StaffCompensation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffCompensationItem_componentId_fkey') THEN
    ALTER TABLE "StaffCompensationItem" ADD CONSTRAINT "StaffCompensationItem_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PayrollComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollPeriod_processedById_fkey') THEN
    ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollPeriod_approvedById_fkey') THEN
    ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payslip_payrollPeriodId_fkey') THEN
    ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payslip_staffId_fkey') THEN
    ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayslipLine_payslipId_fkey') THEN
    ALTER TABLE "PayslipLine" ADD CONSTRAINT "PayslipLine_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobOpening_departmentId_fkey') THEN
    ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobOpening_branchId_fkey') THEN
    ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobOpening_gradeId_fkey') THEN
    ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "SalaryGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobOpening_hiringManagerId_fkey') THEN
    ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobApplication_openingId_fkey') THEN
    ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "JobOpening"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobApplication_hiredStaffId_fkey') THEN
    ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_hiredStaffId_fkey" FOREIGN KEY ("hiredStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Interview_applicationId_fkey') THEN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Interview_interviewerId_fkey') THEN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OnboardingTemplate_departmentId_fkey') THEN
    ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OnboardingTemplateTask_templateId_fkey') THEN
    ALTER TABLE "OnboardingTemplateTask" ADD CONSTRAINT "OnboardingTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffOnboarding_staffId_fkey') THEN
    ALTER TABLE "StaffOnboarding" ADD CONSTRAINT "StaffOnboarding_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffOnboarding_templateId_fkey') THEN
    ALTER TABLE "StaffOnboarding" ADD CONSTRAINT "StaffOnboarding_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OnboardingTask_onboardingId_fkey') THEN
    ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "StaffOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OnboardingTask_assigneeId_fkey') THEN
    ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OnboardingTask_completedById_fkey') THEN
    ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrainingProgram_facilitatorId_fkey') THEN
    ALTER TABLE "TrainingProgram" ADD CONSTRAINT "TrainingProgram_facilitatorId_fkey" FOREIGN KEY ("facilitatorId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrainingEnrollment_programId_fkey') THEN
    ALTER TABLE "TrainingEnrollment" ADD CONSTRAINT "TrainingEnrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "TrainingProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrainingEnrollment_staffId_fkey') THEN
    ALTER TABLE "TrainingEnrollment" ADD CONSTRAINT "TrainingEnrollment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyAsset_branchId_fkey') THEN
    ALTER TABLE "CompanyAsset" ADD CONSTRAINT "CompanyAsset_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetAssignment_assetId_fkey') THEN
    ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "CompanyAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetAssignment_staffId_fkey') THEN
    ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetAssignment_assignedById_fkey') THEN
    ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Announcement_authorId_fkey') THEN
    ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AnnouncementAck_announcementId_fkey') THEN
    ALTER TABLE "AnnouncementAck" ADD CONSTRAINT "AnnouncementAck_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AnnouncementAck_staffId_fkey') THEN
    ALTER TABLE "AnnouncementAck" ADD CONSTRAINT "AnnouncementAck_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffMovement_staffId_fkey') THEN
    ALTER TABLE "StaffMovement" ADD CONSTRAINT "StaffMovement_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffMovement_createdById_fkey') THEN
    ALTER TABLE "StaffMovement" ADD CONSTRAINT "StaffMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffExit_staffId_fkey') THEN
    ALTER TABLE "StaffExit" ADD CONSTRAINT "StaffExit_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffExit_processedById_fkey') THEN
    ALTER TABLE "StaffExit" ADD CONSTRAINT "StaffExit_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffGoal_staffId_fkey') THEN
    ALTER TABLE "StaffGoal" ADD CONSTRAINT "StaffGoal_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffGoal_createdById_fkey') THEN
    ALTER TABLE "StaffGoal" ADD CONSTRAINT "StaffGoal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

