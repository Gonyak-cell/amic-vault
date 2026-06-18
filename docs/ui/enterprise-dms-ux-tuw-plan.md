# Enterprise DMS UX TUW Plan

Date: 2026-06-18

Source baseline: `docs/ui/enterprise-dms-ux-baseline-gap-audit.md`

Purpose: Convert the enterprise SaaS DMS UX gap audit into a pyramid-shaped implementation plan. This plan treats Matter app-backed Matter Code-first upload, enterprise search, file browse, document action center, records, audit, workflow, and admin operations as one coherent DMS operating loop.

Non-goals and hard limits:

- No legal analysis, document summary, external model route, raw prompt storage, raw source/source-text storage, or model-response storage.
- No free-floating document upload. Every normal upload must be scoped to a permitted Matter app matter selected by Matter Code/name.
- No fake/mock/demo production data.
- No raw UUID/internal reference as a normal-user input or primary display label.
- No independent Vault-only Matter Code namespace. Matter Code must resolve from the canonical Matter app unless a later ADR explicitly changes the source of truth.
- No external sharing/client portal expansion unless separately approved by product/security/legal-data owners.
- Permission-before-search, permission-before-AI, audit-by-default, fail-closed, immutable originals, and reference-only audit remain mandatory.

## Pyramid

### L0 Goal

AMIC Vault becomes an enterprise-grade, Matter-centric SaaS DMS where an operator can complete the full loop:

Matter app Matter Code selection -> upload/file/import -> metadata/security profile -> extraction/OCR/index/AI prep status -> browse/search/preview -> version/open/edit -> workflow/records/audit -> recents/favorites/saved search return path.

### L1 Outcomes

| Outcome | User-visible promise | Primary gap closed |
| --- | --- | --- |
| O1 Matter app-centered intake | Users always start document work from a valid Matter app Matter Code/name. | Free-floating upload, duplicate Matter Code namespaces, and UUID-driven flows. |
| O2 File browse and cabinet | Users can browse matter files without guessing search terms. | `/files` empty/hidden and no matter file cabinet. |
| O3 Document action center | Users can act on a document from one coherent detail screen. | Preview/download/version/profile/action fragmentation. |
| O4 Enterprise search | Users can search body, metadata, emails, matters, folders, and refine safely. | Basic search UI and shallow filters. |
| O5 Governance in context | Users see access, walls, labels, holds, records, and audit where they act. | Governance only in separate admin surfaces. |
| O6 Workflow and operations | Users/admins see tasks, failures, queues, extraction/OCR/indexing health. | Passive activity without action queues. |
| O7 Admin configuration | Admins configure taxonomy, templates, required metadata, and refiners. | Hard-coded or incomplete filing/search structure. |
| O8 Release-grade QA | CI/smoke fails when a core DMS flow is missing. | Current gates can pass hidden/empty `/files`. |

### L2 Implementation Bundles

Use larger bundles to reduce PR overhead, but keep TUW acceptance separate.

| Bundle | Scope | Recommended order |
| --- | --- | --- |
| PR-A Foundation, Matter app integration, upload, and browse | DMS-UX-001 to 118, plus smoke guard start | 1 |
| PR-B Document operations | DMS-UX-201 to 212 | 2 |
| PR-C Enterprise search | DMS-UX-301 to 314 | 3 |
| PR-D Governance, workflow, and ops | DMS-UX-401 to 527 | 4 |
| PR-E Admin configuration and integrations | DMS-UX-601 to 714 | 5 |
| PR-F Release hardening | DMS-UX-801 to 812 | 6 |

## L3 TUW Backlog

### PR-A Foundation, Matter App Intake, Upload, Browse

#### DMS-UX-001 Baseline Lock

- Objective: Keep the enterprise DMS UX baseline as the normative UI reference.
- Work:
  - Maintain `docs/ui/enterprise-dms-ux-baseline-gap-audit.md`.
  - Link it from `docs/ui/production-ui-inventory.md`.
  - Keep `docs/ui/pr-review-checklist.md` aligned.
- Acceptance:
  - UI PR checklist rejects missing core DMS flows unless explicitly deferred.
  - `docs/package/` remains untouched.
- Verification:
  - `pnpm check:ui-pr-checklist`
  - `pnpm check:production-ui-literals`

#### DMS-UX-002 Route And Capability Inventory

