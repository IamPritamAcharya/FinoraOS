# FinoraOS system design

> Architecture reference for the implemented V1 as of 2 September 2026. Solid lines are working paths. Dashed lines are adapters or capabilities that are not end-to-end.

![FinoraOS system design](assets/finoraos-system-design.png)

## 1. System intent

FinoraOS is an **AI-native finance operations OS**: a governed control plane connecting financial records, employees, organization structure, receipts, budgets, reconciliation, agents, approvals, notifications, integrations, and audit.

It is not intended to replace a general ledger or ERP in V1. It sits across finance sources and closes operational loops while retaining evidence and human control.

The flagship loop is:

```text
multi-source records
  → deterministic reconciliation
  → honest exceptions
  → scoped AI investigation
  → typed proposal
  → human approval
  → controlled execution
  → audit and reconciliation rerun
```

The governing principle is: **deterministic software verifies; AI interprets ambiguity; policy controls action.**

## 2. Actors and access boundaries

| Actor              | Product scope                                                                                          | Agent scope                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Employee           | Own expense claims, receipt evidence, reimbursement state, and notifications                           | Own-profile and own-expense read tools only                             |
| Finance Controller | Organization finance records, reconciliation, exceptions, expense review, and Finora                   | Organization finance tools, investigation, and approval-gated proposals |
| Enterprise Admin   | Organization hierarchy, budgets, spend controls, skills, integrations, policies, operations, and audit | Administrative read tools and permitted governed actions                |
| Auditor            | Tenant audit and permitted finance evidence                                                            | Read-only audit tools; no investigation or writes                       |
| System jobs        | Receipt reminders and recorded automation runs                                                         | No free-form model authority                                            |

Keycloak authenticates the person, but the database membership is authoritative for the workspace role. NestJS resolves `subject + organization_id` to that membership on every request. UI visibility is a usability boundary; API permissions and database tenancy remain the security boundaries.

## 3. Container and component architecture

