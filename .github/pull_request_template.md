## Summary

- TODO

## Scope

- TUW / PACK:
- Production surface:
- Data/API state affected:

## Required Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm check:production-ui-literals`
- [ ] `pnpm check:ui-pr-checklist`
- [ ] Production UI smoke gate reviewed for this change, or marked not applicable with reason

## UI/UX Production Checklist

- [ ] No fake/mock/sample/demo business data, default people, default documents, default teams, hard-coded dates, or placeholder metrics render in production UI.
- [ ] API-unavailable, loading, empty, permission denied, policy blocked, and error states do not substitute `0`, success, completed, approved, or connected values.
- [ ] No workspace ID, tenant ID, user ID, matter ID, document ID, version ID, or sliced UUID appears in default UI labels, titles, profile cards, tables, or nav.
- [ ] Current-user profile shows only the user's display name and email address.
- [ ] Role, feature, and route visibility gates are fail-closed while auth/capabilities are loading.
- [ ] Hidden or out-of-scope routes do not appear in production navigation and direct access renders a safe blocked/empty state.
- [ ] Search and AI surfaces keep Permission-before-search and Permission-before-AI boundaries.
- [ ] AI Prep wording is limited to file organization prep/readiness; no legal analysis, summary, external model route, raw prompt, raw source, source text, or model response appears.
- [ ] Login, AppShell, Dashboard, Matters, Files, Search, Records, Audit, Walls, Admin, AI Prep, and Integrations use the shared SaaS design tokens/components without route-specific theme drift.
- [ ] `docs/ui/design-system-checklist.md` was reviewed for affected screens, including raw hex, custom shadow, custom gradient, duplicated status badge, and custom table/list drift checks.
- [ ] New UI copy is covered by ko/en i18n keys or an explicit existing-copy reuse decision.
- [ ] Mobile navigation, keyboard focus, accessible names, empty/error status text, and responsive table/inspector behavior were checked for affected screens.
- [ ] Evidence uses refs only; no secrets, customer file contents, raw prompts, source text, model responses, cookies, tokens, or confidential screenshots are pasted into the PR.

## Notes For Reviewers

- Block approval if any checked UI/UX item is unsupported by code, tests, or linked evidence.
- For UI changes, compare against `docs/ui/pr-review-checklist.md` and the production rollout checklist before approval.