- Objective: Map current routes/APIs to the DMS operating loop.
- Work:
  - Add an inventory table for `/matters`, `/files`, `/documents/[id]`, `/search`, `/records`, `/audit`, `/walls`, `/admin`, `/ai-prep`, `/integrations/outlook`.
  - Mark each route as complete, partial, hidden, gated, or future.
  - Record missing API contracts for Matter app lookup/sync, list, folder, saved search, task, notification, and taxonomy flows.
- Acceptance:
  - Every DMS core flow has a named route/API owner or an explicit gap.
  - Matter app is named as the owner/source for Matter Code unless a later ADR changes it.
  - Hidden/empty routes cannot be mistaken for production-complete flows.

#### DMS-UX-003 Matter App Source-Of-Truth Contract

- Objective: Define how Vault resolves Matter Code/name from the currently developed Matter app.
- Work:
  - Identify the Matter app owner/API boundary and whether Vault uses direct API lookup, event sync, database mirror, or a bounded cache.
  - Define canonical fields: Matter Code, matter display name, client, status, practice group, responsible lawyer, open/closed state, legal hold if owned there, and external/internal identifiers.
  - Define stale-data behavior, sync timestamps, conflict handling, and fail-closed behavior when Matter app is unavailable.
  - Define whether Vault may create matters or must deep-link users to Matter app creation.
  - Preserve tenant/customer-scope isolation and permission-before-list.
- Acceptance:
  - Matter Code has one source of truth: the Matter app.
  - Vault upload can only resolve to a permitted canonical Matter app matter.
  - If Matter app lookup/sync fails, upload is blocked with a safe setup/unavailable state.
  - No normal-user flow asks for a Vault-internal matter UUID.

#### DMS-UX-004 Matter Code Picker Contract

- Objective: Make Matter app Matter Code/name the normal entry point for matter-scoped document work.
- Work:
  - Define shared Matter picker behavior: search by Matter app code/name/client, display safe labels, no UUID-first UI.
  - Reuse existing matter suggestion/search foundations only after they are aligned with the Matter app source-of-truth contract.
  - Add empty, denied, loading, and error states.
- Acceptance:
  - Normal users can select a permitted Matter app matter without seeing or typing a UUID.
  - Denied or inaccessible matters do not leak labels or counts.

#### DMS-UX-005 FormData Upload Client

- Objective: Enable browser upload without forcing JSON `apiFetch`.
- Work:
  - Add a FormData-safe API helper for authenticated multipart requests.
  - Preserve standard API error handling and auth failure behavior.
  - Do not log file content, filenames in sensitive logs, or raw body.
- Acceptance:
  - Helper can call `POST /matters/:matterId/documents`.
  - Denied/error states map to safe UI messages.

#### DMS-UX-101 Single-File Upload Flow

- Objective: Implement Matter app Matter Code-first upload in `/files` and matter context.
- Work:
  - User selects a permitted Matter app Matter Code/name first.
  - Upload remains disabled until matter is selected and file is valid.
  - Add fields: title, document type, subtype when available, confidentiality, privilege/status where supported.
  - Show upload progress, validation errors, permission denied, duplicate/version prompt where API supports it.
  - Link success to document detail and/or matter file list.
- Acceptance:
  - Allowed user can upload to an allowed matter.
  - The selected matter resolves through the Matter app source-of-truth contract before upload.
  - Non-member/denied user fails closed.
  - No free-floating upload path exists.
  - No fake documents or counts appear.

#### DMS-UX-102 Upload Post-Processing Status

- Objective: Show what happens after upload.
- Work:
  - Display extraction/OCR/indexing state when available.
  - Display Gemma file-organization prep status only within approved scope.
  - Provide retry/refresh links only where API exists.
- Acceptance:
  - Upload success does not imply search-ready or AI-prep-complete until those states are real.
  - Gemma wording remains file organization only.

#### DMS-UX-103 File List API Contract

- Objective: Establish or confirm a permission-scoped file listing contract.
- Work:
  - Confirm existing backend support or define `GET /matters/:matterId/documents` and/or `GET /documents`.
  - Required fields: safe title, canonical Matter app matter code/name, client, type/subtype, version, updated/uploaded time, owner/uploader, confidentiality, privilege/status, extraction/index status.
  - Ensure permission-before-list and no post-filter leakage.
- Acceptance:
  - Listing endpoint returns only permitted documents.
  - Empty state and unavailable state are distinguishable.

