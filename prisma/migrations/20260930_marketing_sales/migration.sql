-- Marketing: sales reported by marketers, confirmed by senior staff.
--
-- A marketer reports a sale against a record that already exists (a savings
-- account, loan or fixed deposit they brought in) or money they collected in
-- the field. Nothing touches a balance until a senior reviewer confirms it;
-- a field collection is then posted through the normal savings deposit or
-- loan repayment path, and postedReference records what was posted. Every
-- confirmed sale records the marketer's commission.
--
-- Purely additive: two tables and two enums, no change to existing tables.
-- Taken verbatim from `prisma migrate diff` against the previous schema.
--
-- Foreign keys: RESTRICT on the marketer and customer so a sale cannot be
-- orphaned from who made it or who it was for; SET NULL on reviewers and
-- linked accounts so losing one never destroys the sales record.

-- CreateEnum
CREATE TYPE "MarketingSaleType" AS ENUM ('SAVINGS', 'LOAN', 'FIXED_DEPOSIT', 'FIELD_COLLECTION');

-- CreateEnum
CREATE TYPE "MarketingSaleStatus" AS ENUM ('PENDING', 'CONFIRMING', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "MarketingSale" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "MarketingSaleType" NOT NULL,
    "status" "MarketingSaleStatus" NOT NULL DEFAULT 'PENDING',
    "marketerId" TEXT NOT NULL,
    "branchId" TEXT,
    "customerId" TEXT NOT NULL,
    "savingsAccountId" TEXT,
    "loanId" TEXT,
    "fixedDepositId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "paymentReference" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "postedReference" TEXT,
    "commissionRate" DECIMAL(5,2),
    "commissionAmount" DECIMAL(18,2),
    "commissionPaidAt" TIMESTAMP(3),
    "commissionPaidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingTarget" (
    "id" TEXT NOT NULL,
    "marketerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "targetAmount" DECIMAL(18,2) NOT NULL,
    "targetCount" INTEGER,
    "setById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSale_reference_key" ON "MarketingSale"("reference");

-- CreateIndex
CREATE INDEX "MarketingSale_marketerId_status_idx" ON "MarketingSale"("marketerId", "status");

-- CreateIndex
CREATE INDEX "MarketingSale_status_idx" ON "MarketingSale"("status");

-- CreateIndex
CREATE INDEX "MarketingSale_collectedAt_idx" ON "MarketingSale"("collectedAt");

-- CreateIndex
CREATE INDEX "MarketingSale_branchId_idx" ON "MarketingSale"("branchId");

-- CreateIndex
CREATE INDEX "MarketingSale_savingsAccountId_idx" ON "MarketingSale"("savingsAccountId");

-- CreateIndex
CREATE INDEX "MarketingSale_loanId_idx" ON "MarketingSale"("loanId");

-- CreateIndex
CREATE INDEX "MarketingSale_fixedDepositId_idx" ON "MarketingSale"("fixedDepositId");

-- CreateIndex
CREATE INDEX "MarketingTarget_month_idx" ON "MarketingTarget"("month");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingTarget_marketerId_month_key" ON "MarketingTarget"("marketerId", "month");

-- AddForeignKey
ALTER TABLE "MarketingSale" ADD CONSTRAINT "MarketingSale_marketerId_fkey" FOREIGN KEY ("marketerId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSale" ADD CONSTRAINT "MarketingSale_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSale" ADD CONSTRAINT "MarketingSale_commissionPaidById_fkey" FOREIGN KEY ("commissionPaidById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSale" ADD CONSTRAINT "MarketingSale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSale" ADD CONSTRAINT "MarketingSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSale" ADD CONSTRAINT "MarketingSale_savingsAccountId_fkey" FOREIGN KEY ("savingsAccountId") REFERENCES "SavingsAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSale" ADD CONSTRAINT "MarketingSale_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSale" ADD CONSTRAINT "MarketingSale_fixedDepositId_fkey" FOREIGN KEY ("fixedDepositId") REFERENCES "FixedDeposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTarget" ADD CONSTRAINT "MarketingTarget_marketerId_fkey" FOREIGN KEY ("marketerId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTarget" ADD CONSTRAINT "MarketingTarget_setById_fkey" FOREIGN KEY ("setById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reference numbers for reported sales (MKT0001, ...). Idempotent.
INSERT INTO "Sequence" ("id", "code", "prefix", "currentValue", "padLength", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'MARKETING_SALE', 'MKT', 0, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- The Marketing department. Staff in it report sales. Idempotent.
INSERT INTO "Department" ("id", "code", "name", "description", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'MARKETING', 'Marketing', 'Brings in customers and reports sales for confirmation', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- A role for marketers. Marketing access comes from the department, so the
-- role needs no module permissions of its own. Idempotent.
INSERT INTO "Role" ("id", "code", "name", "description", "level", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'MARKETING_OFFICER', 'Marketing Officer', 'Reports sales; no access to customer records or money beyond that', 35, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- General Manager: level 85 sees every branch (lib/branch-scope) and confirms
-- marketing sales (lib/marketing-access). Company-wide oversight without
-- system administration. SAVINGS:DEPOSIT and LOANS:COLLECT let a GM post a
-- confirmed field collection. Created only if absent; an existing role of
-- this code keeps whatever permissions it already has.
INSERT INTO "Role" ("id", "code", "name", "description", "level", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'GENERAL_MANAGER', 'General Manager', 'Company-wide operations oversight across all branches', 85, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid()::text, r."id", p."id", CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p ON p."code" IN (
  'CUSTOMERS:READ', 'CUSTOMERS:UPDATE',
  'LOANS:READ', 'LOANS:APPROVE', 'LOANS:APPROVE_L1', 'LOANS:APPROVE_L2',
  'LOANS:DISBURSE', 'LOANS:MANAGE_ALL', 'LOANS:RESTRUCTURE', 'LOANS:COLLECT',
  'SAVINGS:READ', 'SAVINGS:APPROVE', 'SAVINGS:DEPOSIT',
  'FIXED_DEPOSITS:READ', 'FIXED_DEPOSITS:MANAGE', 'FIXED_DEPOSITS:LIQUIDATE',
  'ACCOUNTS:REPORTS_VIEW',
  'HR:STAFF_READ', 'HR:ANALYTICS_VIEW', 'HR:LEAVE_MANAGE', 'HR:PERFORMANCE_MANAGE', 'HR:PAYROLL_READ',
  'AUDIT:READ',
  'DOCUMENTS:READ', 'DOCUMENTS:APPROVE',
  'VERIFICATION:READ'
)
WHERE r."code" = 'GENERAL_MANAGER'
  AND NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id")
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
