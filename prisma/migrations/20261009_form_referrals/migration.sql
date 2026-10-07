-- Personal form links: who referred each application, and the savings
-- account or fixed deposit opened from it (lib/referrals).

-- AlterTable
ALTER TABLE "FormResponse" ADD COLUMN     "fixedDepositId" TEXT,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "savingsAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FormResponse_savingsAccountId_key" ON "FormResponse"("savingsAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "FormResponse_fixedDepositId_key" ON "FormResponse"("fixedDepositId");

-- CreateIndex
CREATE INDEX "FormResponse_referredById_idx" ON "FormResponse"("referredById");

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_savingsAccountId_fkey" FOREIGN KEY ("savingsAccountId") REFERENCES "SavingsAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_fixedDepositId_fkey" FOREIGN KEY ("fixedDepositId") REFERENCES "FixedDeposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

