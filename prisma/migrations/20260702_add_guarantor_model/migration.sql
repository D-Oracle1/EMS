-- Migration: Add Guarantor model (multiple guarantors per loan)
-- Hylink Finance Limited EMS
-- Generated: 2026-07-02

-- ============================================================================
-- Guarantor table — a loan can have multiple guarantors, each optionally
-- linked to a registered Customer record.
-- ============================================================================
CREATE TABLE IF NOT EXISTS "Guarantor" (
  "id"            TEXT NOT NULL,
  "loanId"        TEXT NOT NULL,
  "customerId"    TEXT,
  "title"         TEXT,
  "firstName"     TEXT NOT NULL,
  "lastName"      TEXT NOT NULL,
  "middleName"    TEXT,
  "relationship"  TEXT,
  "phone"         TEXT NOT NULL,
  "email"         TEXT,
  "address"       TEXT,
  "city"          TEXT,
  "state"         TEXT,
  "occupation"    TEXT,
  "employer"      TEXT,
  "monthlyIncome" DECIMAL(18,2),
  "bvn"           TEXT,
  "nationalId"    TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Guarantor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Guarantor_loanId_idx" ON "Guarantor"("loanId");
CREATE INDEX IF NOT EXISTS "Guarantor_customerId_idx" ON "Guarantor"("customerId");

-- Foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Guarantor_loanId_fkey'
  ) THEN
    ALTER TABLE "Guarantor"
      ADD CONSTRAINT "Guarantor_loanId_fkey"
      FOREIGN KEY ("loanId") REFERENCES "Loan"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Guarantor_customerId_fkey'
  ) THEN
    ALTER TABLE "Guarantor"
      ADD CONSTRAINT "Guarantor_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
