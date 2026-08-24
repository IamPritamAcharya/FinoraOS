# FinoraOS Status

Last updated: 2026-08-24
Current phase: Model-routed, RLS-backed agent read foundation complete; approval/rerun product loop follows
Last verified commit: see `git log -1`

## Current state

The repository contains a functional V1 architecture and web/API implementation. Chat is the default primary operating surface. Finora now owns the UI system in `packages/ui`; do not add an external component system or route-level generic UI primitives. `pnpm dev` owns the local Docker lifecycle, applies migrations, refreshes the reproducible demo seed, and starts the web/API. A real terminal Ctrl+C test confirmed it removes the Compose services and network.

## Completed

- pnpm/Turbo workspace; pinned Node/pnpm, Docker Compose, environment example and hooks.
- Shared enums/schemas/logger/money helper and Prisma enum drift check.
- Synthetic 120-transaction / 12-settlement / 14-exception seed model and evaluation harness.
- Finance, reconciliation, controlled AI/chat and exception-agent API boundaries.
- FinoraOS visual identity, SVG assets, branded responsive workspace.
- Finora UI package owns tokens and shared primitives; the web app no longer uses Razorpay Blade at runtime.
- Web styles are scoped by boundary: global foundations, workspace route, sidebar, and chat. Shared buttons and icons live in `packages/ui`.
- Pure `@finora/reconciliation` package with explicit exact-reference, settlement-relationship, date-window, and composite-score stages; ambiguity is never auto-matched.
- `POST /api/reconciliation/runs` maps organization-scoped seeded finance records into mock-bank counterparts, runs the shared engine, persists a run/matches/exceptions/evidence/audit event inside a transaction, and returns the real result.
- Engine evaluation now runs the exact package over a checked-in 240-record synthetic fixture: 108 expected correct matches, 12 exceptions, and zero false auto-matches.
- Vercel AI SDK chat state is integrated through a same-origin Next transport that calls Finora's controlled Nest chat endpoint.
- Real local Qwen/Ollama smoke test passed. Settlement chat returns deterministic INR evidence; the model can add only a validated, number-free qualitative note.
- `pnpm dev` uses persistent signal handlers because pnpm forwards interactive Ctrl+C twice; containers are reliably brought down after either signal.
- Root README is now a Buildathon-ready project entry point with setup, demo, safety, architecture, evaluation and command guidance, plus a committed FinoraOS banner asset.
- API-key-first AI selection: Gemini, Groq, and OpenRouter can be configured; otherwise local Ollama is selected. Hosted completion failures retry through Ollama. Mock remains an explicit test/CI provider.
- Exception investigation is now routed through the same configured API gateway as settlement chat; agent output remains guarded and cannot determine amounts or resolution state.
- Structured Pino logs now cover request completion with correlation IDs, AI selection/completion/fallback, deterministic reconciliation metrics, and exception-investigation lifecycle. Credentials and prompts are not logged.
- General Finora conversation now calls the configured gateway rather than repeating a static fallback; settlement math and record-specific answers remain deterministic and controlled.
- Chat now recognizes a controlled exception reference such as `Investigate EXC_005.`, invokes the existing Exception Investigator through the configured AI gateway, and renders its typed proposal in chat. The operation writes only derived agent/proposal/audit records in one database transaction; it never changes raw imported records or approves/closes an exception.
- The deterministic Controller Agent now routes bounded conversation context to approved settlement lookup, exception lookup/investigation, exception list, cash forecast, and tax-mismatch tools. Follow-up settlement questions reuse a prior controlled ID; generic model requests never receive database access or conversation evidence.
- Finance overview and forecast aggregation now use the shared Decimal money helper instead of `Number(...)` arithmetic.
- `pnpm dev` now provisions the separate local `finora_agent_ro` PostgreSQL role before seeding; `pnpm db:agent-role` is available for manual role provisioning.
- The Controller Agent now asks the configured AI gateway to select a Zod-validated allowlisted tool call instead of relying on phrase regexes. The catalogue includes organization users, transactions, invoices, settlements, exceptions/evidence, tax lines, cash forecast, reconciliation runs, audit events, and agent runs.
- Controlled agent reads now execute through the separate `finora_agent_ro` role with `SELECT` only, `NOBYPASSRLS`, read-only transactions, and organization RLS policies. A missing or wrong tenant context produces zero rows; the provisioning command verifies this live.

## In progress

- Expose controlled reconciliation rerun, agent investigation, approval, and audit actions in the workspace.

## Next highest-priority tasks

1. Add a controlled reconciliation-run trigger and actual run metrics/exception evidence to the web UI.
2. Support approval → rerun → close/escalate in the UI, including visible agent/tool activity.
3. Render structured result cards/tables for chat exception lists, cash forecast, and tax mismatches instead of the current evidence-grounded text rows.
4. Make cash forecast/tax matching more data-driven and expand controlled chat tools to record search and reconciliation-run status.

## Known issues

- The V1 banking source is a traceable mock-bank projection from seeded transaction metadata; a persisted bank-statement import model/connector is later work.
- Reconciliation-match evidence is available in the pure engine output and audit logs; the narrow V1 Prisma match table does not yet store its full evidence payload separately.

## Commands last verified

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @finora/web build`
- `pnpm check:enums`
- `pnpm test`
- `pnpm eval:reconciliation`
- `pnpm db:migrate --name init`
- `pnpm seed`

## Environment notes

`pnpm@10.16.0` is installed for the current user and pinned in the repository. `.env` remains untracked. Use `AI_PROVIDER=auto` for hosted-key-first selection with Ollama fallback; restart the API after environment changes. `pnpm db:generate` must be run after a fresh dependency install before API type-checking, because Prisma generation is intentionally not an automatic package-install build script.

## Demo status

Acme Commerce India is seeded with 120 transactions, 12 settlements, 18 invoices/tax lines, and 14 exceptions.