#### DMS-UX-104 `/files` Browse Surface

- Objective: Replace hidden/empty `/files` with a real browse experience when API-ready.
- Work:
  - Add table/list with filters, sorting, pagination, and action affordances.
  - Include upload entry point.
  - Hide raw refs and use safe labels.
- Acceptance:
  - Empty tenant shows polished empty state.
  - Seeded tenant shows real documents only.
  - Route visibility is updated only when UX/API are both ready.

#### DMS-UX-105 Matter File Cabinet Entry

- Objective: Let users start from a matter and see its documents.
- Work:
  - Add matter detail file tab/section.
  - Show file list, upload action, post-processing status, and document links.
  - If folders are not implemented, show metadata-driven filing clearly and record folder deferral.
- Acceptance:
  - User can navigate Matter -> Files -> Document detail without search.

#### DMS-UX-106 Folder/Document Set Decision

- Objective: Decide whether immediate DMS filing uses folders, document sets, or metadata-only filing.
- Work:
  - Draft ADR or product decision.
  - If implementing minimal folder model, define migration/API/UI/test scope.
  - If deferring, mark UI copy and route behavior clearly.
- Acceptance:
  - No ambiguous pseudo-folder UI exists without backend semantics.

#### DMS-UX-107 Bulk Upload UX

- Objective: Make server-side bulk upload usable by operators when production-ready.
- Work:
  - Add batch file picker, canonical Matter app Matter Code mapping, per-file metadata defaults, review step, progress, failures, retry.
  - Keep upload permission per file/matter.
- Acceptance:
  - Partial failures are visible and retryable.
  - Failed files do not create silent incomplete documents.

#### DMS-UX-108 Upload And Browse Smoke Gate

- Objective: CI must catch missing upload/browse once APIs are production-ready.
- Work:
  - Update production smoke to fail if `/files` remains hidden/empty after upload/list readiness is declared.
  - Add allowed upload, denied upload, post-upload visible row, no fake data checks.
- Acceptance:
  - A production-ready upload API without UI no longer passes unnoticed.

#### DMS-UX-109 Design System Pass For Intake

- Objective: Keep new upload/browse UI aligned with existing SaaS theme.
- Work:
  - Use existing PageHeader, SectionCard, EmptyState, Button, Input, DataTable/FilterBar patterns.
  - Check desktop/tablet/mobile and keyboard states.
- Acceptance:
  - No custom route-specific blue/theme/card style.

#### DMS-UX-110 Audit And Error Safety For Intake

- Objective: Ensure upload/list UI does not leak sensitive data.
- Work:
  - Verify upload/list errors use safe messages.
  - Confirm audit metadata remains reference-only.
  - Add UI tests for stale content clearing on denied/error.
- Acceptance:
  - Denied upload/list does not leave previous matter/file data visible.

#### DMS-UX-111 Navigation Activation

- Objective: Activate `/files` only when API and UX are ready.
- Work:
  - Update `apps/web/src/lib/features.ts`, navigation, inventory, tests.
  - Keep hidden if list/upload remains incomplete.
- Acceptance:
  - Navigation state reflects actual production readiness.

#### DMS-UX-112 Upload Fixtures

- Objective: Provide safe test fixtures for upload/browse.
- Work:
  - Use synthetic/deidentified files only.
  - Include allowed matter, denied matter, deleted document, superseded version, OCR pending/failed examples where supported.
- Acceptance:
  - Tests prove behavior without customer data.

#### DMS-UX-113 Matter Workspace Summary

- Objective: Make matter home show the core operational context.
- Work:
  - Add sections for profile, members, file count/list status, recent activity, tasks placeholder if not ready, records/hold summary.
  - No fake counts.
- Acceptance:
  - Matter page explains what the user can do next using real data or safe empty states.

#### DMS-UX-114 Recents Foundation

- Objective: Create a return path to recent matters/documents.
- Work:
  - Use existing dashboard activity where available.
  - Add recent work links without fake data.
- Acceptance:
  - Users can return to recently touched matter/document from dashboard or shell.

#### DMS-UX-115 Favorite/Pinned Matter Decision

- Objective: Decide whether favorites/pins are in immediate scope.
- Work:
  - Define API/storage if implementing.
  - Otherwise mark as deferred in product docs.
- Acceptance:
  - No fake or local-only favorite state claims production persistence.

#### DMS-UX-116 File Browse Negative Tests

