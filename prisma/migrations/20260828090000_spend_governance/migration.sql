-- CreateEnum
CREATE TYPE "SpendLimitStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ExpenseCategorySource" AS ENUM ('USER', 'AI', 'RULE', 'IMPORT');

-- CreateEnum
CREATE TYPE "ExpenseCategoryStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "InvoiceDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "ImportRecordType" AS ENUM ('INVOICE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- AlterEnum
ALTER TYPE "AgentType" ADD VALUE 'EXPENSE_CATEGORIZER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CashMovementCategory" ADD VALUE 'TRAVEL';
ALTER TYPE "CashMovementCategory" ADD VALUE 'MEALS';
ALTER TYPE "CashMovementCategory" ADD VALUE 'LODGING';
ALTER TYPE "CashMovementCategory" ADD VALUE 'LOCAL_TRANSPORT';
ALTER TYPE "CashMovementCategory" ADD VALUE 'SOFTWARE';
ALTER TYPE "CashMovementCategory" ADD VALUE 'OFFICE_SUPPLIES';
ALTER TYPE "CashMovementCategory" ADD VALUE 'MARKETING';
ALTER TYPE "CashMovementCategory" ADD VALUE 'PROFESSIONAL_SERVICES';
ALTER TYPE "CashMovementCategory" ADD VALUE 'UTILITIES';

-- AlterTable
ALTER TABLE "ExpenseClaim" ADD COLUMN     "categoryConfidence" DECIMAL(4,3),
ADD COLUMN     "categoryReason" TEXT,
ADD COLUMN     "categorySource" "ExpenseCategorySource" NOT NULL DEFAULT 'USER',
ADD COLUMN     "categoryStatus" "ExpenseCategoryStatus" NOT NULL DEFAULT 'CONFIRMED',
ADD COLUMN     "importBatchId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "category" "CashMovementCategory",
ADD COLUMN     "direction" "InvoiceDirection" NOT NULL DEFAULT 'RECEIVABLE',
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "nodeId" TEXT,
ADD COLUMN     "sourceMetadata" JSONB,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "vendor" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "OrganizationNode" ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "SpendLimit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "SpendLimitStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorySpendLimit" (
    "id" TEXT NOT NULL,
    "spendLimitId" TEXT NOT NULL,
    "category" "CashMovementCategory" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorySpendLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "type" "ImportRecordType" NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpendLimit_organizationId_status_periodStart_periodEnd_idx" ON "SpendLimit"("organizationId", "status", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "SpendLimit_nodeId_periodStart_periodEnd_currency_key" ON "SpendLimit"("nodeId", "periodStart", "periodEnd", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "CategorySpendLimit_spendLimitId_category_key" ON "CategorySpendLimit"("spendLimitId", "category");

-- CreateIndex
CREATE INDEX "ImportBatch_organizationId_createdAt_idx" ON "ImportBatch"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_organizationId_sha256_type_key" ON "ImportBatch"("organizationId", "sha256", "type");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_direction_issuedAt_idx" ON "Invoice"("organizationId", "direction", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_organizationId_userId_dedupeKey_key" ON "Notification"("organizationId", "userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "OrganizationNode_organizationId_ownerUserId_idx" ON "OrganizationNode"("organizationId", "ownerUserId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "OrganizationNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationNode" ADD CONSTRAINT "OrganizationNode_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendLimit" ADD CONSTRAINT "SpendLimit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendLimit" ADD CONSTRAINT "SpendLimit_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "OrganizationNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendLimit" ADD CONSTRAINT "SpendLimit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendLimit" ADD CONSTRAINT "SpendLimit_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorySpendLimit" ADD CONSTRAINT "CategorySpendLimit_spendLimitId_fkey" FOREIGN KEY ("spendLimitId") REFERENCES "SpendLimit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