```mermaid
flowchart TB
  ACTORS["Employee · Finance Controller · Enterprise Admin · Auditor"]

  subgraph EXTERNAL["External systems"]
    KC["Keycloak 26\nOIDC + PKCE"]
    MODELS["Gemini · Groq · OpenRouter\nOllama / Qwen3 local fallback"]
    RAZORPAY["Razorpay test mode\nread adapter"]
    SLACK["Slack\noutbound reminders"]
    CI["GitHub Actions\nresource-bounded CI"]
  end

  subgraph WEB["Web · Next.js 16 / React 19"]
    WORKSPACE_UI["FinoraOS workspace\nOverview · Records · Exceptions\nOrganization · Operations · Audit"]
    CHAT_UI["Finora conversational UI\nread/write mode · tool activity\nartifacts · approval diffs"]
    UI["@finora/ui\ntokens · primitives · finance formats"]
    SESSION["NextAuth\nencrypted HTTP-only session"]
  end

  subgraph API["API · NestJS 11"]
    AUTH["Auth and request context\nJWT verification · membership · permission"]
    FINANCE["Finance\nrecords · overview · cash · tax"]
    RECON["Reconciliation\nruns · matches · exceptions · metrics"]
    WORKSPACE["Workspace\norganization · budgets · expenses\nskills · notifications · operations"]
    CHAT["Chat\nthreads · bounded context · UI messages"]
    TOOLS["Agents and tools\nrole allowlist · Zod validation\nagent-run persistence"]
    MUTATIONS["Governed mutations\ntyped diff · approval · version check"]
    AUDIT["Unified audit\nuser · system · agent events"]
    JOBS["Automation jobs\nreceipt reminder schedule and runs"]
  end

  subgraph DOMAIN["Pure and shared packages"]
    AGENT["@finora/agents\nrole-aware multi-tool controller\nno Prisma, credentials, or SQL"]
    ENGINE["@finora/reconciliation\nexact · relationship · date window · score\nambiguity becomes exception"]
    SPEND["@finora/spend-policy\nancestor hard limits\nsoft category warnings"]
    PLATFORM["@finora/platform\nenums · Zod · Decimal money\npermissions · logger contracts"]
  end

  subgraph GATEWAYS["External-provider gateways"]
    AIGW["AI Gateway\nhosted-first selection + local fallback"]
    PAYGW["Payment Gateway\nmock + Razorpay test adapter"]
    BANKGW["Banking Gateway\nmock adapter"]
    DOCGW["Document Storage Gateway\nlocal bounded files"]
    MSGGW["Messaging Gateway\nmock + Slack outbound"]
  end

  subgraph DATA["Data and execution identities"]
    PG[("PostgreSQL 16\nfinance · people · policy · evidence\nchat · runs · jobs · audit")]
    APP["Application identity\nPrisma transactional persistence"]
    RO["finora_agent_ro\nSELECT only · read-only transaction\nNOBYPASSRLS"]
    RW["finora_agent_rw\ncolumn-limited UPDATE\nNOBYPASSRLS · no delete"]
    RLS["Organization RLS\ntransaction-local tenant context"]
    FILES[("Local receipt files\ndevelopment adapter")]
    REDIS[("Redis 7\nhealthy; no active V1 workload")]
  end

  ACTORS --> WORKSPACE_UI
  ACTORS --> CHAT_UI
  UI --> WORKSPACE_UI
  UI --> CHAT_UI
  WORKSPACE_UI --> SESSION
  CHAT_UI --> SESSION
  SESSION <--> KC
  SESSION -->|"JWT"| AUTH

  AUTH --> FINANCE
  AUTH --> RECON
  AUTH --> WORKSPACE
  AUTH --> CHAT
  AUTH --> MUTATIONS
  AUTH --> AUDIT

  CHAT --> AGENT
  AGENT -->|"typed tool plan"| TOOLS
  TOOLS -->|"controlled read"| RO
  AGENT -->|"planning and explanation"| AIGW
  AIGW --> MODELS

  RECON --> ENGINE
  ENGINE -->|"matches · exceptions · metrics"| RECON
  WORKSPACE --> SPEND
  MUTATIONS --> SPEND
  WORKSPACE --> JOBS

  FINANCE --> APP
  RECON --> APP
  WORKSPACE --> APP
  CHAT --> APP
  TOOLS --> APP
  MUTATIONS --> APP
  AUDIT --> APP
  JOBS --> APP
  APP --> PG

  RO --> RLS --> PG
  MUTATIONS -->|"approved exact diff"| RW
  RW --> RLS
  MUTATIONS -->|"same transaction"| AUDIT

  WORKSPACE --> DOCGW --> FILES
  JOBS --> MSGGW --> SLACK
  WORKSPACE -.->|"adapter; sync not connected"| PAYGW
  PAYGW -.-> RAZORPAY
  WORKSPACE -.->|"mock only"| BANKGW
  CI --> PLATFORM
  CI --> AGENT
  CI --> ENGINE
  CI --> SPEND
```

## 4. Domain ownership

| Boundary         | Owns                                                                                                                            | Does not own                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Finance          | Payments, settlements, invoices, tax lines, cash movements, forecasts, record projections                                       | Agent planning or vendor SDKs                 |
| Reconciliation   | Runs, deterministic matches, active exception snapshots, evidence, measured metrics                                             | LLM decisions                                 |
| Workspace        | Organization nodes, budgets, spend limits, expense claims, receipts, skills, notifications, jobs, policies, connection metadata | Raw provider integrations                     |
| Chat             | Threads, messages, bounded conversation context, UI-message responses                                                           | Unrestricted database access                  |
| Agents and tools | Permission-filtered tool catalogue, execution, investigations, agent runs and steps                                             | Prisma inside agent packages                  |
| Mutations        | Typed proposals, expiry, approval/rejection, optimistic execution                                                               | Arbitrary SQL, deletes, or unapproved changes |
| Audit            | Tenant-scoped history across user, agent, automation, and finance actions                                                       | Business-state authority                      |
| Gateways         | AI, payment, banking, messaging, and document provider boundaries                                                               | Finance business rules                        |

## 5. Controlled read path

