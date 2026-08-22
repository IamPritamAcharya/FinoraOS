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

- **Blade-first is mandatory.** Before creating UI, inspect the installed Blade component and icon exports. Use Blade's `Button`, `IconButton`, `Drawer`, `Card`, `SideNav`, inputs, typography, table, status, and motion primitives whenever they fit. Do not replace an available Blade component with a hand-styled HTML equivalent.
- **No one-off UI primitives in application routes.** A reusable button, icon button, card, drawer, field, message, empty state, list item, or table pattern must be a Blade component or a typed Finora wrapper in `packages/ui`. Pages compose primitives; they do not invent their own interaction styling.
- **No hand-drawn SVG icon sets.** Use Blade's exported icons. New icons must be justified in `docs/BRANDING.md` and shared from `packages/ui`.
- **Typography is not negotiable.** Use Blade-bundled Inter for product UI and tabular finance data. Do not set Arial/Helvetica/system stacks as the primary UI font. TASA Orbiter is reserved for deliberate brand/display use, not general interface copy.
- Reuse Finora tokens/primitives in `packages/ui`; do not scatter literals, override global token rules, or add random gradients. Preserve the FinoraOS mark and number formatting.
- Financial status must use semantic tokens plus text, never colour alone. Prefer dense readable tables, subtle borders, and functional empty/error/loading states.
- Major UI changes require a rendered visual review before commit. If the layout is not at the quality level of current enterprise products, stop and correct the design-system composition instead of adding more page CSS.

## Workflow

- Use pnpm, keep Turbo/test concurrency at 2, and never make Ollama a hook or CI dependency.
- Tests use Mock AI. Review diffs and secrets before coherent Conventional Commit milestones; do not push without explicit instruction.
- Update `docs/STATUS.md` after significant milestones. Keep future work in ROADMAP, not this guide.