- Objective: Prove permission-before-list.
- Work:
  - Add tests for non-member, wall-blocked, deleted/restored, archived/held cases as applicable.
- Acceptance:
  - Unauthorized labels/counts are not visible.

#### DMS-UX-117 PR-A Closeout

- Objective: Close PR-A with evidence.
- Work:
  - Run lint/typecheck/test/build where scope requires.
  - Run UI guards and smoke.
  - Update release checklist with upload/browse evidence.
- Acceptance:
  - PR-A can be reviewed without hidden context.

### PR-B Document Operations

#### DMS-UX-201 Document Detail Information Architecture

- Objective: Turn document detail into an action center.
- Work:
  - Sections: overview/profile, preview, versions, access, activity, AI prep status, records/hold state, related files.
  - Permission-aware action bar.
- Acceptance:
  - User can understand document state and available actions from one page.

#### DMS-UX-202 Preview Integration

- Objective: Surface existing preview capability in document detail.
- Work:
  - Add preview panel with unavailable/OCR pending/error states.
  - Preserve no raw content logging.
- Acceptance:
  - Preview appears only when permitted and available.

#### DMS-UX-203 Controlled Download Flow

- Objective: Make download an explicit permission-aware action.
- Work:
  - Add download button, denied state, loading state, audit expectation.
  - Use safe filenames/display labels.
- Acceptance:
  - Denied download fails closed and clears stale states.

#### DMS-UX-204 Document Profile Read View

- Objective: Show DMS profile fields in a scannable format.
- Work:
  - Show title, type, subtype, matter, client, confidentiality, privilege, status, responsible user, uploader, dates, extraction/OCR/index status.
- Acceptance:
  - No UUID-first fields in normal view.

#### DMS-UX-205 Document Profile Edit Flow

- Objective: Enable safe profile metadata edits.
- Work:
  - Add edit form with validation and picker fields.
  - Call metadata update API.
  - Show audit-safe success/error.
- Acceptance:
  - Profile edits are permission-aware and audited.

#### DMS-UX-206 Version History UI

- Objective: Expose existing version list API.
- Work:
  - Add version table with current/superseded, created/uploaded time, uploader, size/hash ref if approved, action links.
- Acceptance:
  - User can identify current and prior versions.

#### DMS-UX-207 Add New Version Flow

- Objective: Add new version from document detail.
- Work:
  - File chooser, validation, duplicate/hash response, upload progress, success state.
  - Keep immutable original rule.
- Acceptance:
  - New version creates a new version, not overwrite.

#### DMS-UX-208 Check-Out/Lock ADR

- Objective: Decide controlled editing model before UI pretends to support editing.
- Work:
  - ADR options: explicit check-out/check-in, Office coauthoring with lock display, or deferred read/download-only launch.
  - Identify required DB/API changes if implementing.
- Acceptance:
  - No ambiguous "edit" action without controlled state.

#### DMS-UX-209 Check-Out/Check-In UX

- Objective: Implement controlled editing UI if ADR approves.
- Work:
  - Lock status, lock owner, check out, check in, cancel checkout, denied states.
- Acceptance:
  - Concurrent edit state is clear and fail-closed.

#### DMS-UX-210 Open In Office Decision

- Objective: Define Office open/save path.
- Work:
  - Decide immediate download/open only vs OneDrive/Office integration lane.
  - Gate anything requiring external integration.
- Acceptance:
  - UI copy does not imply unsupported live Office editing.

#### DMS-UX-211 Document Related Items

- Objective: Connect document to emails, attachments, versions, duplicates, related matter docs where safe.
- Work:
  - Add related items section from approved APIs.
- Acceptance:
  - Only permitted related items appear.

#### DMS-UX-212 PR-B Closeout

- Objective: Verify document action center.
- Work:
  - Tests for detail, preview, download, profile edit, versions, denied states.
  - Responsive and keyboard QA.
- Acceptance:
  - Document lifecycle can be demonstrated end to end.

### PR-C Enterprise Search

#### DMS-UX-301 Search Scope Model

- Objective: Add explicit search targets.
- Work:
  - Define scopes: title, body/full-text, metadata/profile, docs, emails/attachments, matters, clients, folders, current matter/folder, all permitted content.
- Acceptance:
  - Search request schema can represent scope without unsafe defaults.

#### DMS-UX-302 Expanded Filter Schema

