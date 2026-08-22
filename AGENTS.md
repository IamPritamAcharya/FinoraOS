# FinoraOS engineering guide

Before substantial work, read this file and `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, and for UI work `docs/BRANDING.md`.

FinoraOS is an AI-native financial-operations platform. The flagship loop is deterministic reconciliation → exceptions → controlled AI investigation → typed proposal → validation/approval → audit → rerun/close.

## Architecture rules

- `packages/platform` owns cross-app enums, schemas and safe money helpers. Never import Prisma enums into web or agents. Run `pnpm check:enums` when persistence enums change.
- Business modules live in `apps/api/src/modules`; external systems are only in `apps/api/src/gateways`. No business service imports a vendor SDK directly.
- Agents never import Prisma. Supply organization-scoped, structured tools from the API. No arbitrary SQL, no direct LLM writes, no invented amounts.
- Use Decimal in storage/arithmetic and strings at boundaries. Every monetary value has a currency.
- Raw imports are traceable; mutations need an audit record; sensitive proposed actions require approval.

## UI and brand rules

- Reuse Finora tokens/primitives in `packages/ui`; do not scatter literals or add random gradients. Preserve the FinoraOS mark and number formatting.
- Financial status must use semantic tokens plus text, never colour alone. Prefer dense readable tables, subtle borders, and functional empty/error/loading states.

## Workflow

- Use pnpm, keep Turbo/test concurrency at 2, and never make Ollama a hook or CI dependency.
- Tests use Mock AI. Review diffs and secrets before coherent Conventional Commit milestones; do not push without explicit instruction.
- Update `docs/STATUS.md` after significant milestones. Keep future work in ROADMAP, not this guide.
