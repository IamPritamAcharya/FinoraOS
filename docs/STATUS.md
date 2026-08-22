# FinoraOS Status

Last updated: 2026-08-22  
Current phase: V1 primary chat workspace complete
Last verified commit: pending `feat(chat): build Finora operating workspace`

## Current state

The repository contains a functional V1 architecture and web/API implementation. Chat is now the default primary operating surface; `pnpm dev` owns the local Docker lifecycle, applies migrations, refreshes the reproducible demo seed, and starts the web/API. A real terminal Ctrl+C test confirmed it removes the Compose services and network.

## Completed

- pnpm/Turbo workspace; pinned Node/pnpm, Docker Compose, environment example and hooks.
- Shared enums/schemas/logger/money helper and Prisma enum drift check.
- Synthetic 120-transaction / 12-settlement / 14-exception seed model and evaluation harness.
- Finance, reconciliation, controlled AI/chat and exception-agent API boundaries.
- FinoraOS visual identity, SVG assets, branded responsive workspace.
- Blade 12 is integrated through its published package: provider/theme, fonts, and a real chat action component are in the Next app.
- Vercel AI SDK chat state is integrated through a same-origin Next transport that calls Finora's controlled Nest chat endpoint. The chat workspace has evidence cards, visible investigation activity, responsive finance context, keyboard send/stop, clear failure states, and reduced-motion-safe transitions.
- Real local Qwen/Ollama smoke test passed. Settlement chat returns deterministic INR evidence; the model can add only a validated, number-free qualitative note.
- `pnpm dev` uses persistent signal handlers because pnpm forwards interactive Ctrl+C twice; containers are reliably brought down after either signal.

## In progress

- No active implementation task; ready for the next V1 iteration.

## Next highest-priority tasks

1. Add browser/component tests for the chat transport and evidence-card interactions; maintain the API smoke test in CI.
2. Finish Gemini/OpenAI-compatible gateway adapters and true token/tool streaming from the Nest API.
3. Add persisted chat threads, reconciliation-run trigger/rerun, and human approval UI.

## Known issues

- Blade's current development build emits an upstream `motion()` deprecation warning. It does not fail type-checking, runtime, or production build.
- The direct Blade barrel import adds a substantial development compilation cost; add further Blade components deliberately and retain the package-import optimization.
- Test scripts are configured but focused test files are the next milestone.

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
