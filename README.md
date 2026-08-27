<p align="center">
  <img src="docs/assets/finoraos-readme-banner.png" alt="FinoraOS — AI-native financial operations. Reconcile. Investigate. Close." width="100%" />
</p>

<p align="center">
  <strong>AI-native financial operations for finance teams that need to reconcile, investigate, and close with evidence.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#the-finoraos-loop">How it works</a> ·
  <a href="#demo-workflow">Demo workflow</a> ·
  <a href="#evaluation">Evaluation</a> ·
  <a href="https://github.com/IamPritamAcharya/FinoraOS">GitHub</a> ·
  <a href="docs/STATUS.md">Project status</a>
</p>

> **Buildathon prototype** · Built for the Razorpay AI Buildathon 2026, Track 04 — AI Finance Controller.

FinoraOS is not a chatbot over a database. It is a financial operations workspace where deterministic software handles verifiable finance work and AI is reserved for ambiguity, investigation, and explanation.

The flagship V1 workflow is reconciliation and exception closure: process a batch of financial records, match what can be proven, surface honest exceptions, then give a finance user evidence for the next controlled action.

## Why FinoraOS

Finance teams lose time reconciling payment, settlement, bank, invoice, and tax information across systems. The difficult work is rarely arithmetic—it is locating evidence, explaining variance, resolving ambiguity, and leaving an audit trail.

FinoraOS is designed around that reality:

- **Deterministic first** for IDs, references, amounts, settlement relationships, and date windows.
- **AI only for ambiguity**—never for arbitrary SQL, direct data writes, or financial calculations.
- **Evidence before action** with structured records, traceable source metadata, proposed actions, and audit events.
- **One shared source of truth** behind a finance workspace and the Finora conversational interface.

## The FinoraOS loop

```text
Organization-scoped financial records
                │
                ▼
   @finora/reconciliation (pure deterministic engine)
                │
        ┌───────┴────────┐
        ▼                ▼
     Matches         Exceptions
                         │
                         ▼
              Controlled investigator tools
                         │
                         ▼
                 Typed proposed resolution
                         │
                         ▼
          Validation → approval → audit → rerun
```

The reconciliation engine has no Prisma, NestJS, database, HTTP, environment, clock, vendor SDK, LLM, or random dependency. The API is responsible for organization-scoped loading and transactional persistence; the engine is responsible only for repeatable matching decisions.

## What is working in V1

| Capability                   | What it does now                                                                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finance workspace            | Role-aware Finora, overview, records, reconciliation, exceptions, organization, expenses, agent control, notifications, and operations routes over seeded backend data.                                                                        |
| Deterministic reconciliation | Exact-reference, settlement-relationship, date-window, and explicit composite-score matching. Ambiguous cases are never forced into a match.                                                                                                   |
| Exception persistence        | Reconciliation runs persist matches, exceptions, exception evidence, metrics, and audit events transactionally.                                                                                                                                |
| Settlement Q&A               | Ask Finora about `STL_0001`; amounts and variance are calculated deterministically, then a configured AI gateway may provide a constrained qualitative explanation.                                                                            |
| Exception investigation chat | Ask `Investigate EXC_005.`; Finora invokes the controlled investigator, stores an agent-run/proposal/audit record, and renders the approval-pending result.                                                                                    |
| Controlled chat controller   | The configured model selects one Zod-validated tool from an explicit catalogue: organization users, transactions, invoices, settlements, exceptions/evidence, tax lines, forecast, reconciliation runs, audit events, or agent runs—never SQL. |
| General Finora conversation  | Greetings, product-identity, and navigation questions use the configured model under a no-invented-finance-data system guardrail.                                                                                                              |
| AI providers                 | API-key-first gateway selection for Gemini, Groq, and OpenRouter; local Ollama fallback; explicit mock only for tests.                                                                                                                         |
| Identity and tenancy         | Keycloak OIDC, NextAuth sessions, database-backed workspace roles, API permission checks, and PostgreSQL RLS for the agent's read-only identity.                                                                                               |
| Finance-hub workflows        | Organization nodes and budgets, employee expense claims, bounded receipt uploads, user notifications, approval policies, scheduled receipt reminders, and agent/audit inspection.                                                              |
| Custom agent skills          | Admin-created guidance can select only an explicit allowlist of existing organization-scoped read tools; it cannot add SQL, credentials, permissions, or write access.                                                                         |
| Provider gateways            | Mock-first banking/payment/messaging boundaries, Slack outbound reminders, and a Razorpay sandbox-only read adapter.                                                                                                                           |
| Synthetic demo               | Reproducible Acme Commerce India data: 4 users, node hierarchy, 3 budgets, 4 expenses, 120 transactions, 12 settlements, 49 cash movements, invoices/tax lines, and 14 exceptions.                                                             |
| Evaluation harness           | Runs the same shared reconciliation package against checked-in input and ground truth.                                                                                                                                                         |

### Honest V1 boundaries

