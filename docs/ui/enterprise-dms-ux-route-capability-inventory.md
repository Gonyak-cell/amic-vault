# Enterprise DMS UX Route Capability Inventory

Date: 2026-06-18

Related TUW: DMS-UX-002 Route And Capability Inventory

Source baseline:

- `docs/ui/enterprise-dms-ux-baseline-gap-audit.md`
- `docs/ui/enterprise-dms-ux-tuw-plan.md`
- `docs/integrations/matter-app-vault-contract.md`

## Route Inventory

| Route | DMS role | Current state | Required next TUW |
| --- | --- | --- | --- |
| `/dashboard` | Entry point for recent activity, AI prep status, integrations, action links. | Partial. API-backed dashboard exists with a DMS action launcher for Matter upload, file cabinet, search, search folders, work queue, notifications, file organization prep filters, and admin ops health. It also has a real-data-only action queue derived from policy alerts, file organization prep readiness, integration state, and API connection failures. Server-derived work/notification APIs reuse the same permission-scoped operating state. Persisted assignment/due/status remains a follow-up. | DMS-UX-501 to 507 |
| `/work` | Work queue / task inbox entry point. | Partial. Dedicated work queue route consumes `GET /work/items`, a server-derived API built from permission-scoped dashboard operating data. The route now provides source/status/sort filters plus links for extraction failure, OCR pending, metadata completion, file-organization prep, and records actions. Persisted assignment/due/status task storage remains a follow-up. | DMS-UX-501 to 507 |
| `/notifications` | Notification center entry point. | Partial. Dedicated notification route consumes `GET /notifications`, a server-derived API built from permission-scoped policy alerts, file organization prep status, integration state, and recent activity. The route now provides source/status/sort filters and each notification links back to the approved source surface. Persisted notification storage remains a follow-up. | DMS-UX-506 |
| `/matters` | Matter app-backed matter list and workspace entry. | Partial. Vault matter list exists and each real row links to the Matter workspace, Matter Code filtered file cabinet, and Matter Code filtered search without fake counts or raw refs as visible labels. Matter app source-of-truth contract is not implemented. | DMS-UX-003, 004, 113, 114 |
| `/matters/[matterId]` | Matter workspace home. | Partial. Profile/team shell, Matter Code based workspace actions for file cabinet/search/work/records/audit, matter-scoped file section, upload-triggered file-list refresh, governance context, Matter-scoped audit timeline, records links, and real-status work queue exist; unified task API remains incomplete. | DMS-UX-501 to 506 |
| `/matters/[matterId]/team` | Matter membership/admin view. | Partial. Uses safe labels, but broader picker/source-of-truth alignment is still needed. | DMS-UX-107, 401, 402 |
| `/files` | File upload and browse surface. | Partial. All-documents vault, server-backed document filters/sort, extraction/OCR status filters, Matter Code picker with URL-provided Matter Code prefill/selection, single/bulk upload panel, upload receipt queue with document-detail, all-documents vault, and Matter file-cabinet actions, and matter-scoped browse surface exist with user-facing source labels. Successful uploads refresh both the all-documents vault through `DocumentVaultList` and the selected Matter file list through `MatterDocumentList` instead of leaving stale browse state. Production navigation remains gated until Matter app source is configured and authenticated smoke is ready. | DMS-UX-102, 107, 108, 111 |
| `/documents/[id]` | Document detail/action center. | Partial. Action center exists with profile read/edit, preview, controlled download reason, version list, add-version flow, governance context, search hit context, bounded preview hit fragment, records/audit links, records action entry points, real-status work queue, related Matter documents loaded from the permission-scoped matter document list API, and related emails loaded from the permission-scoped Matter email timeline when the filing references the current document. New-version upload refreshes the document profile, version list, document-scoped audit timeline, and file-organization prep status together and shows a bounded receipt without raw refs. Document-scoped audit timeline clears previous rows before loading and after denied/error reloads. Check-out/Office live edit remains deferred by ADR-016; attachment and duplicate-specific related-item APIs remain incomplete. | DMS-UX-405, 406, 407, 501, 606 |
| `/search` | Permission-bound enterprise search. | Partial. Backend title/body FTS, snippets, facets, audit, target scope, display-safe title/Matter Code/client/extraction filters, legal-hold/records-status refiners, sort, URL state, active filter chips, compact query syntax help, extraction/OCR searchability facets, display-safe grouping, user-scoped persisted saved searches, current-search reusable links, and result actions to document detail/preview/file-cabinet filters exist. Search result detail and preview links pass bounded hit context without URL-storing snippets/search terms. True PDF text anchor highlighting remains incomplete until the preview/index API exposes safe anchors. | DMS-UX-305 to 314, 503, 609 |
| `/search/folders` | Search-folder return path for repeated DMS discovery work. | Partial. User-scoped saved searches are exposed as search folders in production navigation, backed by the saved-search API, safe URL reconstruction, and extraction/OCR filter preservation. Admin-shared folders and folder analytics remain deferred. | DMS-UX-309, 310 |
| `/records` | Records lifecycle console. | Partial/strong backend. Document pages now link records actions with display-safe context labels, and records route consumes those labels through a normal action-readiness panel for hold, archive, disposal, and certificate review without showing raw refs. Persisted disposal-task workflow storage remains incomplete. | DMS-UX-405, 505 |
| `/audit` | Admin audit search/export. | Partial/strong. Contextual matter/document timelines exist and clear stale rows on denied/error reloads; deeper admin audit remains separate. | DMS-UX-406, 511 |
| `/walls` | Ethical wall/security admin. | Partial. Wall surfaces exist and common Matter lookup/create now uses Matter Code picker; user/group membership changes still need picker APIs before raw refs can be removed from advanced security operations. | DMS-UX-402 |
| `/admin` | Enterprise/admin settings. | Partial. SSO/BYOK/SIEM/backup/compliance surfaces exist; DMS taxonomy and search refiner configuration are API-backed with admin-only save/list/disable behavior, tenant RLS, validation, and reference-only audit. Matter/folder templates remain gated until folder/document-set semantics are approved. Search index reprocessing is wired to the admin reindex endpoint and search health now shows index coverage, stale index counts, extraction/OCR status, stale chunk/embedding counts, and no-result search audit hashes without raw query/body/snippet content. Operations health uses local file organization prep health/metrics only and does not expose raw content. | DMS-UX-311, 508, 601 to 610 |
| `/admin/security` | Security/admin compatibility route. | Partial. Same admin/security route policy as `/admin`. | DMS-UX-401 to 404 |
| `/integrations` | Integration status parent. | Partial. Shows safe integration matrix: Matter app links to source/gate status, Outlook links to real status, OneDrive/Office remain gated without connected-state claims. | DMS-UX-003, 607, 610 |
| `/integrations/matter-app` | Matter app source/gate status. | Partial. Shows Matter Code source mode, upload-authoritative gate, projection fallback policy, and setup-required state without exposing endpoints, tokens, internal Matter IDs, or connected-state claims before configuration. Runtime Matter app endpoint remains a blocker. | DMS-UX-003, 004, 801 |
| `/integrations/outlook` | Outlook filing/admin status. | Partial. Outlook operations status exists and now documents the Vault filing path into Matter/document/search UX; deeper filing smoke remains required. | DMS-UX-606 |
| `/integrations/onedrive` | Future OneDrive/Office integration. | Hidden/gated. No production claim before contract approval. | DMS-UX-607 |
| `/ai-prep` | Local AI file-organization prep status. | Limited/approved. Must remain file organization only. | DMS-UX-509 |
| `/external/[token]` | Future external sharing/client portal. | Intentionally gated/out of current internal UX scope. | DMS-UX-510 |
| `/outlook-addin` | Office task pane surface. | Separate task-pane-only route. Needs DMS filing consistency. | DMS-UX-606 |

