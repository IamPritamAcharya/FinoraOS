# FinoraOS brand

**Product name:** FinoraOS. **Positioning:** AI-native financial operations. **Supporting line:** Reconcile. Investigate. Close.

## Brand idea and selected mark

Three distinct concepts were explored: (1) an interlocking reconciliation loop, (2) a verification ledger/check construction, and (3) a dual-stroke **F** that also implies a controlled closing path. We selected concept 3: the solid F represents a finance control plane; the lighter return stroke represents traceable completion rather than an AI sparkle. It remains legible at 16px and works as a restrained enterprise mark.

Assets live in `apps/web/public/brand/`; the enterprise-login variant lives in `infra/keycloak/themes/finora/login/`. Use the FinoraOS blue mark on light surfaces and `logo-mark-dark.svg` on dark surfaces. Do not recolour it with arbitrary gradients, add a rupee/robot motif, or recreate it from text.

## Typography and palette

The product interface uses locally bundled **Manrope Variable** for navigation, controls, data tables, chat, and financial numbers. It is FinoraOS’s default UI typeface. Do not use raw Arial, Helvetica, browser system stacks, Razorpay Blade fonts, or remote Google-font imports as the primary interface font.

Core tokens and primitives are in `packages/ui`: a distinct finance-blue family provides action hierarchy, pale blue supports selection states, and neutral cool-grey surfaces create a compact Finora workspace. Semantic success, warning, danger and info colours have named tokens.

Numbers use `font-variant-numeric: tabular-nums` and `en-IN` formatting: `₹1,24,500.00`, with compact values such as `₹18.2L` only for summary metrics.

## UI guidance

Use Finora components, tokens, and icons from `packages/ui`. Do not create local page-level substitutes for buttons, icon buttons, drawers, cards, text fields, empty states, messages, or tables. Use thin borders, compact spacing, structured tables, and statuses with text plus colour. Matched/resolved is green, needs review is amber, unresolved/open is red. Finora is the conversational assistant; agents remain functional capabilities, not cartoon personas.

Modern product quality means one coherent hierarchy, a restrained surface system, obvious primary actions, and context only when it helps the task. It never means permanent explanatory sidebars, decorative “AI” elements, copied Dribbble visual noise, or CSS-only approximations of existing design-system components.

## Light/dark

The application primary surface is light; the sidebar uses a dark teal surface and its dedicated white mark. Full dark mode is deferred, but logo variants already support it.
