# FinoraOS engineering guide

Before substantial work, read this file and `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`; read `docs/SYSTEM_DESIGN.md` for architecture changes and `docs/BRANDING.md` for UI work.

FinoraOS is an AI-native financial-operations platform. The flagship loop is deterministic reconciliation → exceptions → controlled AI investigation → typed proposal → validation/approval → audit → rerun/close.

## Architecture rules

- `packages/platform` owns cross-app enums, schemas and safe money helpers. Never import Prisma enums into web or agents. Run `pnpm check:enums` when persistence enums change.
- Business modules live in `apps/api/src/modules`; external systems are only in `apps/api/src/gateways`. No business service imports a vendor SDK directly.
- Agents never import Prisma. Supply organization-scoped, structured tools from the API. No arbitrary SQL, no direct LLM writes, no invented amounts.
- Use Decimal in storage/arithmetic and strings at boundaries. Every monetary value has a currency.
- Raw imports are traceable; mutations need an audit record; sensitive proposed actions require approval.

## UI and brand rules

- Use the Finora design system first; reusable components belong in `packages/ui`, never as one-off route CSS/HTML.
- Use Finora tokens, shared icons, typography, and semantic finance statuses; detailed rules live in `docs/BRANDING.md` and `packages/ui/AGENTS.md`.
- Visually review major UI changes before committing; do not extend a rejected layout.

## Workflow

- Use pnpm, keep Turbo/test concurrency at 2, and never make Ollama a hook or CI dependency.
- Tests use Mock AI. Review diffs and secrets before coherent Conventional Commit milestones; do not push without explicit instruction.
- Update `docs/STATUS.md` after significant milestones. Keep future work in ROADMAP, not this guide.
