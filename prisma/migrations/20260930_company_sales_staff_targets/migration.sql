-- Company (direct) sales, and sales targets for any staff member.
--
-- MarketingSale.marketerId becomes optional: null marks a company (direct)
-- sale, recorded by an admin and credited to no one, which earns no
-- commission. The foreign key stays RESTRICT, so removing a staff member can
-- never quietly turn their sales into company sales.
--
-- MarketingSale.reportedById records who entered each sale: the seller
-- themselves, or the admin for a company sale. Added nullable, backfilled
-- from marketerId for sales already recorded, then made required.
--
-- Staff.onSalesTarget is the per-person switch for the target engine: on
-- means the person may report sales, gets monthly targets and appears on the
-- leaderboard. Everyone in Marketing starts on; everyone else starts off.
--
-- Additive apart from relaxing NOT NULL on marketerId. Idempotent.

-- Staff: the target switch.
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "onSalesTarget" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Staff" SET "onSalesTarget" = true
WHERE "departmentId" IN (SELECT "id" FROM "Department" WHERE "code" = 'MARKETING')
  AND "onSalesTarget" = false;

-- MarketingSale: who recorded it.
ALTER TABLE "MarketingSale" ADD COLUMN IF NOT EXISTS "reportedById" TEXT;
UPDATE "MarketingSale" SET "reportedById" = "marketerId" WHERE "reportedById" IS NULL;
ALTER TABLE "MarketingSale" ALTER COLUMN "reportedById" SET NOT NULL;

-- MarketingSale: the seller is optional (null = company sale).
ALTER TABLE "MarketingSale" ALTER COLUMN "marketerId" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketingSale_reportedById_fkey') THEN
    ALTER TABLE "MarketingSale" ADD CONSTRAINT "MarketingSale_reportedById_fkey"
      FOREIGN KEY ("reportedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Staff_onSalesTarget_idx" ON "Staff"("onSalesTarget");