- No real money movement is performed. Razorpay supports test-mode reads only; persistence/sync and webhooks are not yet connected. Banking and ERP entries are explicit mock/disconnected integrations.
- Slack can send configured receipt reminders, but inbound Slack events and file capture are not implemented.
- Local receipt storage is a development adapter without malware scanning, OCR, remote object storage, or an authorized download endpoint.
- AI output is constrained to qualitative explanations. Deterministic finance logic remains authoritative, and an unavailable hosted provider falls back to local Ollama.
- Chat threads, messages, controller decisions, tool steps, and agent runs are persisted and scoped to the authenticated organization/user.
- The bundled Keycloak realm runs with `start-dev`; production needs TLS, durable Keycloak storage, managed secrets, and deployment hardening.
- This is not a production payment system, tax-compliance product, or claim of regulatory certification.

## Demo workflow

1. Open `http://localhost:3000`, sign in as the finance controller, and open **Finora**.
2. Ask: `Why was settlement STL_0001 short?`
3. See the deterministic settlement breakdown: expected amount, received amount, gateway fee, GST, refund, and the explained variance.
4. Ask: `Investigate EXC_005.` See the AI-assisted qualitative explanation and typed proposal. This creates no financial adjustment and requires a later approval step.
5. Follow up with: `What does the gateway fee mean?` Finora carries forward the bounded settlement context and retrieves the same controlled record.
6. Ask: `Show unresolved exceptions above ₹25,000.`, `What is our expected cash position this week?`, or `Which GST lines failed to match?`
7. Open **Reconciliation** to inspect the latest measured run.
8. Open **Exceptions** to inspect the queue and its supporting reasons.
9. Open **Organization**, **Expenses**, **Agent control**, **Notifications**, and **Operations** to inspect the broader finance-hub foundation.
10. Run the evaluation harness to demonstrate batch-level accuracy—not a cherry-picked result.

The app supports normal route navigation. Server-persisted chat threads remain available when a finance user checks another workspace view and returns.

## Quick start

### Prerequisites

- Node.js **24 LTS** (the current development environment also accepts Node 26)
- pnpm **10.16+**
- Docker Engine with Docker Compose
- Optional: Ollama for local AI explanations

If pnpm is not available globally:

```bash
npm exec --package=pnpm@10.16.0 -- pnpm --version
npm exec --package=pnpm@10.16.0 -- pnpm install
```

### Run the complete local demo

```bash
git clone https://github.com/IamPritamAcharya/FinoraOS.git finora-os
cd finora-os
cp .env.example .env
pnpm install
pnpm db:generate
pnpm dev
```

`pnpm dev` checks ports, starts PostgreSQL, Redis, and Keycloak, waits for health, applies committed migrations, provisions the agent read-only role and RLS policies, refreshes the reproducible demo seed, then launches:

- Web: `http://localhost:3000`
- API: `http://localhost:3001/api`
- Keycloak: `http://localhost:8080`

Press `Ctrl+C` to stop the web/API processes and gracefully bring down the Docker services. To keep infrastructure alive after stopping development servers:

```bash
pnpm dev:keep-infra
```

For manual control instead:

```bash
pnpm infra:up
pnpm db:deploy
pnpm seed
pnpm dev:web
pnpm dev:api
```

### Demo identities

All seeded users use the development-only password `FinoraDemo2026!`.

| Role               | Username         | Primary access                                                               |
| ------------------ | ---------------- | ---------------------------------------------------------------------------- |
| Enterprise Admin   | `admin`          | Organization, budgets, skills, audit, policies, jobs, and integrations.      |
| Finance Controller | `finance`        | Organization-wide finance, reconciliation, exceptions, expenses, and Finora. |
| Employee           | `employee`       | Personal Finora context, expenses, receipt upload, and notifications.        |
| Employee           | `employee.rohan` | Personal Finora context, expenses, receipt upload, and notifications.        |

These accounts and secrets are local demo fixtures. Do not reuse them outside development.

## AI providers: hosted key first, local fallback

FinoraOS defaults to `AI_PROVIDER=auto`. In that mode it chooses the first configured hosted key in this order—Gemini, Groq, OpenRouter—and falls back to local Ollama when no key exists. If a hosted completion fails, the request is retried through Ollama. `AI_PROVIDER=mock` is reserved for deterministic tests and CI.

To use local Qwen as the normal fallback:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama run qwen3:4b-instruct-2507-q4_K_M "Reply with exactly: Finora ready"
```

Set these values in `.env` and restart `pnpm dev`:

```env
AI_PROVIDER=auto
AI_MODEL=qwen3:4b-instruct-2507-q4_K_M
OLLAMA_BASE_URL=http://localhost:11434
```

Add one hosted key when you want it to take precedence:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

# Or use one of these OpenAI-compatible providers:
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemma-3-27b-it:free
```

Then ask Finora:

```text
Why was settlement STL_0001 short?
```

Finora calculates the amounts itself. The model can only contribute a concise, number-free qualitative explanation; it cannot generate SQL or mutate financial records.