- Objective: Expand search filters beyond matter/client/type/date/version.
- Work:
  - Add safe filter DTOs for matter code/name, folder/path, subtype, file type/MIME, author/uploader/filed-by, created/modified/uploaded date ranges, responsible user, confidentiality, privilege, sensitivity label, legal hold, retention, OCR/extraction, custom metadata.
- Acceptance:
  - Invalid filters fail validation.

#### DMS-UX-303 Backend Filter Builder

- Objective: Implement permission-bound SQL filters.
- Work:
  - Extend filter builder and tests.
  - Preserve permission-before-search and no post-filter-only security.
- Acceptance:
  - Unauthorized facets/counts are not leaked.

#### DMS-UX-304 Facet Refiner Expansion

- Objective: Add enterprise refiners.
- Work:
  - Add facets for new filter fields where safe.
  - Support multi-select for low-risk fields.
- Acceptance:
  - Facet labels are display-safe and counts are scoped.

#### DMS-UX-305 Advanced Search UI

- Objective: Make filters usable.
- Work:
  - Add advanced filter drawer/panel, active chips, reset, saved URL state.
- Acceptance:
  - Users can combine canonical Matter app Matter Code, body query, metadata filters, and date ranges.

#### DMS-UX-306 Query Syntax Help

- Objective: Make exact phrase/boolean/exclude behavior understandable.
- Work:
  - Add compact help, validation, and parser error states.
- Acceptance:
  - Bad query does not produce unsafe/raw errors.

#### DMS-UX-307 Sort And Group

- Objective: Add result ordering and grouping controls.
- Work:
  - Sort by relevance, modified date, created/uploaded date, title, matter, type.
  - Group by matter/client/type where safe.
- Acceptance:
  - Sort/group state persists in URL.

#### DMS-UX-308 Preview Hit Navigation

- Objective: Connect snippets to document preview hit navigation.
- Work:
  - Pass hit context to document preview.
  - Add next/previous hit controls.
- Acceptance:
  - Search result -> preview -> highlighted hit works without exposing raw text in logs.

#### DMS-UX-309 Saved Searches/Search Folders

- Objective: Let users save frequent searches.
- Work:
  - Decide persistence model and scope.
  - Add save/list/delete saved search UI.
  - Future: expose as virtual folder/search folder.
- Acceptance:
  - Saved searches are permission-safe and do not store raw prohibited data.

#### DMS-UX-310 OCR/Searchability Facets

- Objective: Make unsearchable documents visible as operational problems.
- Work:
  - Add OCR/extraction pending/failed/unsearchable filters.
  - Link to remediation queue where available.
- Acceptance:
  - Users understand why a file may not appear in body search.

#### DMS-UX-311 Search Admin Analytics

- Objective: Give admins search health without content leakage.
- Work:
  - Show stale index, extraction failures, slow queries, no-result query counts by hash/category only.
- Acceptance:
  - No raw queries with sensitive text in audit/admin displays unless approved; prefer hashed/bounded metadata.

#### DMS-UX-312 Body Search Fixtures

- Objective: Prove body search actually works.
- Work:
  - Add fixture text in synthetic documents.
  - Test title-only vs body/full-text scope.
- Acceptance:
  - Body text hit returns expected document; title-only does not when term is only in body.

#### DMS-UX-313 Search Negative Tests

- Objective: Prove search security.
- Work:
  - Non-member, wall-blocked, restricted, deleted, version filters.
- Acceptance:
  - Results, facets, snippets, and counts are permission-scoped.

#### DMS-UX-314 PR-C Closeout

- Objective: Verify enterprise search release readiness.
- Work:
  - UI, API, integration, smoke, accessibility checks.
- Acceptance:
  - Search is demonstrably body/metadata/filter capable and safe.

### PR-D Governance, Workflow, Ops

#### DMS-UX-401 Effective Access Panel

- Objective: Show who can access a matter/document and why.
- Work:
  - Add safe explanation of roles, membership, explicit allow/deny, walls, holds, labels.
  - Use pickers, not raw refs.
- Acceptance:
  - Users/admins can understand access without seeing sensitive internals.

#### DMS-UX-402 Ethical Wall UX Cleanup

- Objective: Remove normal-user dependence on raw ref forms.
- Work:
  - Replace advanced raw refs with matter/user/group pickers where APIs support.
  - Keep advanced refs only in clearly marked security/admin mode.
