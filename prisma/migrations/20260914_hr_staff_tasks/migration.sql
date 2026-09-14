-- HR assigned tasks.
--
-- A task HR hands to a staff member with a deadline, which that staff member
-- reports complete themselves. Additive only: one enum, one table, its indexes
-- and its two foreign keys back to Staff.
--
-- Written by hand rather than taken from `prisma migrate diff`, because the
-- generated diff also carried unrelated drift between schema.prisma and the
-- live database (a DROP INDEX on SavingsAccount_isPromoRate_idx and DROP
-- DEFAULT on SavingsTermination.id/updatedAt). That drift is pre-existing and
-- is not this migration's business to "fix" by dropping things in production.

-- CreateEnum
CREATE TYPE "StaffTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StaffTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "assigneeId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "StaffTaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffTask_assigneeId_status_idx" ON "StaffTask"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "StaffTask_assignedById_idx" ON "StaffTask"("assignedById");

-- CreateIndex
CREATE INDEX "StaffTask_dueDate_idx" ON "StaffTask"("dueDate");

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
