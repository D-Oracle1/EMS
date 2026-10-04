-- CreateEnum
CREATE TYPE "FormPurpose" AS ENUM ('GENERAL', 'STAFF_ONBOARDING');

-- CreateEnum
CREATE TYPE "FormReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "purpose" "FormPurpose" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "FormResponse" ADD COLUMN     "onboardedStaffId" TEXT,
ADD COLUMN     "onboardingStatus" "FormReviewStatus",
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FormResponse_onboardedStaffId_key" ON "FormResponse"("onboardedStaffId");

-- CreateIndex
CREATE INDEX "FormResponse_onboardingStatus_idx" ON "FormResponse"("onboardingStatus");

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_onboardedStaffId_fkey" FOREIGN KEY ("onboardedStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