- Acceptance:
  - Wall admin can complete common tasks without UUIDs.

#### DMS-UX-403 Confidentiality/Privilege UX

- Objective: Surface document confidentiality and privilege consistently.
- Work:
  - Add badges/filters/actions in upload, list, detail, search.
- Acceptance:
  - Security state is visible without one-off styling.

#### DMS-UX-404 Sensitivity/DLP Labels

- Objective: Expose DLP/sensitivity status where policy allows.
- Work:
  - Add label/status read view and approved edit/apply path if available.
- Acceptance:
  - Labels do not imply unsupported encryption/DLP behavior.

#### DMS-UX-405 Records Context Panels

- Objective: Bring legal hold/retention/disposal context into matter/document pages.
- Work:
  - Show hold/retention/archive/disposal/certificate state.
  - Link to records console.
- Acceptance:
  - Records state is visible where documents are used.

#### DMS-UX-406 Matter/Document Activity Timeline

- Objective: Add contextual audit timeline.
- Work:
  - Show safe activity events on matter/document pages.
  - Link admin audit for deeper review.
- Acceptance:
  - Timeline contains no raw document body/source text.

#### DMS-UX-407 Access Request Decision

- Objective: Decide whether users can request access from denied states.
- Work:
  - If yes, define workflow/API/audit.
  - If no, make denied states clear without dead-end confusion.
- Acceptance:
  - Denied state is product-intentional and safe.

#### DMS-UX-501 Workflow Domain Contract

- Objective: Define task/action inbox model.
- Work:
  - Task types: review, approval, signature, metadata completion, OCR/indexing remediation, records action, AI-prep needs attention.
  - Decide DB/API boundaries.
- Acceptance:
  - No fake task counts before task API exists.

#### DMS-UX-502 Action Inbox UI

- Objective: Give users a work queue.
- Work:
  - Add inbox route or dashboard section.
  - Filter by assigned to me, matter, type, due/status.
- Acceptance:
  - Users can act or navigate to source document/matter.

#### DMS-UX-503 Metadata Completion Tasks

- Objective: Route incomplete profile work.
- Work:
  - Detect missing required metadata.
  - Create task and link to profile editor.
- Acceptance:
  - Incomplete metadata is actionable, not buried.

#### DMS-UX-504 OCR/Index Remediation Tasks

- Objective: Route failed extraction/searchability work.
- Work:
  - Surface OCR pending/failed/extraction failed.
  - Add retry if backend supports.
- Acceptance:
  - Operators can identify and resolve unsearchable documents.

#### DMS-UX-505 Records Action Tasks

- Objective: Link retention/hold/disposal work to inbox.
- Work:
  - Surface pending hold/disposal/certificate actions.
- Acceptance:
  - Records work is not isolated from document operations.

#### DMS-UX-506 Notification Center

- Objective: Add actionable notifications.
- Work:
  - Upload complete, upload failed, OCR failed, access request, approval, records action, expiring share if future-approved.
- Acceptance:
  - Notifications use real events and safe text.

#### DMS-UX-507 Dashboard Action Links

- Objective: Turn dashboard into a launcher for real queues.
- Work:
  - Link counts/cards to file list, tasks, records, search health, AI prep.
- Acceptance:
  - Dashboard does not show inert metrics.

#### DMS-UX-508 Ops Health Overview

- Objective: Give admins operational health.
- Work:
  - Indexing, extraction/OCR, upload queue, AI prep, storage, audit, integration status.
  - Retry controls where API-approved.
- Acceptance:
  - Admin can see what is broken without raw content.

#### DMS-UX-509 AI Prep Ops Scope Guard

- Objective: Keep AI prep inside file organization.
- Work:
  - Ensure ops/status screens do not say summary/legal analysis.
- Acceptance:
  - UI and tests reject out-of-scope AI copy.

#### DMS-UX-510 External Sharing Gate

- Objective: Keep external sharing clearly future/gated.
- Work:
  - Inventory external/client portal routes.
  - Mark current approval boundary.
- Acceptance:
  - No accidental client portal launch.

#### DMS-UX-511 Governance Negative Tests

- Objective: Prove wall/record/label/permission states.
- Work:
  - Add route/UI tests for denied/blocked/held states.
- Acceptance:
  - Governance errors fail closed and clear stale content.

#### DMS-UX-527 PR-D Closeout

- Objective: Verify governance/workflow/ops readiness.
- Work:
  - Tests, smoke, docs, screenshots or visual inspection refs.
