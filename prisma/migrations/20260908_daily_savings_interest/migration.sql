-- Migration: daily savings interest, credited and notified every day
-- Hylink Finance Limited EMS
-- Generated: 2026-09-08
--
-- Idempotent, per the repo convention. Apply with:
--   npx prisma db execute --file prisma/migrations/20260908_daily_savings_interest/migration.sql --schema prisma/schema.prisma
--   npx prisma migrate resolve --applied 20260908_daily_savings_interest
--
-- Interest moves from a monthly posting to a daily one, and the contracted
-- rate is now hit exactly.
--
-- The rate is spread across the earning window rather than the whole term. A
-- 12-month plan at 17% starting 8 Sep earns from 8 Oct to 8 Sep — 335 days —
-- so the daily rate is 17/335 = 0.050746269%. Those 335 days sum to exactly
-- 17%. The dormant first month is kept deliberately: money deposited today
-- starts counting next month.
--
-- Daily amounts are rounded to the kobo and drift about a naira over a full
-- term, so the final earning day posts the difference against
-- interestTargetTotal. A saver always receives precisely the agreed rate.

-- ── 1. The daily earning contract, stamped on each account ──────────────────
ALTER TABLE "SavingsAccount" ADD COLUMN IF NOT EXISTS "earningStartDate" TIMESTAMP(3);
ALTER TABLE "SavingsAccount" ADD COLUMN IF NOT EXISTS "earningDays" INTEGER;
ALTER TABLE "SavingsAccount" ADD COLUMN IF NOT EXISTS "contractedDailyRate" DECIMAL(12,9);
ALTER TABLE "SavingsAccount" ADD COLUMN IF NOT EXISTS "interestTargetTotal" DECIMAL(18,2);
ALTER TABLE "SavingsAccount" ADD COLUMN IF NOT EXISTS "interestPaidToDate" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "SavingsAccount" ADD COLUMN IF NOT EXISTS "pendingSince" TIMESTAMP(3);

-- ── 2. Daily interest ledger ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SavingsDailyInterest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "eligibleBalance" DECIMAL(18,2) NOT NULL,
    "dailyRate" DECIMAL(12,9) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "isTrueUp" BOOLEAN NOT NULL DEFAULT false,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavingsDailyInterest_pkey" PRIMARY KEY ("id")
);

-- The idempotency gate: one credit per account per day, ever.
CREATE UNIQUE INDEX IF NOT EXISTS "SavingsDailyInterest_accountId_date_key"
    ON "SavingsDailyInterest"("accountId", "date");
CREATE INDEX IF NOT EXISTS "SavingsDailyInterest_accountId_idx"
    ON "SavingsDailyInterest"("accountId");
CREATE INDEX IF NOT EXISTS "SavingsDailyInterest_date_idx"
    ON "SavingsDailyInterest"("date");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SavingsDailyInterest_accountId_fkey'
  ) THEN
    ALTER TABLE "SavingsDailyInterest"
      ADD CONSTRAINT "SavingsDailyInterest_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES "SavingsAccount"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 3. Customer notifications ───────────────────────────────────────────────
-- Staff notifications live in "Notification", which is keyed to a staff id and
-- sends staff email alerts. A saver is not a staff member, so their messages
-- need their own table.
CREATE TABLE IF NOT EXISTS "CustomerNotification" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerNotification_customerId_idx"
    ON "CustomerNotification"("customerId");
CREATE INDEX IF NOT EXISTS "CustomerNotification_isRead_idx"
    ON "CustomerNotification"("isRead");
CREATE INDEX IF NOT EXISTS "CustomerNotification_createdAt_idx"
    ON "CustomerNotification"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerNotification_customerId_fkey'
  ) THEN
    ALTER TABLE "CustomerNotification"
      ADD CONSTRAINT "CustomerNotification_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 4. Backfill the contract onto existing fixed-term accounts ──────────────
-- Postgres clamps a month addition to the end of a shorter month (31 Jan plus
-- one month is 28 Feb), which is the behaviour the engine relies on.
UPDATE "SavingsAccount"
   SET "earningStartDate" = "startDate" + INTERVAL '1 month'
 WHERE "startDate" IS NOT NULL
   AND "maturityDate" IS NOT NULL
   AND "earningStartDate" IS NULL;

UPDATE "SavingsAccount"
   SET "earningDays" = GREATEST(0, DATE_PART('day', "maturityDate" - "earningStartDate")::INTEGER)
 WHERE "earningStartDate" IS NOT NULL
   AND "maturityDate" IS NOT NULL
   AND "earningDays" IS NULL;

UPDATE "SavingsAccount"
   SET "contractedDailyRate" = ROUND("contractedTotalRate" / "earningDays", 9)
 WHERE "earningDays" IS NOT NULL
   AND "earningDays" > 0
   AND "contractedTotalRate" IS NOT NULL
   AND "contractedDailyRate" IS NULL;

-- What the account must have paid by maturity, on the deposits it holds.
UPDATE "SavingsAccount"
   SET "interestTargetTotal" = ROUND(COALESCE("totalDeposits", "currentBalance") * "contractedTotalRate" / 100, 2)
 WHERE "contractedTotalRate" IS NOT NULL
   AND "maturityDate" IS NOT NULL
   AND "interestTargetTotal" IS NULL;

-- Reconcile totalDeposits against the deposits actually recorded. Fixed-term
-- accounts opened through the ordinary savings form never had this field
-- maintained, so the balance can exceed it by the value of real deposits.
UPDATE "SavingsAccount" a
   SET "totalDeposits" = t.deposited
  FROM (
        SELECT "accountId", SUM("amount") AS deposited
          FROM "SavingsTransaction"
         WHERE "transactionType" = 'DEPOSIT'
         GROUP BY "accountId"
       ) t
 WHERE a."id" = t."accountId"
   AND a."maturityDate" IS NOT NULL
   AND COALESCE(a."totalDeposits", 0) < t.deposited;

-- Interest already given, read from the interest postings themselves. Inferring
-- it from (balance - deposits) would count any deposit the field had missed as
-- interest, and then refuse to pay the saver anything more.
UPDATE "SavingsAccount" a
   SET "interestPaidToDate" = COALESCE(t.credited, 0)
  FROM (
        SELECT s."id" AS account_id,
               (SELECT COALESCE(SUM(x."amount"), 0)
                  FROM "SavingsTransaction" x
                 WHERE x."accountId" = s."id"
                   AND x."transactionType" IN ('INTEREST_CREDIT', 'INTEREST_ACCRUAL')
               ) AS credited
          FROM "SavingsAccount" s
         WHERE s."maturityDate" IS NOT NULL
       ) t
 WHERE a."id" = t.account_id
   AND a."interestPaidToDate" = 0;

-- The target follows the reconciled deposits.
UPDATE "SavingsAccount"
   SET "interestTargetTotal" = ROUND(COALESCE("totalDeposits", "currentBalance") * "contractedTotalRate" / 100, 2)
 WHERE "contractedTotalRate" IS NOT NULL
   AND "maturityDate" IS NOT NULL;

-- Money still dormant has been waiting since the account opened.
UPDATE "SavingsAccount"
   SET "pendingSince" = "startDate"
 WHERE "pendingDeposits" > 0
   AND "pendingSince" IS NULL
   AND "startDate" IS NOT NULL;