## API Capability Inventory

| Capability | Current evidence | Current state | Required next TUW |
| --- | --- | --- | --- |
| Matter create/list/get/update/status/legal hold | `apps/api/src/modules/matter/*` | Exists as Vault matter API/projection. Must align with Matter app source-of-truth. | DMS-UX-003 |
| Matter members | `apps/api/src/modules/matter/matter-member*` | Exists. Picker/source contract cleanup needed. | DMS-UX-107, 401 |
| Matter suggestions | `POST /search/matter-suggestions` | Exists for Outlook hash-only suggestion use. May be reusable after Matter app contract alignment. | DMS-UX-004 |
| Document upload | `POST /matters/:matterId/documents` plus web FormData helper | Exists. Browser flow is Matter Code-gated and blocks when Matter app source is unconfigured. | DMS-UX-102, 108 |
| Document metadata update | `PATCH /documents/:documentId/metadata` | Exists and is wired to the document action center profile editor. | DMS-UX-401, 405 |
| Document download | `GET /documents/:documentId/download` | Exists and is wired to a controlled download UI with reason-code selection. | DMS-UX-406 |
| Document versions | add/list version endpoints | Exists and is wired to version history plus add-version UI; immutable-original rule remains server-owned. | DMS-UX-407 |
| Document list/browse | `GET /documents` and `GET /matters/:matterId/documents` through `document_search_index idx` and search permission scope | Exists for all-documents and matter-scoped current document listing with title, Matter Code, type, status, confidentiality, privilege, extraction/OCR status, AI-prep eligibility, legal-hold, and sort filters. | DMS-UX-104, 108 |
| Preview | Preview module exists in repo. | Document action center embeds the preview endpoint with unavailable/error handled by the server response; search results pass bounded hit count/index context into document detail and preview URL fragments without raw snippet/query URL storage. True PDF text anchor highlighting remains incomplete until the preview/index API exposes safe anchors. | DMS-UX-308 |
| Search title/body | `document_search_index` with `title_tsv` and `content_tsv` plus `POST /admin/search/reindex` and `GET /admin/search/health` | Exists. Query target can be all/title/body; UI exposes target/sort/group, display-safe text filters, legal-hold/records-status refiners, user-scoped saved searches, search folders, and an admin tenant reindex request action. `tests/integration/search-permission/search-body-fixture.spec.ts` proves body-only fixture text is found by body/full-text search, not title-only search, remains hidden for unauthorized same-tenant matters, and produces bounded audit metadata only. Admin search health displays bounded index/extraction/OCR/no-result audit aggregates only. | DMS-UX-308 to 314 |
| Records | Records APIs and route exist. | Strong backend; contextual document/matter links and display-label action readiness exist; persisted workflow task integration incomplete. | DMS-UX-505 |
| Audit | Audit query/export exists. | Strong backend; contextual timelines incomplete. | DMS-UX-406 |
| AI prep | Local Gemma file-organization prep status exists plus `GET /ai/ops/health` and `GET /ai/ops/metrics` for admin operations health. | Approved narrow scope. UI consumes only file organization prep health/metrics and keeps broader AI claims out of scope. | DMS-UX-508, 509 |
| Saved searches/search folders | `saved_searches`, `GET/POST/DELETE /search/saved-searches`, `/search/folders` | Partial. User-scoped saved searches persist validated `SearchQueryDto` only, audit hash/filter refs, and appear as search folders. Admin-shared folders and analytics remain deferred. | DMS-UX-309 |
| Workflow/task inbox | `GET /work/items` | Server-derived API exists and returns display-safe work items from permission-scoped dashboard operating state. The web route filters those items by source/status and links remediation to approved document and records entry points. It does not claim persisted assignment/due/status workflow storage. | DMS-UX-501 to 507 |
| Notifications | `GET /notifications` | Server-derived API exists and returns display-safe notification items from permission-scoped dashboard operating state and recent activity. The web route filters those items by source/status and links each item to an approved source surface. It does not claim persisted notification storage. | DMS-UX-506 |
| Taxonomy/templates | `enterprise_dms_taxonomies`, `enterprise_dms_search_refiners`, `GET/POST /enterprise/dms/taxonomies`, `POST /enterprise/dms/taxonomies/:taxonomyId/disable`, `GET/POST /enterprise/dms/search-refiners`, `POST /enterprise/dms/search-refiners/:refinerId/disable` | Taxonomy and search refiners are persisted, tenant-scoped, RLS-protected, validated, admin-only, and audited with reference-only metadata. Matter/folder templates remain gated pending folder/document-set semantics. | DMS-UX-601 to 605 |
| Matter app lookup/sync | Matter app runtime endpoint not found in this checkout. | Gap/blocker for production-grade Matter Code picker. `/integrations/matter-app` now exposes the safe source/gate status so operators can see why upload is blocked without leaking endpoint or internal refs. | DMS-UX-003, 004 |

