# FinoraOS Status

Last updated: 2026-08-22  
Current phase: Deterministic reconciliation engine implemented; product-loop integration in progress
Last verified commit: `feat(reconciliation): add deterministic matching engine` (see `git log -1`)

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

## In progress

- Wire exception investigation to the configured AI gateway after the deterministic run, then expose rerun/approval/audit actions in the workspace.

## Next highest-priority tasks

1. Add a controlled reconciliation-run trigger and actual run metrics/exception evidence to the web UI.
2. Route exception investigation through the configured AI gateway, then support approval → rerun → close/escalate in the UI.
3. Replace remaining `Number(...)` money calculations in finance overview/forecast and make cash forecast/tax matching data-driven.

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

`pnpm@10.16.0` is installed for the current user and pinned in the repository. `AI_PROVIDER=ollama` is configured locally; `.env` remains untracked. `pnpm db:generate` must be run after a fresh dependency install before API type-checking, because Prisma generation is intentionally not an automatic package-install build script.

## Demo status

Acme Commerce India is seeded with 120 transactions, 12 settlements, 18 invoices/tax lines, and 14 exceptions.
