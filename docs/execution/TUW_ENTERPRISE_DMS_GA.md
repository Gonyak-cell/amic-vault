# Enterprise DMS GA Execution Ledger

Date: 2026-06-20

Source package: `/Users/jws/Documents/Codex/dms-enterprise/AMIC_Vault_DMS_Roadmap_Package/`

Target base: `7c8bd74806e63d818c671f4b8a3a32a14ccee33f`

## Scope Boundary

This document tracks repo-side implementation for DMS-GA-001 through DMS-GA-705. It does not grant production release signoff. Production or customer-scope release remains HOLD until staging/canary receipts and owner signoff rows are complete.

Excluded from this GA execution lane:

- external AI or legal-analysis features
- raw prompt, raw source, or model-response storage/display
- customer document content in committed evidence
- secret, private endpoint, token, cookie, or credential material
- production release approval without owner evidence refs

## Current Reclassification

| PR lane                                       | DMS-GA IDs                                                             | Current repo status                                                                                      | Completion boundary                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| PR-0A Release reconciliation                  | DMS-GA-001, DMS-GA-002                                                 | Reconciled in `codex/dms-ga0-reconcile` at target head `7c8bd748`; guards/docs/routes validated locally. | Repo-side done for GA0; external launch signoff remains separate.                                                           |
| PR-0B Release receipts                        | DMS-GA-003, DMS-GA-004                                                 | Not repo-implementable alone.                                                                            | Requires approved staging/canary `release:dms-smoke -- --json` receipt and negative-auth evidence refs.                     |
| PR-1A Matter runtime                          | DMS-GA-101, DMS-GA-102, DMS-GA-105, DMS-GA-404                         | Implemented on `codex/dms-ga1-matter-runtime`; pending review/merge.                                     | API status/lookup, permission-scoped Matter Code picker, source freshness, upload eligibility flags, contract/runbook docs. |
| PR-1B Upload preflight                        | DMS-GA-103, DMS-GA-104                                                 | Implemented on `codex/dms-ga1-upload-preflight`; pending review/merge.                                   | Server-side Matter app resolution, lifecycle/staleness gate, permission/wall mutation gate, short-lived preflight ref.      |
| PR-1C Upload metadata UX                      | DMS-GA-106                                                             | Implemented on `codex/dms-ga1-upload-metadata-ux`; pending review/merge.                                 | Upload metadata/security profile exposes approved shared values now; tenant-admin taxonomy management remains PR-6A.        |
| PR-1D Duplicate decision                      | DMS-GA-107                                                             | Implemented on `codex/dms-ga1-duplicate-decision`; pending review/merge.                                 | Persisted staged duplicate/version/cancel decision before final upload action.                                              |
| PR-2A to PR-2C Document cabinet/detail        | DMS-GA-201, DMS-GA-202, DMS-GA-204, DMS-GA-205                         | PR-2A implemented on `codex/dms-ga2-cabinet-parity`; PR-2B implemented on `codex/dms-ga2-action-center`; PR-2C implemented on `codex/dms-ga2-activity-timeline`. | Matter cabinet parity, document action center, audit/activity timeline.                                                     |
| PR-3A to PR-3E Search hardening               | DMS-GA-301, DMS-GA-203, DMS-GA-302, DMS-GA-303, DMS-GA-304, DMS-GA-305 | PR-3A implemented on `codex/dms-ga3-search-privacy`; PR-3B implemented on `codex/dms-ga3-search-preview`; PR-3C to PR-3E pending. | Query privacy, preview anchors, refiners, negative leakage proof, governed search folders, reindex evidence.                 |
| PR-4A to PR-4D Access/team/walls              | DMS-GA-401, DMS-GA-402, DMS-GA-403, DMS-GA-405                         | Pending.                                                                                                 | Permission-scoped org picker, team/wall picker UX, explicit access workflow boundary.                                       |
| PR-5A to PR-5E Records/workflow/notifications | DMS-GA-501, DMS-GA-502, DMS-GA-503, DMS-GA-504, DMS-GA-505, DMS-GA-506 | Pending.                                                                                                 | Records context pickers, lifecycle/workflow/certificates, real task inbox, real notifications.                              |
| PR-6A to PR-6E Admin/integrations             | DMS-GA-601, DMS-GA-602, DMS-GA-603, DMS-GA-604, DMS-GA-605             | DMS-GA-601 implemented on `codex/dms-ga6-admin-taxonomy`; DMS-GA-602~605 pending.                        | Tenant-governed taxonomy/refiners/templates, Outlook evidence, Office/OneDrive ADR gate only.                               |
| PR-7A to PR-7E Production evidence            | DMS-GA-701, DMS-GA-702, DMS-GA-703, DMS-GA-704, DMS-GA-705             | Pending, except GA0 guard baseline exists.                                                               | Monitor map, rollback controls, responsive/a11y receipts, expanded guards, owner signoff package.                           |

