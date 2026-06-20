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
receipts are attached in an external evidence workspace. The repository now
ships a command harness for those receipts, while final responsive and
accessibility receipts still require approved visual/keyboard review:

- DMS-UX-801 Authenticated Main Loop is exercised by
  `pnpm release:dms-smoke -- --json`, which requires approved synthetic or
  canary DMS credentials and a Matter Code source before upload.
- DMS-UX-802 Negative Auth is exercised by the same DMS smoke command through a
  negative identity that must not read or discover the uploaded document.

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
| DMS-UX-801 | Authenticated main loop: login -> Matter Code -> upload -> processing -> matter-scoped file list -> document detail -> search -> preview/version -> records/audit links | `pnpm release:dms-smoke -- --json` receipt copied to external evidence workspace using refs only |
| DMS-UX-802 | Negative auth: non-member, wall-blocked, non-admin, denied upload/download/preview/search, stale-content clearing | `pnpm release:dms-smoke -- --json` negative-auth checks copied to external evidence workspace using refs only |
| DMS-UX-806 | Responsive visual QA at 1440px, 768px, and 375px for upload, files, matter, document, search, admin, records, and task inbox | External evidence workspace using refs only |
| DMS-UX-807 | Keyboard and screen-reader basics for navigation, search, filters, upload, document actions, language selector, logout, and error states | External evidence workspace using refs only |

The existing `pnpm release:smoke` / `tools/release/staging-smoke.mjs` credential
gate covers approved synthetic login, dashboard, search, tenant API, and
negative role denial. `pnpm release:dms-smoke` /
`tools/release/dms-main-loop-smoke.mjs` is the DMS-specific gate for Matter Code
source resolution, matter-scoped upload, document/search/detail evidence, and
negative non-discovery. Release signoff requires both receipts when the target
environment supports the DMS upload flow.

## Automated Evidence Matrix

| Check | Current repo evidence | TUW |
| --- | --- | --- |
| Release hardening baseline | `docs/ui/enterprise-dms-release-hardening.md` | DMS-UX-801 to 807 |
| Rollout checklist | `docs/release/production-ui-rollout-checklist.md` | DMS-UX-801 to 807 |
| Evidence package template | `docs/release/enterprise-dms-ui-release-evidence.md` | DMS-UX-801 to 807 |
| Production UI literal guard | `tools/quality/check-production-ui-literals.mjs` | DMS-UX-803 to 805 |
| Production UI smoke guard | `tools/release/check-production-ui-smoke.mjs` | DMS-UX-803 to 807 |
| Staging smoke credential gate | `tools/release/staging-smoke.mjs` and `docs/release/env.staging-smoke.example` | DMS-UX-801, 802 |
| DMS main-loop smoke gate | `tools/release/dms-main-loop-smoke.mjs`, `pnpm release:dms-smoke`, and `docs/release/env.staging-smoke.example` | DMS-UX-801, 802 |
| DMS Matter app source contract guard | `apps/web/src/lib/matter-app.spec.ts`, `apps/web/src/app/(app)/integrations/matter-app/page.tsx`, `.env.example`, and `docs/integrations/matter-app-vault-contract.md` for configured-plus-runtime-ready source gating, descriptor-only Matter package exclusion, projection fallback blocking in production, and upload-authoritative mode only after lookup/sync readiness | DMS-UX-003 |
| DMS upload receipt guard | `apps/web/src/components/document/document-upload-panel.test.tsx`, `apps/web/src/app/(app)/files/page.tsx`, `apps/web/src/components/document/document-vault-list.test.tsx`, and `apps/web/src/components/document/matter-file-section.tsx` for `UploadQueueReceipt`, document-detail action, all-documents vault action, Matter file-cabinet action, file-organization prep text, duplicate-candidate count, upload-triggered all-documents vault plus Matter file-list refresh, and no visible raw Matter reference | DMS-UX-101, 102, 104, 107 |
| DMS Matter Code picker contract guard | `apps/web/src/lib/matter-app.spec.ts` and `apps/web/src/components/matter/matter-code-picker.test.tsx` for Matter Code/name/client safe-label search, unconfigured/loading/error/empty states, URL-provided Matter Code prefill/selection, UUID-shaped Vault internal reference rejection, and no denied-label/count leakage | DMS-UX-004 |
| DMS Matter row action guard | `apps/web/src/app/(app)/matters/page.test.tsx` for Matter workspace, Matter Code filtered file cabinet, and Matter Code filtered search row actions without fake counts or raw Matter refs in action URLs | DMS-UX-105, 113, 114 |
| DMS Matter workspace action guard | `apps/web/src/components/matter/matter-workspace-actions.test.tsx` and `apps/web/src/components/matter/matter-code-picker.test.tsx` for Matter Code based workspace actions to file cabinet/search/work/records/audit and URL-provided Matter Code picker prefill/selection without fake counts or raw Matter labels | DMS-UX-113, 114, 501, 505, 507 |
| DMS access picker closeout guard | `apps/web/src/components/matter/team-member-list.test.tsx`, `apps/web/src/components/matter/add-member-dialog.tsx`, `apps/web/src/app/(app)/walls/wall-admin-client.test.tsx`, and `tools/release/check-production-ui-smoke.mjs` for display-safe team member labels, add-member raw user reference hidden by default, Matter Code based wall lookup/create, and wall membership raw refs limited to advanced security operations until approved user/group picker APIs exist | DMS-UX-401, 402 |
| DMS version receipt guard | `apps/web/src/components/document/document-action-center.test.tsx` and `apps/web/src/components/document/document-audit-timeline.test.tsx` for new-version upload receipt text, version list plus document-scoped audit timeline plus file-organization prep status refresh, duplicate-candidate count, and no visible raw document/version/file refs | DMS-UX-206, 207, 406, 509 |
| DMS related item guard | `apps/web/src/components/document/document-action-center.test.tsx` for same-Matter related documents loaded through the permission-scoped matter document list API, document-linked email filings loaded through the permission-scoped Matter email timeline API, current-document filtering, safe title/status/type/updated-time/subject/count/warning display, and no visible raw Matter/email reference | DMS-UX-211 |
| DMS body-search fixture gate | `tests/integration/search-permission/search-body-fixture.spec.ts` and `pnpm test:integration -- search-permission` | DMS-UX-312, 313 |
| Responsive/accessibility component guards | `apps/web/src/app/(app)/app-shell.test.tsx`, `apps/web/src/components/ui/layout-primitives.test.tsx`, `apps/web/src/components/ui/empty-state.test.tsx`, and `apps/web/src/components/ui/data-table.test.tsx` | DMS-UX-806, 807 |

## Required Commands

Before this PR-F readiness layer can be accepted, run:

- `pnpm check:production-ui-literals`
- `pnpm ui:production-smoke`
- `pnpm check:ui-pr-checklist`
- `pnpm release:dms-smoke -- --dry-run --json`
- `pnpm release:dms-smoke -- --json` with approved staging/canary DMS
  credentials before release signoff
- `pnpm --filter @amic-vault/web test -- src/components/document/document-upload-panel.test.tsx`
- `pnpm --filter @amic-vault/web test -- src/components/document/document-action-center.test.tsx`
- `pnpm test:integration -- search-permission`
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

- approved staging/production credentials are missing for `pnpm release:dms-smoke`
  authenticated DMS main-loop smoke;
- approved negative-role credentials are missing for `pnpm release:dms-smoke`
  negative-auth smoke;
- `pnpm release:dms-smoke` is run with `DMS_SMOKE_ALLOW_INDEX_PENDING=1` for
  release signoff;
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