- Acceptance:
  - User has an actionable governance/work queue, not only static admin pages.

### PR-E Admin Configuration And Integrations

#### DMS-UX-601 Taxonomy Admin Contract

- Objective: Define document type/subtype/custom metadata administration.
- Work:
  - Required fields by document type/matter template.
  - Search refiner eligibility.
- Acceptance:
  - Filing/search metadata is configurable, not hard-coded only.

#### DMS-UX-602 Taxonomy Admin UI

- Objective: Let admins manage taxonomy safely.
- Work:
  - Types, subtypes, tags/terms, custom metadata fields, required flags.
- Acceptance:
  - Changes are audited and validation-safe.

#### DMS-UX-603 Matter Template Admin

- Objective: Define reusable matter workspace templates.
- Work:
  - Matter profile defaults, folder/document-set defaults, required metadata.
- Acceptance:
  - New matters can get consistent filing structure.

#### DMS-UX-604 Folder Template Admin

- Objective: Support folder/document set templates if folder model is approved.
- Work:
  - Create/edit templates and inheritance behavior.
- Acceptance:
  - No UI folder template exists without backend semantics.

#### DMS-UX-605 Search Refiner Admin

- Objective: Let admins control custom metadata refiners.
- Work:
  - Mark fields searchable/queryable/refinable where supported.
- Acceptance:
  - Search UI reflects admin-approved refiners.

#### DMS-UX-606 Outlook Filing Unification

- Objective: Align Outlook filing with Vault document flows.
- Work:
  - Ensure filed emails/attachments appear in matter file list/search/detail with same metadata/status/audit model.
- Acceptance:
  - Email filing and upload feel like the same DMS.

#### DMS-UX-607 Office/OneDrive Integration Plan

- Objective: Define gated Office/OneDrive open-save-sync lane.
- Work:
  - Plan auth, storage, versioning, audit, coauthoring/lock, rollback.
- Acceptance:
  - No production UI claims OneDrive/Office integration before approved.

#### DMS-UX-608 Mobile/Desktop/PWA Decision

- Objective: Decide mobile/PWA/desktop expectations for DMS operations.
- Work:
  - Identify upload, preview, search, approvals, notifications, offline/sync.
- Acceptance:
  - Responsive QA scope is explicit.

#### DMS-UX-609 Admin Settings IA Cleanup

- Objective: Make admin pages enterprise SaaS consistent.
- Work:
  - Group taxonomy, security, integrations, ops health, audit/records.
- Acceptance:
  - Admin IA is coherent and not a pile of disconnected panels.

#### DMS-UX-610 Integration Status Safety

- Objective: Avoid fake connected states.
- Work:
  - For Outlook/OneDrive/Office, show connected/unavailable/setup-required only from real API.
- Acceptance:
  - No integration claims success without backend success.

#### DMS-UX-714 PR-E Closeout

- Objective: Verify admin/integration readiness.
- Work:
  - Admin tests, route gates, no fake data, responsive pass.
- Acceptance:
  - Admin can configure and inspect DMS behavior safely.

### PR-F Release Hardening

#### DMS-UX-801 End-To-End Authenticated Smoke

- Objective: Prove the main DMS loop.
- Work:
  - Login -> canonical Matter app Matter Code -> upload -> post-processing status -> file list -> document detail -> search body term -> preview -> version -> audit/records link.
- Acceptance:
  - One approved tenant/user can complete the loop.

#### DMS-UX-802 Negative Auth Smoke

- Objective: Prove denied users cannot see or infer restricted data.
- Work:
  - Non-member, wall-blocked, admin-only route, denied download/upload/search.
- Acceptance:
  - No unauthorized labels, counts, snippets, or stale content.

#### DMS-UX-803 No Fake Data Sweep

- Objective: Remove all sample people/docs/counts.
- Work:
  - Static literal guard plus manual route review.
- Acceptance:
  - Production UI uses only real API or safe empty/unavailable states.

#### DMS-UX-804 Internal Ref Sweep

- Objective: Remove normal-user UUID/ref exposure.
- Work:
  - Check matter/document/user/version/audit/policy/job IDs.
- Acceptance:
  - Advanced refs appear only in approved admin/security contexts.

#### DMS-UX-805 AI Scope Sweep

- Objective: Ensure no legal analysis/summary/external model claims.
- Work:
  - UI copy, tests, docs, audit evidence.
