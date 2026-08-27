-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('EMPLOYEE', 'FINANCE_OPERATOR', 'FINANCE_CONTROLLER', 'ENTERPRISE_ADMIN', 'AUDITOR');

-- CreateEnum
CREATE TYPE "OrganizationNodeType" AS ENUM ('COMPANY', 'LEGAL_ENTITY', 'OFFICE', 'DEPARTMENT', 'TEAM', 'COST_CENTER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ExpenseClaimStatus" AS ENUM ('DRAFT', 'RECEIPT_REQUIRED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REIMBURSED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'EXTRACTED', 'NEEDS_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReceiptRequestStatus" AS ENUM ('PENDING', 'SENT', 'RECEIVED', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentSkillStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'SLACK', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('PAYMENT', 'BANKING', 'ERP', 'MESSAGING', 'DOCUMENT_STORAGE');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('RAZORPAY', 'MOCK_PAYMENT', 'MOCK_BANKING', 'GENERIC_ERP', 'SLACK', 'LOCAL_DOCUMENTS');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "AutomationJobType" AS ENUM ('RECEIPT_REMINDER', 'INTEGRATION_SYNC', 'DOCUMENT_PROCESSING', 'RECONCILIATION', 'TAX_MATCH', 'FORECAST_REFRESH');

-- CreateEnum
CREATE TYPE "AutomationJobStatus" AS ENUM ('IDLE', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TaxMatchStatus" AS ENUM ('MATCHED', 'AMBIGUOUS', 'UNMATCHED', 'NEEDS_REVIEW');

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "skillId" TEXT;

-- AlterTable
ALTER TABLE "ChatThread" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TaxLine" ADD COLUMN     "counterpartyTaxId" TEXT,
ADD COLUMN     "matchStatus" "TaxMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
ADD COLUMN     "sourceMetadata" JSONB,
ADD COLUMN     "taxPeriod" TEXT,
ADD COLUMN     "taxType" TEXT NOT NULL DEFAULT 'GST';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "identityProviderId" TEXT,
ADD COLUMN     "role" "WorkspaceRole" NOT NULL DEFAULT 'EMPLOYEE',
ADD COLUMN     "slackUserId" TEXT;

-- CreateTable
CREATE TABLE "OrganizationNode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "memberUserId" TEXT,
    "type" "OrganizationNodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "CashMovementCategory",
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "claimantUserId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "budgetId" TEXT,
    "approvedById" TEXT,
    "status" "ExpenseClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "merchant" TEXT NOT NULL,
    "category" "CashMovementCategory" NOT NULL DEFAULT 'OTHER',
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'WEB',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "expenseClaimId" TEXT,
    "uploadedById" TEXT,
    "connectionId" TEXT,
    "type" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sourceExternalId" TEXT,
    "extractedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "expenseClaimId" TEXT NOT NULL,
    "employeeUserId" TEXT NOT NULL,
    "status" "ReceiptRequestStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "externalThreadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSkill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "allowedTools" TEXT[],
    "status" "AgentSkillStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "displayName" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "credentialRef" TEXT,
    "config" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "type" "AutomationJobType" NOT NULL,
    "name" TEXT NOT NULL,
    "cronExpression" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "AutomationJobStatus" NOT NULL DEFAULT 'IDLE',
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationJobRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "AutomationJobStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "attempted" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "output" JSONB,

    CONSTRAINT "AutomationJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nodeId" TEXT,
    "name" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "amountLimit" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "minimumConfidence" DECIMAL(4,3),
    "requiresReceipt" BOOLEAN NOT NULL DEFAULT false,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationNode_memberUserId_key" ON "OrganizationNode"("memberUserId");

-- CreateIndex
CREATE INDEX "OrganizationNode_organizationId_parentId_idx" ON "OrganizationNode"("organizationId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationNode_organizationId_code_key" ON "OrganizationNode"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Budget_organizationId_periodStart_periodEnd_idx" ON "Budget"("organizationId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "Budget_nodeId_status_idx" ON "Budget"("nodeId", "status");

-- CreateIndex
CREATE INDEX "ExpenseClaim_organizationId_claimantUserId_status_idx" ON "ExpenseClaim"("organizationId", "claimantUserId", "status");

-- CreateIndex
CREATE INDEX "ExpenseClaim_nodeId_incurredAt_idx" ON "ExpenseClaim"("nodeId", "incurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseClaim_organizationId_externalId_key" ON "ExpenseClaim"("organizationId", "externalId");

-- CreateIndex
CREATE INDEX "FinancialDocument_organizationId_status_createdAt_idx" ON "FinancialDocument"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialDocument_organizationId_sha256_key" ON "FinancialDocument"("organizationId", "sha256");

-- CreateIndex
CREATE INDEX "ReceiptRequest_organizationId_status_nextAttemptAt_idx" ON "ReceiptRequest"("organizationId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AgentSkill_organizationId_status_idx" ON "AgentSkill"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSkill_organizationId_name_version_key" ON "AgentSkill"("organizationId", "name", "version");

-- CreateIndex
CREATE INDEX "Notification_organizationId_userId_status_createdAt_idx" ON "Notification"("organizationId", "userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationConnection_organizationId_type_status_idx" ON "IntegrationConnection"("organizationId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_organizationId_provider_externalAccou_key" ON "IntegrationConnection"("organizationId", "provider", "externalAccountId");

-- CreateIndex
CREATE INDEX "AutomationJob_organizationId_enabled_nextRunAt_idx" ON "AutomationJob"("organizationId", "enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "AutomationJobRun_jobId_startedAt_idx" ON "AutomationJobRun"("jobId", "startedAt");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_organizationId_actionType_enabled_idx" ON "ApprovalPolicy"("organizationId", "actionType", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "User_identityProviderId_key" ON "User"("identityProviderId");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "AgentSkill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationNode" ADD CONSTRAINT "OrganizationNode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationNode" ADD CONSTRAINT "OrganizationNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrganizationNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationNode" ADD CONSTRAINT "OrganizationNode_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "OrganizationNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_claimantUserId_fkey" FOREIGN KEY ("claimantUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "OrganizationNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_expenseClaimId_fkey" FOREIGN KEY ("expenseClaimId") REFERENCES "ExpenseClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptRequest" ADD CONSTRAINT "ReceiptRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptRequest" ADD CONSTRAINT "ReceiptRequest_expenseClaimId_fkey" FOREIGN KEY ("expenseClaimId") REFERENCES "ExpenseClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptRequest" ADD CONSTRAINT "ReceiptRequest_employeeUserId_fkey" FOREIGN KEY ("employeeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkill" ADD CONSTRAINT "AgentSkill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkill" ADD CONSTRAINT "AgentSkill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJobRun" ADD CONSTRAINT "AutomationJobRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AutomationJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "OrganizationNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
