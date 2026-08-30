import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to provision finora_agent_ro.');

  const role = 'finora_agent_ro';
  const writeRole = 'finora_agent_rw';
  const password = process.env.AGENT_READ_DATABASE_PASSWORD ?? 'finora_agent_readonly_dev';
  const writePassword = process.env.AGENT_WRITE_DATABASE_PASSWORD ?? 'finora_agent_writer_dev';
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(databaseName)) {
    throw new Error(
      'DATABASE_URL must use a simple PostgreSQL database name for role provisioning.',
    );
  }
  const agentReadUrl =
    process.env.AGENT_READ_DATABASE_URL ??
    (() => {
      const url = new URL(databaseUrl);
      url.username = role;
      url.password = password;
      return url.toString();
    })();
  const agentWriteUrl =
    process.env.AGENT_WRITE_DATABASE_URL ??
    (() => {
      const url = new URL(databaseUrl);
      url.username = writeRole;
      url.password = writePassword;
      return url.toString();
    })();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`DO $$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN
      CREATE ROLE ${role} LOGIN PASSWORD '${password.replaceAll("'", "''")}';
    ELSE
      ALTER ROLE ${role} LOGIN PASSWORD '${password.replaceAll("'", "''")}';
    END IF;
  END
  $$;`);
    await client.query(`DO $$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${writeRole}') THEN
      CREATE ROLE ${writeRole} LOGIN PASSWORD '${writePassword.replaceAll("'", "''")}';
    ELSE
      ALTER ROLE ${writeRole} LOGIN PASSWORD '${writePassword.replaceAll("'", "''")}';
    END IF;
  END
  $$;`);
    await client.query(
      `ALTER ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;`,
    );
    await client.query(`GRANT CONNECT ON DATABASE "${databaseName}" TO ${role};`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role};`);
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role};`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${role};`,
    );
    await client.query(
      `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM ${role};`,
    );
    await client.query(
      `REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public FROM ${role};`,
    );
    const orgId = `current_setting('app.organization_id', true)`;
    const directTenantTables = [
      ['Organization', `id = ${orgId}`],
      ['User', `"organizationId" = ${orgId}`],
      ['Settlement', `"organizationId" = ${orgId}`],
      ['Transaction', `"organizationId" = ${orgId}`],
      ['Invoice', `"organizationId" = ${orgId}`],
      ['TaxLine', `"organizationId" = ${orgId}`],
      ['ReconciliationRun', `"organizationId" = ${orgId}`],
      ['Exception', `"organizationId" = ${orgId}`],
      ['AgentRun', `"organizationId" = ${orgId}`],
      ['AuditLog', `"organizationId" = ${orgId}`],
      ['ChatThread', `"organizationId" = ${orgId}`],
      ['CashAccount', `"organizationId" = ${orgId}`],
      ['CashMovement', `"organizationId" = ${orgId}`],
      ['Adjustment', `"organizationId" = ${orgId}`],
      ['OrganizationNode', `"organizationId" = ${orgId}`],
      ['Budget', `"organizationId" = ${orgId}`],
      ['ExpenseClaim', `"organizationId" = ${orgId}`],
      ['FinancialDocument', `"organizationId" = ${orgId}`],
      ['ReceiptRequest', `"organizationId" = ${orgId}`],
      ['AgentSkill', `"organizationId" = ${orgId}`],
      ['Notification', `"organizationId" = ${orgId}`],
      ['IntegrationConnection', `"organizationId" = ${orgId}`],
      ['AutomationJob', `"organizationId" = ${orgId}`],
      ['ApprovalPolicy', `"organizationId" = ${orgId}`],
      ['SpendLimit', `"organizationId" = ${orgId}`],
      ['ImportBatch', `"organizationId" = ${orgId}`],
      ['MutationProposal', `"organizationId" = ${orgId}`],
    ] as const;
    for (const [table, predicate] of directTenantTables) {
      await client.query(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS finora_agent_org_scope ON public."${table}";`);
      await client.query(
        `CREATE POLICY finora_agent_org_scope ON public."${table}" FOR SELECT TO ${role} USING (${predicate});`,
      );
    }
    const relatedTenantTables = [
      ['ExceptionEvidence', 'Exception', 'exceptionId', 'id'],
      ['ReconciliationMatch', 'ReconciliationRun', 'reconciliationRunId', 'id'],
      ['AgentStep', 'AgentRun', 'agentRunId', 'id'],
      ['ChatMessage', 'ChatThread', 'threadId', 'id'],
      ['AutomationJobRun', 'AutomationJob', 'jobId', 'id'],
      ['CategorySpendLimit', 'SpendLimit', 'spendLimitId', 'id'],
    ] as const;
    for (const [table, parentTable, foreignKey, parentKey] of relatedTenantTables) {
      await client.query(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS finora_agent_org_scope ON public."${table}";`);
      await client.query(
        `CREATE POLICY finora_agent_org_scope ON public."${table}" FOR SELECT TO ${role}
         USING (EXISTS (
           SELECT 1 FROM public."${parentTable}" parent
           WHERE parent."${parentKey}" = public."${table}"."${foreignKey}"
             AND parent."organizationId" = ${orgId}
         ));`,
      );
    }
    await client.query(`ALTER ROLE ${role} SET default_transaction_read_only = on;`);
    await client.query(
      `ALTER ROLE ${writeRole} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;`,
    );
    await client.query(`GRANT CONNECT ON DATABASE "${databaseName}" TO ${writeRole};`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${writeRole};`);
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${writeRole};`);
    await client.query(
      `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM ${writeRole};`,
    );
    await client.query(
      `GRANT UPDATE ("amount", "currency", "status", "occurredAt", "settlementId", "version", "updatedAt") ON public."Transaction" TO ${writeRole};`,
    );
    await client.query(
      `GRANT UPDATE ("expectedAmount", "receivedAmount", "feeAmount", "gstAmount", "refundAmount", "settledAt", "version", "updatedAt") ON public."Settlement" TO ${writeRole};`,
    );
    await client.query(
      `GRANT UPDATE ("amount", "currency", "issuedAt", "dueAt", "direction", "nodeId", "vendor", "category", "status", "version", "updatedAt") ON public."Invoice" TO ${writeRole};`,
    );
    await client.query(
      `GRANT UPDATE ("invoiceId", "amount", "taxRate", "matched", "matchStatus", "taxType", "taxPeriod", "counterpartyTaxId", "version", "updatedAt") ON public."TaxLine" TO ${writeRole};`,
    );
    await client.query(
      `GRANT UPDATE ("direction", "category", "status", "amount", "currency", "description", "counterparty", "occurredAt", "version", "updatedAt") ON public."CashMovement" TO ${writeRole};`,
    );
    await client.query(
      `GRANT UPDATE ("amount", "currency", "merchant", "category", "status", "incurredAt", "description", "nodeId", "version", "updatedAt") ON public."ExpenseClaim" TO ${writeRole};`,
    );
    await client.query(
      `GRANT UPDATE ("status", "approvedById", "decidedAt", "executedAt", "failureReason", "updatedAt") ON public."MutationProposal" TO ${writeRole};`,
    );
    await client.query(
      `GRANT INSERT ("id", "organizationId", "actor", "actorType", "source", "action", "entityType", "entityId", "details", "createdAt") ON public."AuditLog" TO ${writeRole};`,
    );
    await client.query(
      `REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public FROM ${writeRole};`,
    );
    const writerTables = [
      'Transaction',
      'Settlement',
      'Invoice',
      'TaxLine',
      'CashMovement',
      'ExpenseClaim',
      'MutationProposal',
    ];
    for (const table of writerTables) {
      await client.query(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS finora_agent_rw_update ON public."${table}";`);
      await client.query(
        `CREATE POLICY finora_agent_rw_update ON public."${table}" FOR UPDATE TO ${writeRole}
         USING ("organizationId" = ${orgId}) WITH CHECK ("organizationId" = ${orgId});`,
      );
    }
    await client.query(`DROP POLICY IF EXISTS finora_agent_rw_insert ON public."AuditLog";`);
    await client.query(
      `CREATE POLICY finora_agent_rw_insert ON public."AuditLog" FOR INSERT TO ${writeRole}
       WITH CHECK ("organizationId" = ${orgId});`,
    );
    for (const [table, predicate] of directTenantTables) {
      await client.query(`DROP POLICY IF EXISTS finora_agent_rw_select ON public."${table}";`);
      await client.query(
        `CREATE POLICY finora_agent_rw_select ON public."${table}" FOR SELECT TO ${writeRole} USING (${predicate});`,
      );
    }
    for (const [table, parentTable, foreignKey, parentKey] of relatedTenantTables) {
      await client.query(`DROP POLICY IF EXISTS finora_agent_rw_select ON public."${table}";`);
      await client.query(
        `CREATE POLICY finora_agent_rw_select ON public."${table}" FOR SELECT TO ${writeRole}
         USING (EXISTS (
           SELECT 1 FROM public."${parentTable}" parent
           WHERE parent."${parentKey}" = public."${table}"."${foreignKey}"
             AND parent."organizationId" = ${orgId}
         ));`,
      );
    }
    console.log(`Provisioned ${role} with read-only access to the Finora finance schema.`);
    console.log(
      `Provisioned ${writeRole} with tenant-scoped, column-limited finance UPDATE access.`,
    );
  } finally {
    await client.end();
  }

  const readClient = new Client({ connectionString: agentReadUrl });
  await readClient.connect();
  try {
    const verification = await readClient.query<{
      current_user: string;
      transaction_read_only: string;
      can_select_transactions: boolean;
      can_update_transactions: boolean;
      rows_without_tenant: number;
    }>(`
      SELECT current_user, current_setting('transaction_read_only') AS transaction_read_only,
        has_table_privilege(current_user, 'public."Transaction"', 'SELECT') AS can_select_transactions,
        has_table_privilege(current_user, 'public."Transaction"', 'UPDATE') AS can_update_transactions,
        (SELECT count(*) FROM public."Transaction")::int AS rows_without_tenant
    `);
    const result = verification.rows[0];
    if (
      !result ||
      result.current_user !== role ||
      result.transaction_read_only !== 'on' ||
      !result.can_select_transactions ||
      result.can_update_transactions ||
      result.rows_without_tenant !== 0
    ) {
      throw new Error('Read-only role verification failed.');
    }
    await readClient.query(
      `SELECT set_config('app.organization_id', 'wrong-organization', false);`,
    );
    const wrongTenant = await readClient.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public."Transaction";`,
    );
    if (wrongTenant.rows[0]?.count !== '0') {
      throw new Error('Tenant isolation verification failed: an unknown tenant can read records.');
    }
    console.log(
      `Verified ${result.current_user}: SELECT enabled, writes disabled, read-only transactions on.`,
    );
    console.log(
      'Verified tenant isolation: no rows are visible without a valid organization context.',
    );
  } finally {
    await readClient.end();
  }

  const writeClient = new Client({ connectionString: agentWriteUrl });
  await writeClient.connect();
  try {
    const verification = await writeClient.query<{
      current_user: string;
      can_update_amount: boolean;
      can_update_external_id: boolean;
      can_delete: boolean;
      rows_without_tenant: number;
    }>(`
      SELECT current_user,
        has_column_privilege(current_user, 'public."Transaction"', 'amount', 'UPDATE') AS can_update_amount,
        has_column_privilege(current_user, 'public."Transaction"', 'externalId', 'UPDATE') AS can_update_external_id,
        has_table_privilege(current_user, 'public."Transaction"', 'DELETE') AS can_delete,
        (SELECT count(*) FROM public."Transaction")::int AS rows_without_tenant
    `);
    const result = verification.rows[0];
    if (
      !result ||
      result.current_user !== writeRole ||
      !result.can_update_amount ||
      result.can_update_external_id ||
      result.can_delete ||
      result.rows_without_tenant !== 0
    ) {
      throw new Error('Governed write-role verification failed.');
    }
    console.log(
      `Verified ${writeRole}: allowed columns are writable; identifiers and DELETE remain blocked.`,
    );
  } finally {
    await writeClient.end();
  }
}

void main();
