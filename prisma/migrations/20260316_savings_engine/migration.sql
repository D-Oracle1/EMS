-- Migration: Savings Engine + Termination System + Financial Product Settings Engine
-- Hylink Finance Limited EMS
-- Generated: 2026-03-16

-- ============================================================================
-- 1. Extend SavingsProduct with fixed-term fields
-- ============================================================================
ALTER TABLE "SavingsProduct"
  ADD COLUMN IF NOT EXISTS "durationMonths" INTEGER,
  ADD COLUMN IF NOT EXISTS "totalInterestRate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "monthlyInterestRate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "interestEligibilityDelayMonths" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "allowEarlyTermination" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "defaultTerminationPenaltyRate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- ============================================================================
-- 2. Extend SavingsAccount with fixed-term fields
-- ============================================================================
ALTER TABLE "SavingsAccount"
  ADD COLUMN IF NOT EXISTS "eligibleBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pendingDeposits" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalDeposits" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "maturityDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- Index for maturity date queries
CREATE INDEX IF NOT EXISTS "SavingsAccount_maturityDate_idx" ON "SavingsAccount"("maturityDate");

-- ============================================================================
-- 3. Extend AccountStatus enum
-- ============================================================================
DO $$ BEGIN
  ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'MATURED';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'TERMINATION_REQUESTED';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'TERMINATED';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 4. Extend SavingsTransactionType enum
-- ============================================================================
DO $$ BEGIN
  ALTER TYPE "SavingsTransactionType" ADD VALUE IF NOT EXISTS 'INTEREST_ACCRUAL';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "SavingsTransactionType" ADD VALUE IF NOT EXISTS 'MATURITY_PAYOUT';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "SavingsTransactionType" ADD VALUE IF NOT EXISTS 'TERMINATION_PAYOUT';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 5. Create TerminationStatus enum
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE "TerminationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 6. Create SavingsTermination table
-- ============================================================================
CREATE TABLE IF NOT EXISTS "SavingsTermination" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "requestNumber"    TEXT NOT NULL,
  "accountId"        TEXT NOT NULL,
  "requestedById"    TEXT NOT NULL,
  "requestDate"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "principalAmount"  DECIMAL(18,2) NOT NULL,
  "accruedInterest"  DECIMAL(18,2) NOT NULL DEFAULT 0,
  "approvedInterest" DECIMAL(18,2),
  "penaltyAmount"    DECIMAL(18,2),
  "payoutAmount"     DECIMAL(18,2),
  "notes"            TEXT,
  "rejectionReason"  TEXT,
  "status"           "TerminationStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById"     TEXT,
  "approvedAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SavingsTermination_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavingsTermination_requestNumber_key" UNIQUE ("requestNumber"),
  CONSTRAINT "SavingsTermination_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SavingsAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SavingsTermination_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SavingsTermination_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SavingsTermination_accountId_idx" ON "SavingsTermination"("accountId");
CREATE INDEX IF NOT EXISTS "SavingsTermination_status_idx" ON "SavingsTermination"("status");
CREATE INDEX IF NOT EXISTS "SavingsTermination_requestDate_idx" ON "SavingsTermination"("requestDate");

-- ============================================================================
-- 7. Seed: Add SAVINGS_TXN sequence if not exists
-- ============================================================================
INSERT INTO "Sequence" ("id", "code", "prefix", "currentValue", "padLength", "description")
VALUES (gen_random_uuid()::text, 'SAVINGS_TXN', 'STX', 0, 7, 'Fixed Savings Transaction Reference')
ON CONFLICT ("code") DO NOTHING;
