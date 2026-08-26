-- CreateEnum
CREATE TYPE "CashDirection" AS ENUM ('INFLOW', 'OUTFLOW');
CREATE TYPE "CashMovementStatus" AS ENUM ('POSTED', 'SCHEDULED', 'CANCELLED');
CREATE TYPE "CashMovementCategory" AS ENUM ('COLLECTION', 'GATEWAY_FEE', 'GST', 'REFUND', 'VENDOR_PAYMENT', 'PAYROLL', 'RENT', 'TAX_PAYMENT', 'OTHER');

-- Extend persisted conversations
ALTER TABLE "ChatThread" ADD COLUMN "userId" TEXT;
ALTER TABLE "ChatThread" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "ChatThread" SET "userId" = 'demo-user' WHERE "userId" IS NULL;
ALTER TABLE "ChatThread" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ChatMessage" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'COMPLETED';

-- CreateTable
CREATE TABLE "CashAccount" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "openingBalance" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "CashAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashMovement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "direction" "CashDirection" NOT NULL,
  "category" "CashMovementCategory" NOT NULL,
  "status" "CashMovementStatus" NOT NULL DEFAULT 'POSTED',
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "description" TEXT NOT NULL,
  "counterparty" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "sourceMetadata" JSONB,
  CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Adjustment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "exceptionId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "details" JSONB NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Adjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashAccount_organizationId_name_currency_key" ON "CashAccount"("organizationId", "name", "currency");
CREATE UNIQUE INDEX "CashMovement_organizationId_externalId_key" ON "CashMovement"("organizationId", "externalId");
CREATE INDEX "CashMovement_organizationId_direction_status_occurredAt_idx" ON "CashMovement"("organizationId", "direction", "status", "occurredAt");
CREATE INDEX "CashMovement_organizationId_category_occurredAt_idx" ON "CashMovement"("organizationId", "category", "occurredAt");
CREATE UNIQUE INDEX "Adjustment_organizationId_exceptionId_type_key" ON "Adjustment"("organizationId", "exceptionId", "type");
CREATE INDEX "ChatThread_organizationId_userId_updatedAt_idx" ON "ChatThread"("organizationId", "userId", "updatedAt");
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashAccount" ADD CONSTRAINT "CashAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CashAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "Exception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
