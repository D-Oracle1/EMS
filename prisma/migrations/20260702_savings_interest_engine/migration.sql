-- Migration: Savings Interest Engine — dedicated interest ledger, per-product
-- calculation method, and persisted maturity progress.
-- Hylink Finance Limited EMS
-- Generated: 2026-07-02

-- ============================================================================
-- 1. Enums
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InterestCalculationMethod') THEN
    CREATE TYPE "InterestCalculationMethod" AS ENUM ('MATURITY_ONLY', 'MONTHLY_ALLOCATION', 'FLAT', 'COMPOUND');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InterestPostingStatus') THEN
    CREATE TYPE "InterestPostingStatus" AS ENUM ('ACCRUED', 'CREDITED', 'REVERSED');
  END IF;
END $$;

-- ============================================================================
-- 2. SavingsProduct: interest calculation method
-- ============================================================================
ALTER TABLE "SavingsProduct"
  ADD COLUMN IF NOT EXISTS "interestCalculationMethod" "InterestCalculationMethod" NOT NULL DEFAULT 'MATURITY_ONLY';

-- ============================================================================
-- 3. SavingsAccount: persisted maturity progress
-- ============================================================================
ALTER TABLE "SavingsAccount"
  ADD COLUMN IF NOT EXISTS "monthsCompleted" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "monthsRemaining" INTEGER;

-- ============================================================================
-- 4. SavingsInterest ledger (immutable per-account monthly interest)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "SavingsInterest" (
  "id"                TEXT NOT NULL,
  "accountId"         TEXT NOT NULL,
  "year"              INTEGER NOT NULL,
  "month"             INTEGER NOT NULL,
  "eligibleBalance"   DECIMAL(18,2) NOT NULL,
  "interestRate"      DECIMAL(5,2) NOT NULL,
  "interestAmount"    DECIMAL(18,2) NOT NULL,
  "calculationMethod" "InterestCalculationMethod" NOT NULL DEFAULT 'MATURITY_ONLY',
  "status"            "InterestPostingStatus" NOT NULL DEFAULT 'ACCRUED',
  "transactionId"     TEXT,
  "generatedById"     TEXT,
  "generatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavingsInterest_pkey" PRIMARY KEY ("id")
);

-- Idempotency guard: one interest posting per account per period
CREATE UNIQUE INDEX IF NOT EXISTS "SavingsInterest_accountId_year_month_key"
  ON "SavingsInterest"("accountId", "year", "month");
CREATE INDEX IF NOT EXISTS "SavingsInterest_accountId_idx" ON "SavingsInterest"("accountId");
CREATE INDEX IF NOT EXISTS "SavingsInterest_year_month_idx" ON "SavingsInterest"("year", "month");
CREATE INDEX IF NOT EXISTS "SavingsInterest_status_idx" ON "SavingsInterest"("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SavingsInterest_accountId_fkey') THEN
    ALTER TABLE "SavingsInterest"
      ADD CONSTRAINT "SavingsInterest_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES "SavingsAccount"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