## Immediate PR-A Decision

PR-A may implement dev/test UI against Vault's local matter projection only if the UI and docs keep this distinction explicit. Production activation of upload must remain blocked or explicitly scoped until the Matter app source-of-truth contract is implemented or an ADR approves the local projection as the Matter app mirror.

The safest PR-A order is:

1. Matter app contract and route/API inventory.
2. Matter picker component that can show `unconfigured`, `loading`, `empty`, `denied`, and `projection` states.
3. FormData upload helper.
4. Upload UI behind a readiness gate that requires a permitted matter and does not claim production Matter app integration unless configured.
5. Smoke guard that fails when production says upload is ready but Matter app lookup/picker/upload/list are not ready.

## Immediate PR-B Decision

PR-B may expose document detail operations backed by existing approved APIs:
profile read/edit, preview, controlled download, version list, add-version, and
same-Matter related document links loaded from the permission-scoped matter
document list API plus document-linked Matter email filings loaded from the
permission-scoped Matter email timeline API. It must not expose
check-out/check-in, Office live edit, coauthoring, duplicate graphs, attachment
relation graphs, or external
sharing controls until the required API/audit/security contracts are approved.
Those edit/open decisions are captured in `docs/adr/ADR-016-document-editing-and-office-flow.md`.

## Immediate PR-D Decision