- Acceptance:
  - AI prep remains file organization only.

#### DMS-UX-806 Responsive QA

- Objective: Verify desktop/tablet/mobile.
- Work:
  - 1440px, 768px, 375px review for upload, files, matter, document, search, admin, records, task inbox.
- Acceptance:
  - No horizontal overflow or broken primary flows.

#### DMS-UX-807 Accessibility QA

- Objective: Ensure keyboard and screen-reader basics.
- Work:
  - Focus, labels, aria-current, icon button labels, error states.
- Acceptance:
  - Critical DMS flows are keyboard-operable.

#### DMS-UX-808 Audit Evidence Package

- Objective: Prepare release evidence without sensitive data.
- Work:
  - Collect command results, route list, smoke refs, screenshots if approved, audit refs.
- Acceptance:
  - Evidence is reference-only and shareable.

#### DMS-UX-809 Rollout Checklist Update

- Objective: Make release checklist match DMS reality.
- Work:
  - Add gates for upload, browse, document detail, search, records, workflow, admin, negative auth.
- Acceptance:
  - Release cannot pass with core DMS loops absent.

#### DMS-UX-810 Rollback Plan

- Objective: Define rollback per feature bundle.
- Work:
  - Route visibility flags, feature flags, migration rollback, worker toggles, monitoring.
- Acceptance:
  - Operator can disable unsafe surfaces without data loss.

#### DMS-UX-811 Production Monitor

- Objective: Define post-launch monitoring.
- Work:
  - Upload failures, extraction/OCR failure rate, search latency/no-result rate, permission denied spikes, AI prep queue health, audit write failures.
- Acceptance:
  - Launch has measurable health signals.

#### DMS-UX-812 Release Signoff

- Objective: Final owner signoff.
- Work:
  - Security, legal-data, operator, customer-scope owners review evidence.
- Acceptance:
  - Production launch scope is explicit and approved.

## Dependency Ladder

1. DMS-UX-001 to 003 before any Matter-scoped production UI flow.
2. DMS-UX-004 before upload, filing, search-scope shortcuts, or any normal-user matter picker.
3. DMS-UX-005 before browser upload.
4. DMS-UX-101 before DMS-UX-102/104/105.
5. DMS-UX-103 before full `/files` browse.
6. DMS-UX-106 before any folder-looking UI.
7. DMS-UX-201 before document detail action TUWs.
8. DMS-UX-208 before edit/check-out/coauthoring UI claims.
9. DMS-UX-301/302 before expanded search UI.
10. DMS-UX-401/402 before replacing raw-ref security/admin flows.
11. DMS-UX-501 before task inbox and notification claims.
12. DMS-UX-601 before required custom metadata/search refiner admin.
13. DMS-UX-801 to 812 before production release signoff.

## Verification Matrix

| Verification | Applies to |
| --- | --- |
| `pnpm lint` | All implementation PRs |
| `pnpm typecheck` | All implementation PRs |
| `pnpm test` | All implementation PRs |
| `pnpm build` | All implementation PRs |
| `pnpm check:production-ui-literals` | All UI PRs |
| `pnpm check:ui-pr-checklist` | All UI PRs |
| `pnpm ui:production-smoke` | Route/navigation/production behavior PRs |
| Authenticated upload smoke | PR-A and release hardening |
| Permission negative smoke | PR-A, PR-B, PR-C, PR-D, release hardening |
| Search body fixture smoke | PR-C |
| No fake data/manual UI sweep | Every UI bundle |
| Responsive/accessibility QA | Every UI bundle with visible routes |
| Audit metadata scan | Upload, download, search, AI prep, records, workflow |

## First Execution Recommendation

Start with PR-A as one larger bundle:

1. DMS-UX-001 to 003: lock baseline, route inventory, Matter app source-of-truth contract.
2. DMS-UX-004: Matter app-backed Matter Code picker contract.
3. DMS-UX-005: FormData upload helper.
4. DMS-UX-101 to 105: Matter-scoped upload, status, list contract, `/files` browse, matter file section.
5. DMS-UX-108 to 112: smoke guard, design-system pass, safety tests, navigation activation, fixtures.

Do not begin PR-C search or PR-D workflow until PR-A makes the basic DMS loop real. Search is valuable, but the product still needs the primary Matter app Matter Code -> upload -> file list -> document detail path first.
