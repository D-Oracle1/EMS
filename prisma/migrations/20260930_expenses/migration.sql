-- Expenses: recorded by the accountant, approved by an admin.
--
-- An expense names the expense account charged and the cash or bank account
-- it was paid from. Nothing reaches the ledger until an admin approves it;
-- approval posts Dr expense / Cr cash-or-bank, tagged with the expense's
-- branch (null = head office), and journalEntryId records the entry.
--
-- Purely additive: one table and one enum. Taken verbatim from
-- `prisma migrate diff` against the previous schema.
--
-- Foreign keys: RESTRICT on both accounts and the recorder, so an expense
-- can never lose what it was charged to or who recorded it; SET NULL on the
-- reviewer and branch.

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'APPROVING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payee" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expenseAccountId" TEXT NOT NULL,
    "paymentAccountId" TEXT NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "paymentReference" TEXT,
    "branchId" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "recordedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_reference_key" ON "Expense"("reference");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");

-- CreateIndex
CREATE INDEX "Expense_branchId_idx" ON "Expense"("branchId");

-- CreateIndex
CREATE INDEX "Expense_expenseAccountId_idx" ON "Expense"("expenseAccountId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "ChartOfAccounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "ChartOfAccounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Reference numbers for expenses (EXP0001, ...). Idempotent.
INSERT INTO "Sequence" ("id", "code", "prefix", "currentValue", "padLength", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'EXPENSE', 'EXP', 0, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
