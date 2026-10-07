-- Customer application forms: savings, mutual partnership, fixed deposit,
-- loan and guarantor (lib/customer-forms). Adding several enum values in one
-- migration is fine on PostgreSQL 12+, as long as nothing here uses them.


ALTER TYPE "FormPurpose" ADD VALUE 'SAVINGS_APPLICATION';
ALTER TYPE "FormPurpose" ADD VALUE 'PARTNERSHIP_APPLICATION';
ALTER TYPE "FormPurpose" ADD VALUE 'FIXED_DEPOSIT_APPLICATION';
ALTER TYPE "FormPurpose" ADD VALUE 'LOAN_APPLICATION';
ALTER TYPE "FormPurpose" ADD VALUE 'GUARANTOR';

-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "FormResponse" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "guarantorForId" TEXT,
ADD COLUMN     "reference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FormResponse_reference_key" ON "FormResponse"("reference");

-- CreateIndex
CREATE INDEX "FormResponse_customerId_idx" ON "FormResponse"("customerId");

-- CreateIndex
CREATE INDEX "FormResponse_guarantorForId_idx" ON "FormResponse"("guarantorForId");

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_guarantorForId_fkey" FOREIGN KEY ("guarantorForId") REFERENCES "FormResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