For the AI-backed exception workflow, ask:

```text
Investigate EXC_005.
```

Finora invokes the existing Exception Investigator with controlled evidence. It persists only an agent run, a typed **proposal**, and an audit event; raw imported records are not changed, and no proposal is approved or closed from chat.

### Tenant-safe agent reads

`pnpm dev` provisions `finora_agent_ro` before seeding. This separate PostgreSQL identity has `SELECT` only, no sequence or inherited privileges, `NOBYPASSRLS`, and read-only transactions. Every controlled read sets a transaction-local organization context; PostgreSQL row-level security returns no rows when the context is absent or belongs to another tenant. You can re-run and verify the setup directly:

```bash
pnpm db:agent-role
```

The model never receives this connection URL or SQL access. It chooses only from the typed tool catalogue. The API verifies the Keycloak token, resolves `sub + organization_id` to an active database membership, applies database-owned permissions, and supplies that trusted organization context to every tool.

The API emits compact human-readable logs in development and structured JSON logs in production for gateway selection, completions, hosted-to-local fallback, request completion, reconciliation runs, and exception investigations. Prompts, API keys, authorization headers, and credentials are never logged.

## Evaluation

Run the exact deterministic engine used by the API against the checked-in synthetic dataset:

```bash
pnpm eval:reconciliation
```

Current expected baseline:

```text
FinoraOS Reconciliation Evaluation

Records processed             240
Correct matches                108
Incorrect matches                0
False auto-matches              0

Exceptions                      12
Unexpected exceptions            0
Unresolved count                12

Match accuracy               100.00%
```

These are measured results from the fixture and ground truth—not dashboard placeholders. Difficult cases remain visible as exceptions rather than being hidden to inflate the score.

## Architecture

```text
apps/web                 Next.js 16 workspace and Finora chat UI
apps/api                 NestJS API, finance/reconciliation modules and gateways
packages/platform        Shared enums, Zod schemas, money helpers, logger
packages/reconciliation  Pure deterministic matching engine
packages/agents          Controlled agent capabilities and typed tool contracts
packages/ui              Finora design tokens, primitives, finance presentation
prisma                   PostgreSQL schema, migrations and reproducible seed
datasets                 Checked-in synthetic inputs and expected ground truth
evals                    Batch-level accuracy and exception metrics
infra                    Local Keycloak realm and development infrastructure assets
```

### Provider and safety boundaries

```text
Finance / reconciliation services → gateway contracts → external systems
Agent capability → controlled organization-scoped tools → AI gateway
LLM output → Zod validation → policy / approval → audit record
```

Business modules do not import vendor SDKs directly. Agents do not import Prisma. Raw imported records remain traceable, monetary values use PostgreSQL `Decimal(18,2)` plus `decimal.js`, and API boundaries use strings for money.

## Commands

| Command                             | Purpose                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`                          | Start infrastructure, migrate, seed, start web/API; shut down services on Ctrl+C. |
| `pnpm dev:keep-infra`               | Same as `dev`, but retains Docker services on exit.                               |
| `pnpm infra:up` / `pnpm infra:down` | Start or stop PostgreSQL, Redis, and Keycloak.                                    |
| `pnpm db:generate`                  | Generate the Prisma client after a fresh install or schema change.                |
| `pnpm db:migrate`                   | Create and apply a development migration.                                         |
| `pnpm db:deploy`                    | Apply committed migrations.                                                       |
| `pnpm db:agent-role`                | Provision and verify the SELECT-only, RLS-protected agent database role.          |
| `pnpm seed`                         | Refresh the deterministic Acme Commerce India demo data.                          |
| `pnpm check`                        | Format check, lint, typecheck, and tests.                                         |
| `pnpm check:enums`                  | Verify Prisma and shared platform enum values do not drift.                       |
| `pnpm eval:reconciliation`          | Run reconciliation evaluation against ground truth.                               |
| `pnpm build`                        | Build all workspace packages with low concurrency.                                |

## Repository conventions

- Read [AGENTS.md](AGENTS.md), [docs/STATUS.md](docs/STATUS.md), [docs/DECISIONS.md](docs/DECISIONS.md), and [docs/ROADMAP.md](docs/ROADMAP.md) before substantial changes.
- Reuse the FinoraOS shared tokens and components in `packages/ui`; preserve [the brand system](docs/BRANDING.md).
- Keep reconciliation logic deterministic and isolated in `@finora/reconciliation`.
- Never let an LLM issue arbitrary SQL, calculate authoritative monetary values, or mutate financial records directly.
- Use Conventional Commits. Hooks remain lightweight and never call Ollama.

## Documentation

- [Current project status and handoff](docs/STATUS.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Product roadmap](docs/ROADMAP.md)
- [FinoraOS visual identity](docs/BRANDING.md)
- [Synthetic dataset notes](datasets/synthetic/README.md)

## License

This Buildathon prototype has no published license yet. Do not treat it as an official Razorpay product or production financial service.
