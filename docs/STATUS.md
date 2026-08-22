# FinoraOS Status

Last updated: 2026-08-22  
Current phase: UI system reset in progress
Last verified commit: `83451f9 feat(chat): redesign light conversation workspace` (functionally verified; visual direction rejected)

## Current state

The repository contains a functional V1 architecture and web/API implementation. Chat is the default primary operating surface. Finora now owns the UI system in `packages/ui`; do not add an external component system or route-level generic UI primitives. `pnpm dev` owns the local Docker lifecycle, applies migrations, refreshes the reproducible demo seed, and starts the web/API. A real terminal Ctrl+C test confirmed it removes the Compose services and network.

## Completed

- pnpm/Turbo workspace; pinned Node/pnpm, Docker Compose, environment example and hooks.
- Shared enums/schemas/logger/money helper and Prisma enum drift check.
- Synthetic 120-transaction / 12-settlement / 14-exception seed model and evaluation harness.
- Finance, reconciliation, controlled AI/chat and exception-agent API boundaries.
- FinoraOS visual identity, SVG assets, branded responsive workspace.
- Finora UI package owns tokens and shared primitives; the web app no longer uses Razorpay Blade at runtime.
- Vercel AI SDK chat state is integrated through a same-origin Next transport that calls Finora's controlled Nest chat endpoint.
- Real local Qwen/Ollama smoke test passed. Settlement chat returns deterministic INR evidence; the model can add only a validated, number-free qualitative note.
- `pnpm dev` uses persistent signal handlers because pnpm forwards interactive Ctrl+C twice; containers are reliably brought down after either signal.

## In progress

- Expand the Finora UI baseline with shared app shell/navigation/drawer/composer/message/evidence primitives and rebuild remaining route-level UI from it.

## Next highest-priority tasks

1. Replace the rejected custom Chat layout with a design-system-composed screen and perform visual review before further feature work.
2. Add browser/component tests for the chat transport and evidence-card interactions; maintain the API smoke test in CI.
3. Finish Gemini/OpenAI-compatible gateway adapters and true token/tool streaming from the Nest API.

## Known issues

- The Finora UI component catalog is newly established and needs component/visual tests before broad adoption.

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
