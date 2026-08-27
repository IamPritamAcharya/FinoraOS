# FinoraOS Status

Last updated: 2026-08-27
Current phase: Finance-hub V1 with enterprise identity and controlled automation
Last verified commit: see `git log -1`

## Current state

FinoraOS has a working Track 04 flagship loop and a broader finance-hub foundation. The deterministic engine processes a 240-record evaluation fixture with 108 correct matches, 12 honest exceptions, and zero false auto-matches. Ambiguous exceptions can be investigated through the configured AI gateway, persisted as typed proposals, reviewed by a human, audited, and rerun without modifying raw imported data.

The application now has Keycloak login/RBAC, hierarchical organization nodes and budgets, employee expense/receipt workflows, custom bounded agent skills, agent/audit visibility, notifications, scheduled receipt reminders, integration/policy control surfaces, and a Razorpay test-mode adapter. PostgreSQL row-level security remains the tenant boundary for agent reads.

## Completed

- pnpm/Turbo workspace with graceful `pnpm dev` Docker lifecycle and preflight port checks.
- PostgreSQL/Redis/Keycloak Compose stack; Prisma 7 config, migrations, reproducible seed, shared enums, Decimal money rules, and enum synchronization.
- Pure deterministic reconciliation package and transactional run/match/exception/evidence/audit persistence.
- Ollama/Qwen plus hosted provider abstraction, controlled multi-tool planning, grounded answers, persisted chat, typed proposals, approval/rejection, adjustment records, and reruns.
- `finora_agent_ro` with SELECT-only grants, read-only transactions, `NOBYPASSRLS`, and organization RLS. Provisioning proves no rows are visible without a valid tenant.
- Keycloak/NextAuth login with Employee, Finance Controller, and Enterprise Admin identities. Nest verifies JWT issuer/audience and maps `sub + organization_id` to a database membership and database-owned role. The Finora-themed OIDC screen, coordinated provider logout, forced account re-authentication, and explicit 5-minute/30-minute/8-hour token/session limits are configured idempotently on development startup.
- Role/permission contracts for finance, expenses, budgets, organization management, skills, audit, approvals, and integrations. Existing finance/reconciliation operations enforce them.
- Finance-hub models: organization nodes, budgets, expense claims, financial documents, receipt requests, agent skills, notifications, integration connections, automation jobs/runs, approval policies, and richer tax metadata.
- Organization hierarchy UI with active budget utilization and audited node-scoped budget creation.
- Employee/finance expense queue with real bounded PDF/image receipt upload through a document-storage gateway. Local files are ignored under `.data/documents`.
- Agent control UI with skill creation/activation, strict tool allowlists, active-skill controller context, skill-linked runs, model/tool history, and financial audit events.
- User-scoped notifications inbox and operations UI for connectors, jobs, job outcomes, and approval policies.
- Scheduled/manual receipt reminders. Mock delivery works locally; the Slack adapter uses `chat.postMessage` when configured.
- Razorpay sandbox-only adapter for payments, settlements, refunds, fees, tax, and UTR. Live-mode keys are rejected.
- Responsive routes for Finora, Overview, Records, Reconciliation, Exceptions, Organization, Expenses, Agent control, Notifications, and Operations.
- Local Keycloak realm import/health, NextAuth provider discovery and PKCE redirect, branded login, unauthenticated API 401, migration/seed, RLS verification, graceful shutdown, and production web build smoke-tested.

## In progress

No partial code task is intentionally left in progress at this checkpoint.

## Next highest-priority tasks

1. Slack Events API signature verification, durable idempotent ingestion, file download, and receipt-request/thread matching.
2. Razorpay/banking connector sync orchestration with cursors, webhooks, provenance, retry, and backoff.
3. Production object storage plus OCR/extraction and a document review queue.
4. Richer tax matching/evaluation and deterministic forecast scenarios.
5. Playwright role/isolation coverage for employee, finance, and admin journeys.

## Known issues

- Slack outbound reminders are adapter-ready; inbound Slack receipt capture is not implemented.
- Razorpay test-mode reads work; scheduled persistence/sync and webhook ingestion are not connected.
- Banking and ERP entries are explicit mock/disconnected control-plane records, not production integrations.
- Local receipt storage has no malware scanning, OCR, remote object store, or download endpoint.
- Keycloak runs in `start-dev` with embedded storage; production requires TLS, a durable database, secret rotation, and deployment hardening.
- Custom skills guide only allowlisted read tools. They cannot grant permissions, run SQL, or mutate finance records.
- Autonomous closure is disabled (`autoApprove=false`); the policy evaluator remains later work.
- Tax and forecasting are deterministic baselines, not complete compliance or treasury systems.

## Commands last verified

- `pnpm check:enums`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (48 tests)
- `pnpm eval:reconciliation`
- `pnpm build`
- `pnpm format:check`
- `pnpm db:deploy`
- `pnpm seed`
- `pnpm db:agent-role`
- `pnpm auth:configure`
- PostgreSQL/Redis/Keycloak healthy Compose startup and graceful shutdown
- `pnpm dev` startup and Ctrl+C shutdown

## Environment notes

`pnpm@10.16.0` is pinned. `.env` is untracked. `.env.example` enables local Keycloak and mock messaging/payment connectors. `AI_PROVIDER=auto` uses a configured hosted provider first and otherwise local Ollama. Keycloak runs at `http://localhost:8080`, web at `http://localhost:3000`, and API at `http://localhost:3001/api`.

## Demo status

Acme Commerce India is seeded with 4 users, an office/department/employee node tree, 3 active budgets, 4 expense claims, receipt requests/documents/notifications, 2 custom skills, approval policies, automation jobs, 120 transactions, 12 settlements, 49 cash movements, invoices/tax lines, and 14 operational exceptions.