Finora is read-only by default. The controller can plan a bounded multi-tool query, but it cannot construct SQL or receive database credentials.

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as Finora chat
  participant API as Chat service
  participant Controller as FinanceAgent
  participant Tools as Finance tools
  participant RO as finora_agent_ro
  participant DB as PostgreSQL + RLS
  participant Model as Configured AI gateway

  User->>UI: Ask a natural-language finance question
  UI->>API: Message + thread + read mode
  API->>API: Verify JWT, membership, role and organization
  API->>Controller: Message + bounded context + permitted tools
  Controller->>Model: Request a typed plan using tool names only
  Model-->>Controller: One or more Zod-shaped tool calls
  Controller->>Tools: Execute allowlisted calls
  Tools->>RO: Begin read-only transaction with tenant context
  RO->>DB: Parameterized organization-scoped reads
  DB-->>RO: Rows visible through RLS
  RO-->>Tools: Structured records and deterministic aggregates
  Tools-->>Controller: Evidence, summaries and UI artifacts
  Controller->>Model: Ask for grounded synthesis with citations
  Model-->>Controller: Evidence-bound answer
  Controller-->>API: Answer + activity + artifacts
  API->>DB: Persist message and agent-run trace
  API-->>UI: UI-message stream
```

Safety properties:

- Allowed tools are derived from the database-owned role before planning and checked again before execution.
- `finora_agent_ro` has `SELECT` only, read-only transactions, no inherited privileges, and `NOBYPASSRLS`.
- Missing or invalid organization context returns no rows.
- Decimal calculations and record filtering happen in deterministic TypeScript/SQL, not in prompts.
- The answer is checked against observations; structured tables and metrics originate from tools.

## 6. Governed write path

Chat write mode does not grant the model write access. It only makes the proposal tool available to an authorized role.

```mermaid
sequenceDiagram
  autonumber
  actor FC as Authorized user
  participant UI as Finora chat
  participant API as Mutation service
  participant DB as PostgreSQL
  participant RW as finora_agent_rw
  participant Audit as Audit log

  FC->>UI: Explicitly enable write mode
  FC->>UI: Request exact record and field change
  UI->>API: Message + writeMode=true
  API->>API: Recheck MANAGE_FINANCE_RECORDS permission
  API->>DB: Load current tenant record and version
  API->>DB: Store expiring typed before/after proposal
  API-->>UI: Render diff with no mutation performed
  FC->>UI: Approve exact proposal
  UI->>API: Proposal ID + explicit approval
  API->>DB: Atomically claim pending proposal
  API->>RW: Apply allowlisted fields with tenant context and version
  RW->>DB: Column-limited UPDATE through RLS
  API->>Audit: Append actor, evidence, before and after state
  API-->>UI: Executed or safely rejected as stale/expired

  Note over API,DB: Rejection, expiry, stale version, or failure leaves the record unchanged
```

The writer cannot modify external IDs or organization ownership and has no `DELETE`, `TRUNCATE`, arbitrary `INSERT`, schema, or sequence privileges. Write mode is deliberately non-persistent.

## 7. Reconciliation and exception-closure path

```mermaid
sequenceDiagram
  autonumber
  actor FC as Finance Controller
  participant UI as Overview / Exceptions
  participant API as Reconciliation service
  participant DB as PostgreSQL
  participant Engine as Deterministic engine
  participant Agent as Exception Investigator
  participant AI as AI Gateway
  participant Audit as Audit

  FC->>UI: Run reconciliation
  UI->>API: POST reconciliation run
  API->>DB: Load organization-scoped source records
  API->>Engine: Explicit records and thresholds
  Engine->>Engine: Exact reference → relationship → date window → score
  Engine-->>API: Matches, exceptions and metrics
  API->>DB: Persist new snapshot transactionally
  API->>DB: Supersede prior active exception snapshot
  API->>Audit: Reconciliation completed
  API-->>UI: Coverage and honest review queue

  FC->>UI: Investigate an exception
  UI->>API: Controlled investigation request
  API->>DB: Load only scoped exception evidence
  API->>Agent: Structured evidence
  Agent->>Agent: Calculate settlement variance deterministically
  Agent->>AI: Request number-free qualitative explanation
  AI-->>Agent: Explanation
  Agent->>Agent: Validate typed resolution with Zod
  Agent->>DB: Persist run, tool steps and proposal
  Agent->>Audit: Resolution proposed
  API-->>UI: Evidence, confidence and approval action

  FC->>UI: Approve proposal
  UI->>API: Explicit approval
  API->>DB: Create idempotent derived adjustment
  API->>Audit: Resolution approved and executed
  API->>Engine: Rerun deterministic reconciliation

  Note over API,DB: Imported source records remain traceable and are not silently overwritten