PR-D may expose governance and workflow context only from approved, already-present
DTO/API fields: document confidentiality/privilege/legal hold/extraction state,
Matter legal hold/status/display fields, dashboard overview sections, and AI prep
readiness. It must not invent a task API, notification center, user/group picker,
or records disposal task engine before backend contracts exist.

PR-D closeout evidence is fixed in `docs/ui/enterprise-dms-pr-d-closeout.md`.
The evidence requires route-connected Effective Access, Ethical Wall, Records
Context, Matter/Document Activity Timeline, Action Inbox, Notification Center,
Ops Health, AI Prep file organization only scope, External sharing gated scope,
and stale-content clearing, while preserving explicit deferred items for
persisted tasks, persisted notifications, records disposal tasks, user/group
picker APIs, and access-request workflow.

## Immediate PR-E Decision

PR-E may expose admin configuration categories and integration status only as
API-backed data or explicitly gated contract states. Taxonomy and search
refiners are API-backed in the admin surface. Matter templates, folder
templates, OneDrive, and Office open/save must not present editable or connected
production states until save/sync/audit contracts are approved.

PR-E closeout evidence is fixed in `docs/ui/enterprise-dms-pr-e-closeout.md`.
The evidence requires API-backed taxonomy/search refiner administration,
read-only Matter/folder template contract states, Outlook filing unification
route evidence, OneDrive/Office gated planning, admin IA cleanup, and
integration status safety. It preserves deferred items for Matter/folder
template APIs, folder inheritance semantics, OneDrive open-save-sync runtime,
Office coauthoring/lock/rollback, and mobile/offline operating mode.
