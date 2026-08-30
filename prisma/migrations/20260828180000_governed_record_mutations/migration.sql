CREATE TYPE "FinancialRecordType" AS ENUM ('TRANSACTION', 'SETTLEMENT', 'INVOICE', 'TAX_LINE', 'CASH_MOVEMENT', 'EXPENSE_CLAIM');
CREATE TYPE "MutationOperation" AS ENUM ('UPDATE');
CREATE TYPE "MutationStatus" AS ENUM ('PENDING_APPROVAL', 'EXECUTED', 'REJECTED', 'FAILED', 'EXPIRED');

ALTER TABLE "Settlement" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Transaction" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Invoice" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "TaxLine" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CashMovement" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ExpenseClaim" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AuditLog" ADD COLUMN "actorType" TEXT NOT NULL DEFAULT 'USER',
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'APPLICATION';

CREATE TABLE "MutationProposal" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "threadId" TEXT,
  "operation" "MutationOperation" NOT NULL DEFAULT 'UPDATE',
  "entityType" "FinancialRecordType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "recordExternalId" TEXT NOT NULL,
  "status" "MutationStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "reason" TEXT NOT NULL,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "diff" JSONB NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "decidedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MutationProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MutationProposal_organizationId_status_createdAt_idx" ON "MutationProposal"("organizationId", "status", "createdAt");
CREATE INDEX "MutationProposal_organizationId_entityType_entityId_idx" ON "MutationProposal"("organizationId", "entityType", "entityId");
ALTER TABLE "MutationProposal" ADD CONSTRAINT "MutationProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MutationProposal" ADD CONSTRAINT "MutationProposal_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MutationProposal" ADD CONSTRAINT "MutationProposal_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
