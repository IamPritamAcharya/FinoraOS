-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'RESOLVED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'PROPOSED', 'RESOLVED', 'NEEDS_REVIEW', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('SETTLEMENT_MISMATCH', 'MISSING_BANK_RECORD', 'AMBIGUOUS_MATCH', 'TAX_MISMATCH');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('CONTROLLER', 'RECONCILIATION', 'EXCEPTION_INVESTIGATOR', 'SETTLEMENT', 'TAX', 'FORECAST');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('CAPTURED', 'REFUNDED', 'PENDING');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "expectedAmount" DECIMAL(18,2) NOT NULL,
    "receivedAmount" DECIMAL(18,2) NOT NULL,
    "feeAmount" DECIMAL(18,2) NOT NULL,
    "gstAmount" DECIMAL(18,2) NOT NULL,
    "refundAmount" DECIMAL(18,2) NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "TransactionStatus" NOT NULL DEFAULT 'CAPTURED',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "settlementId" TEXT,
    "sourceMetadata" JSONB,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "issuedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TaxLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "recordsProcessed" INTEGER NOT NULL,
    "deterministicMatches" INTEGER NOT NULL,
    "exceptionsGenerated" INTEGER NOT NULL,
    "agentResolved" INTEGER NOT NULL,
    "needsReview" INTEGER NOT NULL,
    "unresolved" INTEGER NOT NULL,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationMatch" (
    "id" TEXT NOT NULL,
    "reconciliationRunId" TEXT NOT NULL,
    "transactionId" TEXT,
    "settlementId" TEXT,
    "status" "ReconciliationStatus" NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "ReconciliationMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reconciliationRunId" TEXT,
    "externalId" TEXT NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "status" "ExceptionStatus" NOT NULL,
    "expectedAmount" DECIMAL(18,2) NOT NULL,
    "receivedAmount" DECIMAL(18,2) NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "resolution" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionEvidence" (
    "id" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "referenceId" TEXT,
    "payload" JSONB NOT NULL,

    CONSTRAINT "ExceptionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "exceptionId" TEXT,
    "agentType" "AgentType" NOT NULL,
    "status" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_organizationId_externalId_key" ON "Settlement"("organizationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_organizationId_externalId_key" ON "Transaction"("organizationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_externalId_key" ON "Invoice"("organizationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxLine_organizationId_externalId_key" ON "TaxLine"("organizationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Exception_externalId_key" ON "Exception"("externalId");

-- CreateIndex
CREATE INDEX "Exception_organizationId_status_idx" ON "Exception"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxLine" ADD CONSTRAINT "TaxLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_reconciliationRunId_fkey" FOREIGN KEY ("reconciliationRunId") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_reconciliationRunId_fkey" FOREIGN KEY ("reconciliationRunId") REFERENCES "ReconciliationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionEvidence" ADD CONSTRAINT "ExceptionEvidence_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "Exception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "Exception"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
