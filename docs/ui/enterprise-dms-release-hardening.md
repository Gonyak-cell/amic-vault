# Enterprise DMS Release Hardening

Status: PR-F release hardening baseline
Date: 2026-06-18
Related TUW: DMS-UX-801 to DMS-UX-812

This document is the production release checklist for the AMIC Vault enterprise
DMS UI batch. It is intentionally reference-only: evidence must cite command
receipts, PRs, audit refs, route refs, or approved screenshots. Do not paste
secrets, customer file contents, raw prompts, raw source/source text, model
responses, cookies, tokens, or confidential screenshots into release evidence.

## Automated Gates

Before release signoff, the following local/CI gates must pass on the release
candidate branch:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm check:production-ui-literals`
- `pnpm ui:production-smoke`
- `pnpm check:ui-pr-checklist`
- `git diff --check`

The production UI smoke gate must cover route visibility, hidden route blocking,
fake/mock/sample/demo data exclusion, workspace/tenant/internal ref exclusion,
AI Prep scope exclusion, Matter-scoped upload/browse foundations, document
detail actions, enterprise search controls, governance/workflow/ops context, and
admin/integration safety.

## DMS-UX-801 Authenticated Main Loop Smoke

Manual receipt required with an approved tenant and user:

1. Login with email and password only.
2. Select a canonical Matter app Matter Code or approved Matter projection.
3. Upload a file only after Matter selection.
4. Confirm upload completion or a safe pending/unavailable state.
5. Confirm the file appears in the matter-scoped file list.
6. Open document detail and verify profile, preview, controlled download reason,
   version history, governance context, and records/audit links.
7. Search by title/body/metadata where test content is approved.
8. Confirm result labels use display names, not raw matter/document/version refs.
9. Verify file organization prep status only; no legal analysis, document
   summary, external model route, raw prompt/source/model-response storage or
   display.
10. Record evidence refs only.

## DMS-UX-802 Negative Auth Smoke

Manual or automated receipt required:

- Non-member cannot see matter files, document detail, search snippets, facets,
  or counts for unauthorized matters.
- Wall-blocked user sees a safe denied/policy-blocked state with no stale
  previous result content.
- Non-admin cannot see admin, audit, records, walls, integrations, or hidden
  production routes unless role policy allows it.
- Denied upload, download, preview, search, records, and wall operations fail
  closed.
- Errors must not reveal existence, internal refs, document body, source text,
  raw prompts, model responses, cookies, tokens, or secret values.

## DMS-UX-803 No Fake Data Sweep

Release reviewer must confirm:

- No fake/mock/sample/demo operating data appears in production UI.
- No default people, teams, documents, matters, files, dates, approval counts,
  readiness counts, connected states, or completed states render before real API
  success.
- Null/error/unavailable states are not coerced to zero, success, approved,
  connected, or completed.

## DMS-UX-804 Internal Ref Sweep

Default user-facing UI must not display:

- workspace ID, tenant ID, user ID
- matter ID, document ID, version ID, file object ID
- audit event ID, policy ID, queue job ID
- raw UUID slices, short hashes, or ID-derived labels

Advanced/security/admin areas may keep bounded references only when the workflow
requires them and the route role policy allows that user.

## DMS-UX-805 AI Scope Sweep

AI Prep production UI is limited to file organization prep/readiness. Release is
blocked if UI copy, logs, PR evidence, or release evidence imply legal analysis,
document summary, external model routing, raw prompt storage/display, raw
source/source text storage/display, or model response storage/display.

## DMS-UX-806 Responsive QA

Reviewer must check affected DMS routes at:

- 1440px desktop: app shell, search, matter, files, document detail, dashboard,
  governance, admin, integrations.
- 768px tablet: navigation, tables, filters, upload, document detail, records,
  wall/admin panels.
- 375px mobile: drawer/nav reachability, no horizontal page overflow, readable
  action buttons, usable forms.

## DMS-UX-807 Accessibility QA

Reviewer must check:

- Keyboard access for navigation, search, filters, upload, document actions,
  download reason selector, records/audit links, admin refresh, integration
  links, and logout.
- Visible focus states.
- `aria-current` for active navigation.
- Accessible names for icon buttons.
- Empty/error/denied states readable without color alone.

## DMS-UX-808 Evidence Package

Canonical template: `docs/release/enterprise-dms-ui-release-evidence.md`.

Evidence package must include refs only:

- PR stack and commit SHAs.
- Command receipt refs for automated gates.
- Route inventory refs.
- Authenticated smoke receipt ref.
- Negative auth smoke receipt ref.
- Responsive/accessibility QA receipt ref.
- Audit refs for upload/download/search/records/AI prep where available.
- Explicit list of deferred items with owner and follow-up TUW.

## DMS-UX-809 Rollout Checklist

Canonical operator checklist: `docs/release/production-ui-rollout-checklist.md`.

Release cannot pass unless the checklist covers:

- Matter Code selection before upload.
- Upload and post-upload processing state.
- Matter-scoped file list.
- Document detail profile/preview/download/version/governance state.
- Title/body/metadata search and safe no-results state.
- Records/audit links and admin-only governance routes.
- Workflow/action queue state based on real data only.
- Admin settings and integration gates.
- Negative auth and wall-blocked cases.
- AI Prep file organization scope.

## DMS-UX-810 Rollback Plan

Canonical rollback controls:
`docs/release/enterprise-dms-ui-release-evidence.md` and
`docs/release/rollback-runbook.md`.

Rollback owner must be named before release. Rollback controls:

- Route visibility policy: hide `/files`, `/documents/[id]`, `/integrations`,
  `/integrations/outlook`, `/records`, `/audit`, `/walls`, or admin routes by
  role/feature policy if a surface is unsafe.
- Matter app source flags: disable production upload/browse if canonical Matter
  source is unavailable.
- Worker flags: disable upload-prep enqueue/worker and AI prep worker if file
  organization prep health fails.
- Database migrations: use reviewed rollback path only; no hard delete.
- Storage: preserve immutable originals and versions.
- Monitoring: keep audit events and error receipts for rollback decision.

## DMS-UX-811 Production Monitor

Canonical monitor matrix: `docs/release/enterprise-dms-ui-release-evidence.md`.

Monitor after release:

- Upload failure rate and unsupported file type rate.
- Extraction/OCR pending and failure rate.
- Search latency, no-result rate, and denied-search spikes.
- Permission denied, ethical wall blocked, and tenant isolation errors.
- AI prep queue pending/failed/rejected/stale counts, limited to file
  organization prep.
- Audit write failures.
- Storage write/read failures and duplicate/integrity failures.
- Integration status gate failures for Outlook and future Office/OneDrive lanes.

## DMS-UX-812 Release Signoff

Canonical signoff matrix: `docs/release/enterprise-dms-ui-release-evidence.md`.

Required owner signoff before production release:

- Operator owner.
- Security owner.
- Legal-data owner.
- Customer-scope owner.
- Rollback owner.

Signoff must state the exact production scope, excluded scopes, approved tenant
or tenant class, rollback owner, release timestamp, and evidence package ref.
