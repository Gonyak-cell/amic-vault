# Enterprise DMS PR-F Readiness Evidence

Date: 2026-06-20

Related TUW: DMS-UX-801 to DMS-UX-807

Status: PR-F readiness split. This file records which release-hardening checks
are machine-guarded now and which checks require approved staging/production
credentials and reference-only receipts before production signoff.

Do not commit production URLs, passwords, cookies, tokens, screenshots with
customer matter data, document contents, raw prompts, raw source/source text,
model responses, local storage dumps, or provider-console metadata.

## Readiness Decision

PR-F is not complete until authenticated DMS main-loop and negative-auth
receipts are attached in an external evidence workspace. The repository can and
does enforce the automated readiness layer:

- DMS-UX-803 No Fake Data Sweep is enforced by
  `pnpm check:production-ui-literals` and `pnpm ui:production-smoke`.
- DMS-UX-804 Internal Ref Sweep is enforced by production UI literal and smoke
  guards for workspace ID, tenant ID, raw UUID slices, short hashes, unsafe ID
  fallback labels, and internal refs in normal user-facing UI.
- DMS-UX-805 AI Scope Sweep is enforced by production UI guards that reject
  legal analysis, document summary, external model route, raw prompt/source,
  source text, and model-response copy.
- DMS-UX-806 Responsive QA is partially machine-guarded by AppShell, layout
  primitive, table overflow, and mobile navigation smoke patterns; final visual
  receipt at 1440px, 768px, and 375px remains manual.
- DMS-UX-807 Accessibility QA is partially machine-guarded by `aria-current`,
  mobile dialog controls, icon/empty-state accessibility tests, and focusable
  navigation patterns; final keyboard receipt remains manual.

## Manual Receipt Requirements

The following release receipts require approved staging or production
credentials and must stay outside the repository when they contain private
endpoints, screenshots, customer data, cookies, tokens, or provider metadata.

| TUW | Required receipt | Evidence location |
| --- | --- | --- |
| DMS-UX-801 | Authenticated main loop: login -> Matter Code -> upload -> processing -> matter-scoped file list -> document detail -> search -> preview/version -> records/audit links | External evidence workspace using refs only |
| DMS-UX-802 | Negative auth: non-member, wall-blocked, non-admin, denied upload/download/preview/search, stale-content clearing | External evidence workspace using refs only |
| DMS-UX-806 | Responsive visual QA at 1440px, 768px, and 375px for upload, files, matter, document, search, admin, records, and task inbox | External evidence workspace using refs only |
| DMS-UX-807 | Keyboard and screen-reader basics for navigation, search, filters, upload, document actions, language selector, logout, and error states | External evidence workspace using refs only |

The existing `pnpm release:smoke` / `tools/release/staging-smoke.mjs` credential
gate covers approved synthetic login, dashboard, search, tenant API, and
negative role denial. It does not replace the DMS-UX-801 file upload main-loop
receipt because upload requires a permitted Matter source, a file fixture, and
post-upload document/search/detail evidence.

## Automated Evidence Matrix

| Check | Current repo evidence | TUW |
| --- | --- | --- |
| Release hardening baseline | `docs/ui/enterprise-dms-release-hardening.md` | DMS-UX-801 to 807 |
| Rollout checklist | `docs/release/production-ui-rollout-checklist.md` | DMS-UX-801 to 807 |
| Evidence package template | `docs/release/enterprise-dms-ui-release-evidence.md` | DMS-UX-801 to 807 |
| Production UI literal guard | `tools/quality/check-production-ui-literals.mjs` | DMS-UX-803 to 805 |
| Production UI smoke guard | `tools/release/check-production-ui-smoke.mjs` | DMS-UX-803 to 807 |
| Staging smoke credential gate | `tools/release/staging-smoke.mjs` and `docs/release/env.staging-smoke.example` | DMS-UX-801, 802 |
| Responsive/accessibility component guards | `apps/web/src/app/(app)/app-shell.test.tsx`, `apps/web/src/components/ui/layout-primitives.test.tsx`, `apps/web/src/components/ui/empty-state.test.tsx`, and `apps/web/src/components/ui/data-table.test.tsx` | DMS-UX-806, 807 |

## Required Commands

Before this PR-F readiness layer can be accepted, run:

- `pnpm check:production-ui-literals`
- `pnpm ui:production-smoke`
- `pnpm check:ui-pr-checklist`
- `pnpm docs:frozen`
- focused responsive/accessibility tests:
  `pnpm --filter @amic-vault/web test -- src/app/(app)/app-shell.test.tsx src/components/ui/layout-primitives.test.tsx src/components/ui/empty-state.test.tsx src/components/ui/data-table.test.tsx`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

## Hold Criteria

Production release must remain `HOLD` when any of the following is true:

- approved staging/production credentials are missing for authenticated DMS
  main-loop smoke;
- approved negative-role credentials are missing for negative-auth smoke;
- Matter Code source is not configured or upload falls back to a free-floating
  document path;
- a smoke receipt includes customer file contents, private URLs, cookies,
  tokens, raw AI data, or provider metadata;
- UI copy implies legal analysis, document summary, external model routing, raw
  prompt/source storage, source text display, or model-response display;
- responsive or keyboard QA is missing for the visible routes touched by the
  release.

## Closeout Boundary

This readiness layer makes PR-F harder to overclaim. It does not by itself
approve production release. DMS-UX-801, DMS-UX-802, final DMS-UX-806, and final
DMS-UX-807 require external reference-only receipts before DMS-UX-812 release
signoff can be valid.
