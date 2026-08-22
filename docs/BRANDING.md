# FinoraOS brand

**Product name:** FinoraOS. **Positioning:** AI-native financial operations. **Supporting line:** Reconcile. Investigate. Close.

## Brand idea and selected mark

Three distinct concepts were explored: (1) an interlocking reconciliation loop, (2) a verification ledger/check construction, and (3) a dual-stroke **F** that also implies a controlled closing path. We selected concept 3: the solid F represents a finance control plane; the lighter return stroke represents traceable completion rather than an AI sparkle. It remains legible at 16px and works as a restrained enterprise mark.

Assets live in `apps/web/public/brand/`. Use the teal mark on light surfaces and `logo-mark-dark.svg` on dark surfaces. Do not recolour it with arbitrary gradients, add a rupee/robot motif, or recreate it from text.

## Typography and palette

The app uses a deliberate system sans stack (Arial/Helvetica) for reliable, zero-request deployment; the wordmark is set in the same confident modern sans treatment. Core tokens are in `packages/ui/src/tokens/finora.css`: deep teal is brand/control, muted gold is a sparing accent, and neutral green-grey surfaces provide financial calm. Semantic success, warning, danger and info colours have named tokens. Future font additions must be open-source, limited to one family, and documented here.

Numbers use `font-variant-numeric: tabular-nums` and `en-IN` formatting: `₹1,24,500.00`, with compact values such as `₹18.2L` only for summary metrics.

## UI guidance

Use thin borders, 10px radii, compact spacing, structured tables, and statuses with text plus colour. Matched/resolved is green, needs review is amber, unresolved/open is red. Finora is the conversational assistant; agents remain functional capabilities, not cartoon personas.

## Light/dark

The application primary surface is light; the sidebar uses a dark teal surface and its dedicated white mark. Full dark mode is deferred, but logo variants already support it.
