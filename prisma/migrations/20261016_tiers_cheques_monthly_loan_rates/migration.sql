-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "tier" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "personal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LoanProduct" ALTER COLUMN "interestRate" SET DATA TYPE DECIMAL(7,4);

-- AlterTable
ALTER TABLE "Loan" ALTER COLUMN "interestRate" SET DATA TYPE DECIMAL(7,4);

-- AlterTable
ALTER TABLE "LoanRestructuring" ALTER COLUMN "previousInterestRate" SET DATA TYPE DECIMAL(7,4),
ALTER COLUMN "newInterestRate" SET DATA TYPE DECIMAL(7,4);

-- CreateTable
CREATE TABLE "LoanCheque" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "guarantorId" TEXT,
    "bankName" TEXT NOT NULL,
    "chequeNumber" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "chequeDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanCheque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoanCheque_loanId_idx" ON "LoanCheque"("loanId");

-- CreateIndex
CREATE INDEX "LoanCheque_guarantorId_idx" ON "LoanCheque"("guarantorId");

-- AddForeignKey
ALTER TABLE "LoanCheque" ADD CONSTRAINT "LoanCheque_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanCheque" ADD CONSTRAINT "LoanCheque_guarantorId_fkey" FOREIGN KEY ("guarantorId") REFERENCES "Guarantor"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Data ─────────────────────────────────────────────────────────────────

-- Loan rates are now monthly. Every stored rate was yearly, so divide by 12:
-- 24% a year becomes 2% a month. Stored schedules, totals and instalments are
-- untouched, so no borrower owes a kobo more or less.
UPDATE "LoanProduct" SET "interestRate" = ROUND("interestRate" / 12, 4);
UPDATE "Loan" SET "interestRate" = ROUND("interestRate" / 12, 4);
UPDATE "LoanRestructuring"
SET "previousInterestRate" = ROUND("previousInterestRate" / 12, 4),
    "newInterestRate" = ROUND("newInterestRate" / 12, 4);

-- Existing customers get the highest tier their IDs support.
UPDATE "Customer" SET "tier" = CASE
  WHEN COALESCE(TRIM("bvn"), '') <> '' AND COALESCE(TRIM("nationalId"), '') <> '' THEN 3
  WHEN COALESCE(TRIM("bvn"), '') <> '' OR COALESCE(TRIM("nationalId"), '') <> '' THEN 2
  ELSE 1
END;

-- New department.
INSERT INTO "Department" ("id", "code", "name", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'BSC_SOCIAL', 'Business Service Consultant / Social Media', true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

-- 6-month fixed savings at 8% a month: 48% over the term.
INSERT INTO "SavingsProduct" (
  "id", "code", "name", "description", "savingsType",
  "minBalance", "minDeposit", "interestRate", "interestFrequency",
  "allowWithdrawal", "withdrawalNotice", "monthlyFee", "transactionFee",
  "durationMonths", "totalInterestRate", "monthlyInterestRate",
  "interestCalculationMethod", "interestEligibilityDelayMonths",
  "allowEarlyTermination", "promoActive", "isActive", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid()::text, 'FS-6M-8PM', '6 Months Fixed Savings (8% Monthly)',
  '6-month fixed savings at 8% a month, 48% over the term.', 'FIXED',
  10000, 10000, 8, 'MONTHLY',
  false, 0, 0, 0,
  6, 48, 8,
  'COMPOUND', 0,
  false, false, true, NOW(), NOW()
)
ON CONFLICT ("code") DO NOTHING;

-- Early termination is withdrawn from savings.
UPDATE "SavingsProduct" SET "allowEarlyTermination" = false, "defaultTerminationPenaltyRate" = NULL;
