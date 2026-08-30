import { readFileSync } from 'node:fs';
import {
  AgentType,
  CashDirection,
  CashMovementCategory,
  CashMovementStatus,
  ExceptionStatus,
  ExceptionType,
  ReconciliationStatus,
  AgentSkillStatus,
  AutomationJobStatus,
  AutomationJobType,
  BudgetStatus,
  DocumentStatus,
  ExpenseClaimStatus,
  IntegrationProvider,
  IntegrationStatus,
  IntegrationType,
  NotificationChannel,
  NotificationStatus,
  OrganizationNodeType,
  ReceiptRequestStatus,
  TaxMatchStatus,
  WorkspaceRole,
  FinancialRecordType,
  MutationOperation,
  MutationStatus,
} from '@finora/platform';
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const pairs = {
  ReconciliationStatus,
  ExceptionStatus,
  ExceptionType,
  AgentType,
  CashDirection,
  CashMovementStatus,
  CashMovementCategory,
  WorkspaceRole,
  OrganizationNodeType,
  BudgetStatus,
  ExpenseClaimStatus,
  DocumentStatus,
  ReceiptRequestStatus,
  AgentSkillStatus,
  NotificationChannel,
  NotificationStatus,
  IntegrationType,
  IntegrationProvider,
  IntegrationStatus,
  AutomationJobType,
  AutomationJobStatus,
  TaxMatchStatus,
  FinancialRecordType,
  MutationOperation,
  MutationStatus,
};
let invalid = false;
for (const [name, values] of Object.entries(pairs)) {
  const match = schema.match(new RegExp(`enum ${name}\\s*\\{([^}]+)\\}`));
  const prismaValues = match?.[1].match(/[A-Z_]+/g) ?? [];
  const platformValues = Object.values(values);
  if (JSON.stringify(prismaValues) !== JSON.stringify(platformValues)) {
    console.error(
      `${name} differs: Prisma=${prismaValues.join(',')} platform=${platformValues.join(',')}`,
    );
    invalid = true;
  }
}
if (invalid) process.exit(1);
console.log('Platform and Prisma enums are synchronized.');
