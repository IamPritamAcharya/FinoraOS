import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to provision finora_agent_ro.');

  const role = 'finora_agent_ro';
  const password = process.env.AGENT_READ_DATABASE_PASSWORD ?? 'finora_agent_readonly_dev';
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
    console.log(`Provisioned ${role} with read-only access to the Finora finance schema.`);
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
}

void main();