```

## 8. Employee receipt and expense-review path

```mermaid
sequenceDiagram
  autonumber
  actor Employee
  actor Finance as Finance Controller
  participant UI as Records / Notifications
  participant API as Workspace service
  participant Policy as Spend-policy engine
  participant Files as Document gateway
  participant DB as PostgreSQL
  participant Jobs as Reminder scheduler
  participant Slack as Messaging gateway

  Jobs->>DB: Find due receipt requests
  Jobs->>Slack: Send bounded receipt reminder
  Jobs->>DB: Record attempt and notification
  Employee->>UI: Open own expense and upload PDF/image
  UI->>API: Receipt + optional category
  API->>Files: Store bounded file and hash
  API->>Policy: Re-evaluate the selected category envelope
  API->>DB: Link immutable document metadata
  API->>DB: Mark request received and claim submitted
  API->>DB: Audit receipt state transition
  Finance->>UI: Review claim and evidence
  Finance->>API: Approve or reject with current version
  API->>DB: Persist decision, notify claimant and audit actor
```

Hard spend limits reject a prohibited new spend. Soft category limits preserve the record and create deduplicated notifications for Finance and the relevant node owner. Receipt evidence is stored separately from the imported financial record.

## 9. Organization and policy model

```mermaid
flowchart LR
  ORG["Organization"] --> OFFICE["Office"]
  OFFICE --> DEPT["Department"]
  DEPT --> TEAM["Team / cost centre"]
  TEAM --> EMP["Employee position"]

  PERIOD["Budget period"] --> BUDGET["Node budget"]
  BUDGET --> LIMIT["Hard spend limit"]
  LIMIT --> CATEGORIES["Soft category envelopes"]
  OFFICE -.-> BUDGET
  DEPT -.-> BUDGET
  TEAM -.-> BUDGET
  EMP -.-> BUDGET

  EXPENSE["Expense or payable"] --> POLICY["@finora/spend-policy"]
  POLICY -->|"within ancestor limits"| ACCEPT["Persist record"]
  POLICY -->|"hard limit exceeded"| REJECT["Reject with deterministic reason"]
  POLICY -->|"category exceeded"| WARN["Persist + notify Finance and owner"]
```

Organization nodes are generic so an enterprise can model offices, departments, teams, cost centres, or employee positions without introducing a table for every hierarchy type. A child allocation cannot exceed its parent envelope.

## 10. Persistence and traceability

PostgreSQL is the source of truth for:

- organizations, users, memberships, and hierarchy nodes;
- budgets, spend limits, and category envelopes;
- transactions, settlements, invoices, tax lines, cash accounts and movements;
- expense claims, receipt requests, and immutable document metadata;
- reconciliation runs, matches, exceptions, evidence, proposals, and adjustments;
- chat threads/messages, agent runs/steps, and custom skill versions;
- notifications, integration metadata, policies, automation jobs/runs, and audit events.

Money uses `Decimal(18,2)` in PostgreSQL, decimal strings at API boundaries, and `decimal.js` in TypeScript. Currency is explicit on monetary records. Raw imports retain source metadata; corrections create traceable state transitions instead of erasing provenance.

## 11. Evaluation and reproducibility

```mermaid
flowchart LR
  FIXTURE["Checked-in 240-record fixture"] --> ENGINE["Exact same @finora/reconciliation engine"]
  TRUTH["Checked-in ground truth"] --> COMPARE["Deterministic comparison"]
  ENGINE --> COMPARE
  COMPARE --> REPORT["108 correct matches\n12 honest exceptions\n0 false auto-matches\n100% match accuracy"]
