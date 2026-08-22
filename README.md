# FinoraOS

**AI-native financial operations** — **Reconcile. Investigate. Close.**

FinoraOS is a Razorpay AI Buildathon 2026 prototype for finance teams that need trustworthy reconciliation, explainable settlement investigation, and controlled operational actions. Deterministic software matches what is verifiable; AI is reserved for ambiguous exception work.

```text
Next.js workspace ──► Nest API ──► Finance / reconciliation services ──► Prisma + PostgreSQL
       │                    │                    │
       └──── shared platform contracts ───── controlled tools ───── AI/payment/banking gateways
```

## Quick start

Prerequisites: Node 24 LTS (Node 26 works in the current dev environment), Docker Compose, and pnpm 10.16. If pnpm is unavailable: `npm exec --package=pnpm@10.16.0 -- pnpm install`.

```bash
cp .env.example .env
pnpm install
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm seed
pnpm dev
```

`pnpm dev` starts PostgreSQL and Redis, applies existing migrations, refreshes the deterministic demo seed, then starts the web/API. Press `Ctrl+C` for a graceful shutdown; it stops both app processes and brings the compose containers down. Set `FINORA_KEEP_INFRA=1 pnpm dev` to leave containers running. Open `http://localhost:3000`; API is `http://localhost:3001/api`.

For local AI on Linux, install Ollama natively, then pull the development model:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve
# In a second terminal
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama run qwen3:4b-instruct-2507-q4_K_M "Reply with OK"
```

Set `AI_PROVIDER=ollama` in `.env` and restart `pnpm dev`. Normal tests use the deterministic mock and never require a model.

## Useful commands

`pnpm check`, `pnpm test`, `pnpm build`, `pnpm check:enums`, `pnpm eval:reconciliation`, `pnpm infra:down`, `pnpm db:studio`.

The seed includes 120 transactions, 12 settlements and 14 honest exceptions. The evaluation reports match and closure accuracy from checked-in ground truth.

## Current limitations

V1 simulates external integrations and internal adjustment proposals. It is not a production payment system or tax-compliance engine. Authentication is a demo boundary; approval workflow is deliberately simple.

See [status](docs/STATUS.md), [architecture decisions](docs/DECISIONS.md), [roadmap](docs/ROADMAP.md), and [brand guide](docs/BRANDING.md).
