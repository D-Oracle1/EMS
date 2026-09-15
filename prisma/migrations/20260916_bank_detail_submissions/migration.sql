-- Staff bank details, submitted by staff and confirmed by HR.
--
-- The confirmed values stay on Staff (bankName, bankAccountNumber,
-- bankAccountName). A submission writes there only when HR approves it, and
-- payroll reads Staff — so an unconfirmed account number cannot reach a bank
-- draft. That is why this is a table rather than a set of "pending" columns:
-- a salary destination is worth a second pair of eyes, and every change to one
-- should leave a record of who asked, who approved, and what it replaced —
-- including the attempts that were rejected.
--
-- Taken verbatim from `prisma migrate diff`, which is trustworthy again now
-- that the schema drift was resolved on 2026-09-15; before that a generated
-- diff also carried unrelated DROP statements and had to be written by hand.
--
-- Foreign key behaviour is deliberate: RESTRICT on staffId so a submission
-- cannot be orphaned from the person it belongs to, SET NULL on reviewedById
-- so losing a reviewer's record never destroys the audit trail.

-- CreateEnum
CREATE TYPE "BankDetailStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "BankDetailSubmission" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "status" "BankDetailStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "previousAccountNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankDetailSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankDetailSubmission_staffId_status_idx" ON "BankDetailSubmission"("staffId", "status");

-- CreateIndex
CREATE INDEX "BankDetailSubmission_status_idx" ON "BankDetailSubmission"("status");

-- AddForeignKey
ALTER TABLE "BankDetailSubmission" ADD CONSTRAINT "BankDetailSubmission_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankDetailSubmission" ADD CONSTRAINT "BankDetailSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
