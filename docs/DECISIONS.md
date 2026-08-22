# FinoraOS decisions

## Stack and boundaries

- **All-TypeScript pnpm monorepo:** shared platform contracts remove enum drift between Next, Nest and agents. Node 24 LTS is pinned; Node 26 is accepted for this development environment.
- **Next 16 + React 19 + Nest 11:** current compatible versions were checked. Blade 12 declares React >=18 support, but its web peer set includes native/mobile dependencies and was not made the runtime component library in V1; FinoraOS uses Blade-informed accessible density/tokens with its own UI primitives. This avoids a fragile Next compatibility surface while retaining a clean future adoption path.
- **Prisma 7 + PostgreSQL:** Prisma 7 uses `prisma.config.ts` for the migration connection URL and `@prisma/adapter-pg` in the runtime client. This matches current tooling and prevents schema-editor version drift. Persistence stays behind domain services/repositories when queries become non-trivial.
- **Gateway boundary:** vendor SDKs live under `apps/api/src/gateways`; business modules depend on contracts, not Razorpay/Ollama implementations.

## Financial and AI safety

- **Money:** PostgreSQL `Decimal(18,2)`, decimal strings at API boundaries, and `decimal.js` for TypeScript arithmetic. Never use float addition for financial decisions.
- **Deterministic first:** IDs, references, amounts, date windows and settlement math are deterministic. AI sees only ambiguous exceptions and produces typed proposals validated by Zod. It cannot run arbitrary SQL or mutate records.
- **Local AI:** mock is the default for deterministic tests/CI. Ollama is selectable with `AI_PROVIDER=ollama`; hosted Gemini/OpenAI-compatible adapters are future gateway additions. Native Ollama is preferred over Docker for the target GPU.
- **Approvals/audit:** proposed adjustments are internal simulations in V1 and require approval before a status is closed. Raw source metadata remains traceable.

## Deferred scope

No production claims, real-money actions, enterprise authentication, complete GST/TDS compliance, or full dark theme are implemented. Budgets are a later roadmap capability.