## Verification Contract

Each repo-side PR must run the relevant focused tests plus:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm lint
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm typecheck
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm test
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm build
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm docs:frozen
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm check:production-ui-literals
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm ui:production-smoke
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm check:ui-pr-checklist
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm release:dms-smoke -- --check-env --json
```

`pnpm release:dms-smoke -- --json` without `--check-env` is a release receipt, not a local code gate. It must reference an approved staging/canary environment and remain reference-only.

## Current PR-1A Acceptance

- `/v1/integrations/matter-app/status` reports source mode, configured/runtime-ready state, production projection block, freshness, and upload-authoritative state without secrets.
- `/v1/integrations/matter-app/matter-lookup` returns safe empty results when source is unavailable or UUID-shaped input is supplied.
- Matter lookup uses SQL-stage `matter_members` and ethical-wall filters before labels/counts are returned.
- `MatterCodePicker` uses the Matter app lookup endpoint instead of the generic `/matters` list.
- `/integrations/matter-app` prefers backend runtime status and falls back to local public flags only as a conservative display state.
- Upload preflight and mutation gate are implemented in PR-1B.

## Current PR-1B Acceptance

- `POST /v1/matters/:matterId/documents/upload-preflight` issues a short-lived reference-only preflight ref after Matter source, lifecycle, permission, and ethical-wall checks.
- Upload and add-version paths re-evaluate Matter source readiness, lifecycle/staleness, upload permission, and ethical-wall state before storage writes.
- Supplied upload preflight refs must be server-issued, unexpired, and bound to the same tenant, actor, matter, Matter source decision, and permission decision.
- Metadata mutation shares the Matter source lifecycle/staleness gate and keeps the existing document permission/edit checks.
- Document upload/version/metadata audit metadata remains reference-only: decision refs, source mode, and bounded request refs only.

## Current PR-1C Acceptance

- Upload form exposes document type, subtype, confidentiality level, privilege status, file organization prep eligibility, and retention/hold hint before submit.
- Metadata profile values come from the current shared approved document enums; no UI copy claims tenant-admin taxonomy management is complete before DMS-GA-601.
- Upload FormData forwards `documentType`, `subtype`, `confidentialityLevel`, `privilegeStatus`, and `aiAllowed` alongside the server-issued upload preflight ref.
- File organization copy remains limited to prep/organization. The upload form does not introduce legal analysis, summary, external AI, or raw source claims.

## Current PR-1D Acceptance

- Upload preflight accepts a bounded client-computed SHA-256 hash and returns duplicate decision state with safe candidate labels only.
- Duplicate candidates are filtered through `canReadDocument`; unreadable candidates can require a decision without exposing titles, raw UUIDs, SHA values, or document contents.
- New document upload rejects same-matter duplicate hashes before storage unless the user explicitly chooses `new_document`; `new_version` is rejected on the new-document endpoint.
- Add-version upload rejects duplicate document/version hashes before storage unless the user explicitly chooses `new_version`; `new_document` is rejected on the version endpoint.
- Duplicate decisions are persisted in audit metadata as bounded `reason_code` and `result_count` values only.
- The upload panel computes SHA-256 in the browser, opens a duplicate decision dialog, and routes `new_document`, `new_version`, and `cancel` outcomes without rendering raw document references or hashes as labels.

## Current PR-2A Acceptance

- `MatterDocumentList` now uses the same approved document filter fields as the all-documents cabinet, minus Matter Code because the route is already scoped by the selected Matter.
- Matter-scoped cabinet filters cover document title, type, status, confidentiality, privilege, file organization prep, extraction/OCR, legal hold, and allowed sort values.
- Matter-scoped cabinet rows show document type, status, confidentiality, privilege, file organization prep, extraction/OCR, legal hold, and updated timestamp with the same shared labels as the all-documents cabinet.
- The Matter cabinet keeps listing through `listMatterDocuments(selectedMatter.matterReference, matterDocumentListQueryFromFilters(filters))`; raw Matter UUIDs/refs are not rendered as user-facing labels.
- The UI does not introduce fake folder behavior; the Matter file section continues to frame filing as Matter metadata.

## Current PR-2B Acceptance

- The document detail action center has an explicit action hierarchy for review, audited download, profile metadata, versioning, and Records actions.
- The top-level download action now routes to the required download reason panel; actual download execution remains behind the reason selector.
- The read/download-only launch note separates metadata profile updates and immutable new-version uploads from unsupported direct file editing.
- Records actions expose readiness for Legal Hold, Archive, and Disposal review, with display-safe Matter Code/document title context in Records links.
- Unsupported Open in Office, check-out, and check-in controls are not rendered in the document action center.
- PR-2C consolidated activity timeline remains separate; this PR keeps the existing document audit timeline integration.

## Current PR-2C Acceptance

- The document audit endpoint keeps the existing permission check and extends its document-target action allow-list to include Records lifecycle actions: Legal Hold applied/released, archive, disposal requested, and disposal executed.
- Document detail timeline rows now show a category column for read/download, metadata, version/processing, Records, and governance activity.
- Matter detail timeline rows now show a category column for document/version, search, Records, Matter, and governance activity.
- Document and Matter timelines continue to clear stale rows before reload and after denied/error reloads.
- Timeline rendering remains reference-only: event IDs, actor IDs, matter/document UUIDs, query hashes, and Records request IDs are not rendered as labels.

## Current PR-3A Acceptance

- Search URL privacy is tenant-configured through `searchPrivacySettingsSchema` with `plaintext_url` and `private_saved_ref` modes; mixed private mode plus plaintext reusable URLs is rejected.
- In `private_saved_ref` mode, the search route ignores incoming raw `q` URL values, strips them from the browser URL, and restores saved searches only through validated `searchRef` values.
- The saved-search panel keeps plaintext reusable URLs in `plaintext_url` mode and hides `/search?q=...` plus raw `saved_search_id` markup in `private_saved_ref` mode.
- Search and saved-search audit metadata remains bounded to `query_hash`, `query_length`, `filter_refs`, counts, duration, and request refs; raw query text, snippets, document body text, prompts, and responses are not logged.
- `docs/security/search-privacy.md` and `pnpm ui:production-smoke` guard the tenant URL policy, private saved-search reference behavior, and bounded audit contract.

## Current PR-3B Acceptance

- Search highlights now carry optional `anchorId` values generated from bounded parsed highlight offsets, not raw query text, snippets, or document body text.
- Search result document links carry only hit index/count, target, and a validated `anchor` value; raw query and snippet text are not included in document-route URLs.
- Preview URLs add a `vault-preview-anchor` fragment only when the anchor matches the approved bounded format; invalid anchors degrade to the existing hit-count preview fragment.
- Document detail parses search hit context from route params only, drops invalid anchors, and does not carry the first-hit anchor into previous/next hit navigation.
- Full unauthorized preview/search non-discovery proof remains tracked under PR-3D / DMS-GA-303.