```

The API and `pnpm eval:reconciliation` import the same pure engine. The evaluation does not call Ollama, a hosted model, Prisma, or a live integration. This prevents the demo metric from drifting away from the application algorithm.

CI runs frozen dependency installation, enum synchronization, formatting, lint, typechecking, unit tests, and a production build in one resource-bounded job. AI tests use `MockAiGateway`.

## 12. Runtime and failure behavior

| Failure                                         | System behavior                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Hosted AI provider unavailable                  | Gateway falls back to local Ollama when configured                                          |
| All AI unavailable                              | Deterministic finance features remain available; AI path returns a clear failure            |
| Invalid model tool plan                         | Zod validation, retry with schema feedback, then conservative deterministic routing/failure |
| Unauthorized tool selection                     | Execution layer rejects it even if the model requested it                                   |
| Missing tenant context                          | Agent database identities return zero rows through RLS                                      |
| Duplicate or ambiguous reconciliation candidate | Record remains an exception; no unsafe auto-match                                           |
| Duplicate reconciliation run                    | Prior active exception snapshot is superseded, not duplicated                               |
| Stale mutation proposal                         | Optimistic version check rejects it without changing data                                   |
| Expired/rejected proposal                       | No writer execution occurs                                                                  |
| Receipt category overage                        | Record remains visible; targeted warning is emitted                                         |
| Hard spend-limit breach                         | Record/import row is rejected with a deterministic reason                                   |
| Reminder delivery failure                       | Automation run records the outcome for Operations review                                    |

Development logs are compact and colored; production logs are structured JSON. Logs include request, organization, reconciliation, exception, and agent-run identifiers where relevant, while redacting credentials, authorization headers, secrets, and prompt/record bodies.

## 13. Development deployment topology

```mermaid
flowchart LR
  BROWSER["Browser\nlocalhost:3000"] --> WEB["Next.js\nlocal Node process"]
  WEB --> API["NestJS API\nlocalhost:3001"]
  WEB --> KC["Keycloak 26\nDocker :8080"]
  API --> PG[("PostgreSQL 16\nDocker :5432")]
  API --> REDIS[("Redis 7\nDocker :6379")]
  API --> OLLAMA["Native Ollama\nQwen3 4B"]
  API --> FILES[".data/documents\nlocal development storage"]
```

`pnpm dev` performs port preflight, starts PostgreSQL, Redis, and Keycloak, waits for health, deploys migrations, provisions and verifies both agent database roles, refreshes the deterministic seed, and starts web/API processes. On termination it shuts down child processes and the development containers.

## 14. Implemented versus integration-ready

| Area                                                                                   | V1 status                                                                                          |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Reconciliation engine, transactional persistence, metrics and evaluation               | Implemented and tested                                                                             |
| Exception investigation, typed proposal, approval, derived adjustment, audit and rerun | Implemented; no real-money movement                                                                |
| Role-aware multi-tool chat                                                             | Implemented with controlled tools and persisted threads                                            |
| Agent read mode                                                                        | Implemented with `finora_agent_ro` and organization RLS                                            |
| Agent write mode                                                                       | Implemented as approval-gated, allowlisted field updates through `finora_agent_rw`                 |
| Keycloak login and database-owned RBAC                                                 | Implemented for development                                                                        |
| Employee receipt upload and finance review                                             | Implemented with a local document adapter                                                          |
| Organization hierarchy, budgets and spend controls                                     | Implemented with deterministic policy checks                                                       |
| Custom skills, notifications, jobs, operations and unified audit                       | Implemented                                                                                        |
| Razorpay                                                                               | Test-mode read adapter exists; synchronization, cursors and webhooks are not connected             |
| Banking / ERP                                                                          | Explicitly mocked or disconnected                                                                  |
| Slack                                                                                  | Outbound reminders implemented; inbound receipt capture is not implemented                         |
| Receipt processing                                                                     | Upload and evidence workflow implemented; OCR, malware scanning and object storage are future work |
| Redis                                                                                  | Healthy development service; no active V1 application workload                                     |
| Autonomous closure                                                                     | Disabled; sensitive proposals require a human                                                      |

## 15. Core guarantees

- The model never receives SQL, database credentials, raw write authority, or permission to invent amounts.
- The authenticated identity, database membership, permission checks, and organization RLS determine access—not prompt text.
- Every sensitive chat change is a typed, expiring diff requiring explicit approval.
- Exact finance arithmetic, matching, limits, status validation, and version checks are deterministic.
- Imported source records and receipt evidence remain traceable.
- Every material user, agent, automation, approval, and mutation event is tenant-scoped and auditable.
- Difficult records remain visible as exceptions instead of being hidden to improve metrics.
