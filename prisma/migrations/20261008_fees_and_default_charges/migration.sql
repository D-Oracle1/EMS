-- Application form fees, their payments and discounts, and loan default
-- charges (lib/fees, lib/loan-penalties). Runs after
-- 20261007_customer_application_forms, which added the form kinds the fee
-- rows below are keyed by.

-- CreateEnum
CREATE TYPE "FeeKind" AS ENUM ('FLAT', 'PERCENT');

-- AlterTable
ALTER TABLE "LoanSchedule" ADD COLUMN     "penaltyDue" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "penaltyWaived" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FormResponse" ADD COLUMN     "discountAt" TIMESTAMP(3),
ADD COLUMN     "discountById" TEXT,
ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "feeBasis" TEXT,
ADD COLUMN     "feeDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "feeDue" DECIMAL(18,2),
ADD COLUMN     "loanId" TEXT;

-- CreateTable
CREATE TABLE "ApplicationFee" (
    "purpose" "FormPurpose" NOT NULL,
    "kind" "FeeKind" NOT NULL DEFAULT 'FLAT',
    "amount" DECIMAL(18,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationFee_pkey" PRIMARY KEY ("purpose")
);

-- CreateTable
CREATE TABLE "FeePayment" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL,
    "paymentReference" TEXT,
    "branchId" TEXT,
    "receivedById" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journalEntryId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "FeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPenaltyCharge" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "chargeDate" DATE NOT NULL,
    "overdueAmount" DECIMAL(18,2) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanPenaltyCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPenaltyWaiver" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "waivedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanPenaltyWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeePayment_receiptNumber_key" ON "FeePayment"("receiptNumber");

-- CreateIndex
CREATE INDEX "FeePayment_responseId_idx" ON "FeePayment"("responseId");

-- CreateIndex
CREATE INDEX "FeePayment_receivedAt_idx" ON "FeePayment"("receivedAt");

-- CreateIndex
CREATE INDEX "FeePayment_branchId_idx" ON "FeePayment"("branchId");

-- CreateIndex
CREATE INDEX "LoanPenaltyCharge_loanId_idx" ON "LoanPenaltyCharge"("loanId");

-- CreateIndex
CREATE INDEX "LoanPenaltyCharge_chargeDate_idx" ON "LoanPenaltyCharge"("chargeDate");

-- CreateIndex
CREATE UNIQUE INDEX "LoanPenaltyCharge_scheduleId_chargeDate_key" ON "LoanPenaltyCharge"("scheduleId", "chargeDate");

-- CreateIndex
CREATE INDEX "LoanPenaltyWaiver_loanId_idx" ON "LoanPenaltyWaiver"("loanId");

-- CreateIndex
CREATE INDEX "LoanPenaltyWaiver_createdAt_idx" ON "LoanPenaltyWaiver"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FormResponse_loanId_key" ON "FormResponse"("loanId");

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_discountById_fkey" FOREIGN KEY ("discountById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "FormResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPenaltyCharge" ADD CONSTRAINT "LoanPenaltyCharge_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPenaltyCharge" ADD CONSTRAINT "LoanPenaltyCharge_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "LoanSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPenaltyWaiver" ADD CONSTRAINT "LoanPenaltyWaiver_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPenaltyWaiver" ADD CONSTRAINT "LoanPenaltyWaiver_waivedById_fkey" FOREIGN KEY ("waivedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The fees on the paper forms, ready for an admin to change under Settings > Fees.
INSERT INTO "ApplicationFee" ("purpose", "kind", "amount", "isActive", "updatedAt") VALUES
  ('SAVINGS_APPLICATION', 'FLAT', 1000, true, CURRENT_TIMESTAMP),
  ('PARTNERSHIP_APPLICATION', 'FLAT', 0, false, CURRENT_TIMESTAMP),
  ('FIXED_DEPOSIT_APPLICATION', 'FLAT', 0, false, CURRENT_TIMESTAMP),
  ('LOAN_APPLICATION', 'PERCENT', 7, true, CURRENT_TIMESTAMP),
  ('GUARANTOR', 'FLAT', 2000, true, CURRENT_TIMESTAMP)
ON CONFLICT ("purpose") DO NOTHING;
