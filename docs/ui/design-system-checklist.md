# UI Design System Consistency Checklist

Use this checklist for visual consistency QA on AMIC Vault production UI changes. The goal is to preserve the existing blue enterprise SaaS theme while preventing screen-level drift, fake operating data, and one-off component styling.

## 1. Screens To Inspect

Check affected screens directly, and include unchanged adjacent screens when a shared component changes:

- Login
- AppShell and navigation
- Dashboard
- Matters
- Files
- Search
- Records
- Audit
- Information barriers
- Admin settings
- AI Prep
- Integrations

## 2. Token And Color Rules

- Use shared CSS tokens for background, foreground, card, primary, primary-strong, secondary, muted, border, input, ring, destructive, and radius.
- Do not add raw hex color literals in production TSX.
- Do not introduce route-specific blue, purple, gray, beige, brown, orange, or gradient palettes.
- AppShell header may use the approved token gradient from `--primary-strong` to `--primary`.
- Semantic warning/error tones must stay tied to shared semantic tokens or approved status badge variants.

## 3. Component Rules

- Prefer shared PageHeader, SectionCard, EmptyState, StatusBadge, Button, Input, DataTable, FilterBar, and DetailInspector patterns.
- Do not create duplicate local status badge components when StatusBadge can express the state.
- Do not create custom card/panel/header/table anatomy for one route unless the PR explains the design-system reason.
- Do not nest cards inside cards.
- Cards and controls should keep 8px radius unless the existing component already defines another tokenized value.

## 4. Shadow, Gradient, And Elevation Rules

- Do not add custom shadows or route-specific elevation.
- Do not add custom gradient treatments outside the approved token-based AppShell header.
- Allowed existing shadows are limited to intentional shell/login chrome such as login card elevation, sticky header shadow, language control shadow, and mobile drawer shadow.
- Do not add decorative gradient orbs, bokeh, glow blobs, or standalone visual decoration.
- Gradients must be token-based and functional, not a separate screen theme.

## 5. Layout And Density Rules

- Dense operational screens should favor tables, lists, rails, inspectors, and SectionCard structure over marketing-style cards.
- Keep PageHeader typography compact inside app screens.
- Tables and inspectors must support horizontal overflow or responsive stacking at narrow widths.
- Text must not overlap, clip, or overflow buttons, cards, nav rows, tables, or inspectors.

## 6. Responsive QA

Check these viewports for affected surfaces:

- 1440px desktop: sidebar, top search, content width, inspector spacing, and table density align.
- 768px tablet: navigation collapse, table overflow, filters, and inspectors remain usable.
- 375px mobile: drawer opens/closes, primary nav is reachable, no horizontal page overflow.

## 7. Accessibility QA

- Active navigation uses `aria-current`.
- Keyboard focus is visible on nav, search, filters, language selector, logout, export/action buttons, and drawer controls.
- Inputs/selects have labels or `aria-label`.
- Icon-only buttons require accessible names and must not carry primary workflow actions when visible text is expected.
- Empty/error states include text that can be read without relying only on icon or color.

## 8. Fake Data And Reference Safety

- No fake/mock/sample/demo operational data may appear in production UI.
- API-unready states must not show hard-coded counts, dates, approvals, connected states, or completed states.
- Default UI must not show workspace ID, tenant ID, user ID, matter ID, document ID, version ID, raw UUID slices, or ID-derived labels.
- Internal refs that are approved for an advanced security/admin area must use `SecureRef`; never introduce a new `slice(0, 8)` or local ref formatter.
- AI Prep remains file organization prep/readiness only, with no legal analysis, summary, external model, raw prompt, raw source, source text, or model response wording.

## 9. Evidence

For material UI changes, record evidence refs for:

- desktop screenshot or local visual inspection
- tablet/mobile screenshot or local visual inspection
- keyboard navigation smoke
- production UI literal guard
- production UI smoke guard
- PR checklist guard

Evidence must use refs only. Do not paste secrets, customer file contents, raw prompts, source text, model responses, cookies, tokens, or confidential screenshots into PRs.
