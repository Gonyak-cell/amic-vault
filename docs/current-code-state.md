# AMIC Vault Current Code State

Date: 2026-07-06
Checkout: `codex/release-freeze-20260705-current` at `0b39414`

This file is the current-state overlay for the live repository checkout. It is
not a replacement for the normative execution package under `docs/package/**`.
The package remains read-only and governs constitutional constraints, but it is
not a live inventory of implemented code after later release work.

Current documentation truth map:
`docs/maintenance/current-document-truth-map-2026-07-06.md`.

## Current Truth As Of 2026-07-06

- Production customer document import is PASS through final wave-225.
- Production source-of-truth cutover execute is PASS under a separate approval.
- Current post-cutover gate package:
  `docs/release/production-post-cutover-next-gates.md`.
- The following remain unclaimed: OneDrive connected-state, Office
  open/save/sync, Gemma indexing execution, and customer-wide go-live.
- DMS uplift strict-completion ledger state is 19 `COMPLETE_CANDIDATE`, 80
  `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`, and 11 `EXTERNAL_BLOCKED`.

## Implementation Surface

- The repository is an active pnpm/turborepo workspace with `apps/api`,
  `apps/web`, `apps/desktop`, `packages/*`, `workers/ingestion`, database
  migration tooling, integration suites, and release validators.
- Root scripts now include database migration/rollback/seed, integration
  testing, launch gates, production UI smoke, DMS smoke, desktop release gate,
  Outlook checks, and local-AI readiness checks.
- `docs/package/**` must stay unchanged unless a separate human-approved
  package update process explicitly allows it.

## Web And DMS UI

- `/files` is a visible production route in the web app. It includes an
  all-documents vault, Matter Code picker, single/bulk upload panel, upload
  receipts, server-backed filters/sort, and matter-scoped document lists.
- `/documents/[id]` includes the document action center for profile read/edit,
  preview, controlled download, version list/add-version, governance context,
  audit timeline, records entry points, related documents/emails, and
  file-organization prep status.
- `/search`, `/search/folders`, `/work`, and `/notifications` are implemented
  DMS operating surfaces backed by approved APIs and route policies.
- Enterprise DMS GA still requires external authenticated DMS smoke and owner
  evidence. Local/synthetic receipts do not replace external runtime evidence.

## Desktop

- `apps/desktop` exists as a Tauri v2 thin shell. It is not a local Vault
  runtime and must not own tenant data, document bytes, search indexes, AI
  context, audit authority, or records decisions.
- Desktop code includes signed-origin validation, fail-closed origin handling,
  deny-by-default capability policy, policy validation tooling, and desktop
  tests for origin, capability, auth/audit preservation, and no local storage.
- Repo-local desktop gates are present, but production desktop distribution is
  not authorized until external artifact digest/signature/notarization, update
  origin, customer IT acceptance, rollback, and release approval refs exist.

## Release Boundary

- The latest repo-local launch closeout for `origin/main@a2d3bb9` is
  `docs/release/launch-closeout-execution-a2d3bb9.md`.
- That closeout is `TECHNICAL-READY / EXTERNAL-EVIDENCE-REQUIRED-BEFORE-PROMOTION`.
  It is not a live production approval for latest main.
- The current checkout contains the DMS editing lifecycle implementation and
  a DMS smoke edit-loop gate covering checkout, edit package, subversion save,
  reviewer approval, check-in, promotion, `promoted_from_subversion_id`, and
  audit-chain evidence. External staging PASS receipts are still required
  before production promotion.
- Older production and staging documents may contain valid historical evidence
  for earlier SHAs. Treat them as evidence records unless their header says they
  are the current source for a lane.
