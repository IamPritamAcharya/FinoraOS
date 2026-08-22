# FinoraOS decisions

## Stack and boundaries

- **All-TypeScript pnpm monorepo:** shared platform contracts remove enum drift between Next, Nest and agents. Node 24 LTS is pinned; Node 26 is accepted for this development environment.
- **Next 16 + React 19 + Nest 11:** current compatible versions were checked. FinoraOS uses its own component system in `packages/ui`, with locally bundled Manrope typography and shared Finora tokens/primitives. Razorpay Blade is intentionally not a runtime UI dependency; we retain Finora’s own product identity and visual conventions.
- **Prisma 7 + PostgreSQL:** Prisma 7 uses `prisma.config.ts` for the migration connection URL and `@prisma/adapter-pg` in the runtime client. This matches current tooling and prevents schema-editor version drift. Persistence stays behind domain services/repositories when queries become non-trivial.
- **Gateway boundary:** vendor SDKs live under `apps/api/src/gateways`; business modules depend on contracts, not Razorpay/Ollama implementations.
- **Pure reconciliation package:** `@finora/reconciliation` owns the deterministic matching pipeline and has no Nest, Prisma, HTTP, AI, environment, clock, or mutable-state dependency. The API maps organization-scoped imported records into explicit engine inputs, then persists its output transactionally. Evaluation and API orchestration use this exact engine, preventing metric/demo drift.
- **Chat client state:** the web client uses Vercel AI SDK's `useChat` with a same-origin text transport. This gives the chat UI reliable message/state/stop handling without allowing a browser or model to access Prisma directly. The transport delegates to the existing controlled Nest endpoint; backend token/tool streaming remains a deliberate V1.x improvement rather than a fake stream.

## Financial and AI safety

- **Money:** PostgreSQL `Decimal(18,2)`, decimal strings at API boundaries, and `decimal.js` for TypeScript arithmetic. Never use float addition for financial decisions.
- **Deterministic first:** IDs, references, amounts, date windows and settlement math are deterministic. The reconciliation stages are exact reference → settlement relationship → date window → explicit composite score. A candidate is consumed only once; ties, mismatches, low-confidence candidates, and missing counterparts become exceptions. AI sees only those exceptions and produces typed proposals validated by Zod. It cannot run arbitrary SQL or mutate records.
- **Local AI:** mock is the default for deterministic tests/CI. Ollama is selectable with `AI_PROVIDER=ollama`; hosted Gemini/OpenAI-compatible adapters are future gateway additions. Native Ollama is preferred over Docker for the target GPU. Settlement amounts and conclusions are always computed with `decimal.js`; local-model output is accepted only as a constrained, schema-like qualitative explanation with no amounts or calculations.
- **Approvals/audit:** proposed adjustments are internal simulations in V1 and require approval before a status is closed. Raw source metadata remains traceable.

## Deferred scope

No production claims, real-money actions, enterprise authentication, complete GST/TDS compliance, or full dark theme are implemented. Budgets are a later roadmap capability.
