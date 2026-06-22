# AMIC Vault Current Code State

Date: 2026-06-22
Checkout: `codex/dms-editing-lifecycle-candidate` based on `origin/main@b6d1bba`

This file is the current-state overlay for the live repository checkout. It is
not a replacement for the normative execution package under `docs/package/**`.
The package remains read-only and governs constitutional constraints, but it is
not a live inventory of implemented code after later release work.

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
- The current checkout also contains the DMS editing lifecycle candidate:
  edit sessions, internal subversions, reviewer gates, official version
  promotion, Outlook edit links, and the `/documents/[id]?edit=1` surface.
- Older production and staging documents may contain valid historical evidence
  for earlier SHAs. Treat them as evidence records unless their header says they
  are the current source for a lane.
