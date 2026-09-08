-- Migration: savings promo rates + terms contracted at opening
-- Hylink Finance Limited EMS
-- Generated: 2026-09-08
--
-- Idempotent, per the repo convention. Apply with:
--   npx prisma db execute --file prisma/migrations/20260908_savings_promo_and_contracted_rates/migration.sql --schema prisma/schema.prisma
--   npx prisma migrate resolve --applied 20260908_savings_promo_and_contracted_rates
--
-- Two changes that depend on each other:
--
--   1. A savings product can run a promo: a better rate for savers who OPEN an
--      account inside a date window.
--
--   2. Every savings account now carries the rate and duration it was opened
--      on. The interest engine previously read the LIVE product rate, so
--      editing a product silently rewrote what every existing saver earned —
--      which is why editing a product in use had to be blocked outright, and
--      why the seeded starter plans could never be replaced. With the terms
--      stamped on the account, a product edit no longer reaches backwards, and
--      a promo can end without disturbing anyone who already joined.

-- ── 1. Promo window on the product ──────────────────────────────────────────
ALTER TABLE "SavingsProduct" ADD COLUMN IF NOT EXISTS "promoName" TEXT;
ALTER TABLE "SavingsProduct" ADD COLUMN IF NOT EXISTS "promoTotalInterestRate" DECIMAL(5,2);
ALTER TABLE "SavingsProduct" ADD COLUMN IF NOT EXISTS "promoStartsAt" TIMESTAMP(3);
ALTER TABLE "SavingsProduct" ADD COLUMN IF NOT EXISTS "promoEndsAt" TIMESTAMP(3);
ALTER TABLE "SavingsProduct" ADD COLUMN IF NOT EXISTS "promoActive" BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Terms contracted at opening ──────────────────────────────────────────
ALTER TABLE "SavingsAccount" ADD COLUMN IF NOT EXISTS "contractedTotalRate" DECIMAL(5,2);
ALTER TABLE "SavingsAccount" ADD COLUMN IF NOT EXISTS "contractedMonthlyRate" DECIMAL(9,6);
ALTER TABLE "SavingsAccount" ADD COLUMN IF NOT EXISTS "contractedDurationMonths" INTEGER;
ALTER TABLE "SavingsAccount" ADD COLUMN IF NOT EXISTS "isPromoRate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SavingsAccount" ADD COLUMN IF NOT EXISTS "promoName" TEXT;

-- ── 3. Monthly rates need six decimal places ────────────────────────────────
-- The monthly rate is derived as totalInterestRate / durationMonths and was
-- computed to 6dp in code but stored at 2dp: a 12-month plan at 17% produced
-- 1.416667 and was saved as 1.42, overpaying every saver on that plan. Widening
-- the column is safe — no existing value loses precision, they only stop being
-- rounded from here on. Existing rows keep their already-rounded value; the
-- backfill below re-derives them from the total rate and duration.
ALTER TABLE "SavingsProduct" ALTER COLUMN "monthlyInterestRate" TYPE DECIMAL(9,6);
ALTER TABLE "SavingsInterest" ALTER COLUMN "interestRate" TYPE DECIMAL(9,6);

-- Re-derive stored monthly rates at full precision.
UPDATE "SavingsProduct"
   SET "monthlyInterestRate" = ROUND("totalInterestRate" / "durationMonths", 6)
 WHERE "durationMonths" IS NOT NULL
   AND "durationMonths" > 0
   AND "totalInterestRate" IS NOT NULL;

-- ── 4. Backfill existing accounts with the terms they were opened on ────────
-- Existing savers are on their product's current terms by definition, since
-- that is what the engine has been applying to them. Freezing those terms onto
-- the account now preserves exactly what they are earning today.
UPDATE "SavingsAccount" a
   SET "contractedTotalRate"      = p."totalInterestRate",
       "contractedMonthlyRate"    = p."monthlyInterestRate",
       "contractedDurationMonths" = p."durationMonths"
  FROM "SavingsProduct" p
 WHERE a."productId" = p."id"
   AND a."contractedMonthlyRate" IS NULL
   AND p."durationMonths" IS NOT NULL;

-- Find accounts opened during a promo quickly when reporting on take-up.
CREATE INDEX IF NOT EXISTS "SavingsAccount_isPromoRate_idx" ON "SavingsAccount"("isPromoRate");
