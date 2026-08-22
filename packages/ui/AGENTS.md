# Finora UI package rules

Read the root `AGENTS.md` and `docs/BRANDING.md` before changing shared UI.

- This package is the only home for reusable Finora-specific visual compositions. A route may compose primitives but must not recreate a generic button, icon button, card, drawer, field, message, empty state, table, or navigation item.
- This package owns the Finora design system. Add a wrapper only when it encodes an enduring Finora product convention, not to restyle a single page.
- UI defaults use locally bundled Manrope. Preserve tabular numeric formatting for financial values.
- Keep component APIs typed, accessible, and small. Add a component test or visual review for a new shared interactive primitive.
- Do not introduce a second component library, raw inline SVG icon set, page-specific literal palettes, or arbitrary animation effects.
