# Enterprise DMS UX Baseline Gap Audit

Date: 2026-06-18

Scope: This freezes the operational UX baseline for AMIC Vault as an enterprise SaaS legal DMS. It covers file organization, document/matter operations, permissions, audit, records, and integration flows. It does not approve legal analysis, AI summary generation, external model routing, raw prompt/source/model-response storage, or ungated external sharing.

Implementation plan: `docs/ui/enterprise-dms-ux-tuw-plan.md`

## Research Sources

The baseline below is fixed from public vendor/product documentation for mature enterprise DMS patterns:

- iManage Control Center documents that workspaces are root containers for matters/projects, folders store documents/emails, document profile metadata exists, check-out/check-in locks editing, and container inheritance affects security and templates: https://docs.imanage.com/cc-help/10.4.0/en/Containers_and_Documents.html
- iManage Work email filing documents workspace/folder selection, filing-location search, and suggested filing destinations: https://docs.imanage.com/work-help/10.5.0/en/Filing_an_email.html
- NetDocuments Cloud Document Management describes document create/edit/save/versioning, matter-centric workspaces and client portals, system-of-record/version control, search/recent/favorites/custom metadata, predictive email filing, workflow automation, RBAC, and audit trails: https://www.netdocuments.com/solutions/cloud-document-management/
- Microsoft SharePoint Document Sets document content-type restrictions and shared metadata at a document-set level: https://support.microsoft.com/en-us/sharepoint/libraries/introduction-to-document-sets
- Microsoft Learn documents versioning, content approval, check-out, and check-in as document lifecycle controls: https://learn.microsoft.com/en-us/sharepoint/governance/versioning-content-approval-and-check-out-planning
- Microsoft Learn managed metadata documents term stores, managed terms, enterprise keywords, and taxonomy planning: https://learn.microsoft.com/en-us/sharepoint/managed-metadata
- Microsoft Purview documents sensitivity labels, audit events, supported Office/PDF label handling, search, eDiscovery, and DLP integration for SharePoint/OneDrive files: https://learn.microsoft.com/en-us/purview/sensitivity-labels-sharepoint-onedrive-files
- M-Files document control material describes metadata-driven permissions, workflow automation, approvals, audit, version control, and access management: https://www.m-files.com/supplemental/document-control/
- iManage Work search documentation distinguishes title/keyword/author/number search for documents, full-text keyword search across document text/title/metadata, email subject/keyword/from/to search, and matter/client/folder search types: https://docs.imanage.com/search/im.work/pt-BR/Search_tips_for_iManage_Work_at_imanage.work.html
- iManage search-result training documents result tabs, filters by date/file type/author and more, saved Search Folders, and preview keyword navigation: https://registration.imanage.com/pages/search-results
- M-Files search documentation describes advanced filters, search scope across metadata/file contents/both, object type narrowing, view-scoped search, search refinements, relevance sorting, result grouping, and highlighted search terms: https://userguide.m-files.com/user-guide/latest/eng/searching.html and https://userguide.m-files.com/user-guide/latest/eng/filters_tab.html
- M-Files API documentation confirms full-text search across metadata and file contents can be combined with other search conditions such as file type: https://developer.m-files.com/APIs/COM-API/Searching/SearchConditions/
- NetDocuments legal file search material describes advanced search parameters/filtering, OCR for images/PDFs, and AI auto-profiling metadata for better future search: https://www.netdocuments.com/solutions/legal-file-search/
- Microsoft SharePoint search schema documentation states search indexes crawled content and metadata as managed properties, exposes searchable/queryable/retrievable settings, and only returns results users have permission to see: https://learn.microsoft.com/en-us/sharepoint/manage-search-schema
- Microsoft SharePoint refiner documentation describes configurable search-result refiners such as Author, Modified Date, and custom managed-property refiners: https://learn.microsoft.com/en-us/sharepoint/search/how-to-add-refiners-to-your-search-results-page

## Fixed Baseline

An enterprise-grade legal DMS operational UX must include these flows unless an ADR explicitly defers or forbids them.

| Area | Fixed enterprise DMS expectation | AMIC Vault launch posture |
| --- | --- | --- |
| Matter/workspace containers | Matter/workspace root, folder or document-set navigation, consistent templates, inheritance-aware security, recent/favorite access. | Required. Matter exists; folder/document-set UX is missing. |
| Upload/intake | User must choose a valid canonical Matter app matter by human-facing matter code/name before upload, then upload an existing file into that matter/folder, select required metadata, see validation, decide duplicate/version behavior, and see post-upload status. | Required now. Backend upload exists and is matter-scoped; Matter app-backed browser UX is missing. |
| Document browse/list | Users can browse files by matter/folder with sort, filter, safe display names, owner/uploader/status/version/updated columns, and action affordances. | Required now. `/files` is still empty/hidden. |
| Document profile/metadata | Document profile shows and edits matter, type, subtype, confidentiality, privilege/status, tags, dates, parties, responsible user, and safe reference IDs only when operationally necessary. | Required. Backend fields exist; profile UX is incomplete. |
| Versioning and locks | Version history, add-new-version, compare/open latest, check-out/check-in or explicit lock flow, lock owner, comments, and audit. | Required. APIs exist for versions; UX is missing. Lock UX needs product decision. |
| Preview/download/open/edit | Document detail supports preview, controlled download, open/edit handoff, and all actions show permission-aware disabled states. | Required. Preview/download APIs exist; detail UX is incomplete. |
| Search/discovery | Permission-before-search results across document title, document body, metadata, emails/attachments where in scope, matters, folders, and clients; selectable search scope; advanced metadata filters/refiners; safe facets; highlighted snippets; preview keyword navigation; saved searches/search folders; no raw UUID fallback; recent/favorite shortcuts; no pre-query fake results. | Partly implemented. Backend has title/body FTS, snippets, facets, and audit; UI and filter model are not yet enterprise-grade. |
| Email filing | Outlook/email filing into matter/folder, suggested location, attachments saved through document pipeline, and filing audit. | Partly implemented server/add-in side. Needs unified DMS UX surface. |
| Permissions/security | Effective access panel, ethical wall state, confidentiality/sensitivity labels, DLP status, safe denied states, and reference-only audit. | Partly implemented. Needs DMS-friendly controls and pickers. |
| Workflow/tasks | Routing, approval, review tasks, notification center, deadline/status tracking, and action queue. | Missing as a DMS flow. Records/break-glass are separate governance flows. |
| Audit/records | Audit trail, retention policy, legal holds, archive/disposal, certificates, export, and immutable/reference-only metadata. | Strong backend coverage; UI still needs operational polish and pickers. |
| Integrations | Office/Outlook/OneDrive or equivalent open/save/sync flows, plus mobile/responsive support. | Outlook and integration admin are present; Office/OneDrive DMS flow is incomplete. |
| AI prep | Post-upload file organization only: safe document profile, key fields, date facts, people/orgs, tags, filing suggestions, source outline, retrieval hints. | Implemented narrowly by design. No legal analysis or summary. |

## Current Vault Comparison

### Implemented Or Strong

- Authenticated app shell uses the signed-in user's name and email instead of exposing workspace IDs.
- Matter list/detail/team shell exists and uses safe display labels.
- Search is permission-bound, avoids pre-query fake results, and no longer falls back to raw document IDs as user-facing labels.
- Audit, records, ethical wall, admin/security, enterprise readiness, dashboard, and AI-prep surfaces exist.
- Backend has material DMS primitives: matter upload, document metadata update, delete/restore lifecycle, download, new version upload, version list, legal hold, search, audit export, records retention, and email-to-document ingestion.
- Gemma/local AI prep is correctly scoped to file organization only, and current UI status surfaces do not approve legal analysis.

### Material Gaps

| Gap | Evidence | Why it matters |
| --- | --- | --- |
| No browser file upload flow | `apps/api/src/modules/document/document.controller.ts` exposes `POST /matters/:matterId/documents`, but `apps/web/src/app/(app)/files/page.tsx` is an API-unavailable empty state and `/files` is hidden in `apps/web/src/lib/features.ts`. | A DMS without user-visible, matter-scoped upload is not operationally complete even if the API works. |
| No file cabinet/folder/document-set UX | No visible folder tree, file plan, document set, or matter template browse flow. | Mature DMS products organize documents within matter containers, not only as search results. |
| No document list/browse surface | Dashboard has recent activity, and search has results, but no stable files table by matter/folder. | Users need a primary place to inspect and operate on documents without knowing search terms. |
| Document detail lacks primary DMS actions | Existing document route does not expose a complete action bar for preview, download, metadata edit, add version, version history, or AI prep status in one coherent workflow. | Document detail should be the operational center for a file. |
| Version history/add-version UX is missing | Backend has `GET /documents/:id/versions` and add-version endpoints; frontend route does not present the flow. | Version control is a core DMS expectation. |
| Check-out/check-in or lock UX is missing | Research baseline treats locking/check-in as standard. Current product has lifecycle and permission controls but no user-facing lock workflow. | Without a visible lock/editing state, users cannot understand who can edit or whether a document is controlled. |
| Metadata/profile UX is incomplete | Backend metadata exists; UI does not yet provide a full profile editor with taxonomy, confidentiality, privilege, responsible user, and tags. | DMS findability and governance depend on profile metadata. |
| Pickers are incomplete | Some team/wall/admin flows still rely on advanced reference inputs or unavailable picker states. | Enterprise UX should use matter/user/folder pickers and hide raw references by default. |
| Workflow/task inbox is absent | Dashboard shows activity, but no routed document task queue, approval queue, or action-center pattern. | Enterprise DMS operations need work routing, not only passive history. |
| Office/OneDrive DMS flow incomplete | Integration/admin surfaces exist, but there is no unified open/save/sync or Office editing flow for documents. | Legal DMS usage is tightly tied to Office document lifecycle. |
| Release checks do not catch upload UX absence | Production UI smoke accepts `/files` hidden/empty as a passing condition. | The current gate can pass while the most basic DMS operation is absent. |
| External collaboration remains intentionally gated | External portal/client portal patterns are enterprise DMS standards, but current AMIC approval excludes broader external sharing. | This is a future product lane, not a defect in the current approved internal-only scope. |

### Search-Specific Findings

Current Vault search is not a mock shell. It has meaningful foundations:

- `db/migrations/0036_create_document_search_index.sql` creates `title_tsv` and `content_tsv`, so indexed document body text is searchable.
- `apps/api/src/modules/search/query/search-query.builder.ts` uses PostgreSQL `websearch_to_tsquery`, ranks title higher than body, and builds highlighted snippets.
- `packages/shared/src/search/search-query.dto.ts` supports filters for matter, client, document type, date range, and current/superseded/all version status.
- `apps/web/src/app/(app)/search/search-client.tsx` and `apps/web/src/components/search/search-facets.tsx` expose those basic facets and avoid raw UUID labels.
- `apps/api/src/modules/search/search.service.ts` records reference-only `SEARCH_EXECUTED` audit events and applies permission scope before search.

The missing enterprise search layer is:

| Search gap | Expected enterprise behavior | Current Vault state |
| --- | --- | --- |
| Search target/scope selector | User can choose title-only, full-text/body, metadata/profile, docs, emails, attachments, folders, matters, clients, current matter/folder, recent matters, or whole allowed tenant. | API searches document title/body; UI has no target/scope selector. |
| Full advanced filter panel | Matter code/name, client, folder/path, document type/subtype, file extension/MIME, author/operator/uploader/filed-by, created/modified/uploaded dates, responsible lawyer, confidentiality, privilege, sensitivity label, legal hold, retention status, OCR status, version status, and custom metadata. | Only matter/client/documentType/date/versionStatus are supported. |
| Query syntax controls | Exact phrase, boolean operators, all words/any words, exclude terms, document number/reference lookup, and safe parser errors. | `websearch_to_tsquery` gives basic web-style query behavior, but no explicit UX or help surface. |
| OCR/searchability status | Images and scanned PDFs are OCR-indexed or clearly marked as OCR pending/failed/unsearchable. | Extraction status fields exist, but search UI has no OCR/searchability facet or remediation flow. |
| Result refinement UX | Dynamic refiners update after search, with counts, safe labels, multi-select where appropriate, and clear active-filter chips. | Basic facets exist, mostly single-select, with no advanced chips panel. |
| Result preview and hit navigation | Result snippet highlights hit terms; preview lets users jump between occurrences within the document. | Snippets/highlights exist; preview route/action and in-preview keyword navigation are missing. |
| Saved search/search folder | Users can save frequent searches and expose them as matter/folder-level virtual result sets. | Missing. |
| Result grouping and sorting | Sort by relevance, modified date, created date, title, author, matter, type; group by object type/matter/client. | Backend ranks/updates; UI has no sort/group controls. |
| Metadata/taxonomy search | Custom managed metadata fields are searchable/queryable/refinable and can be conditional by document type/context. | Metadata model exists, but custom profile/taxonomy search is not surfaced. |
| Federated/integration search | Where approved, searches can include Outlook/email filings, OneDrive/Office content, or external repositories with security trimming. | Email ingestion exists; integrated/federated search UX is incomplete and OneDrive remains gated. |
| Search analytics/admin | Admin can see stale index, failed extraction/OCR, no-results queries, slow searches, and reindex status without body leakage. | Reindex/audit foundations exist; operator analytics are incomplete. |

These gaps should not be confused with AI summary or legal analysis. Enterprise search can and should search body text and metadata while still preserving the approved product limit: no legal conclusion generation, no document summary, no external model route, and no raw prompt/source/model-response storage.

## Obvious Enterprise DMS UX Flow Checklist

This section freezes the "of course this should exist" flows. Matter-code-first upload and enterprise search are examples of this broader class.

| Flow | Baseline expectation | Current Vault posture |
| --- | --- | --- |
| Matter creation and matter-code lookup | Users create or select a matter using the canonical Matter app matter code/name before any matter-scoped document action. Matter code is the operational handle; UUIDs are not normal-user inputs. Vault may cache or mirror matter references, but the Matter app is the source of truth unless an ADR explicitly says otherwise. | Vault matter model/list exists. Matter app source-of-truth integration contract and Matter-code-first upload UX are missing. |
| Matter workspace home | A Vault matter page shows profile, members, permission state, files, recent activity, tasks, records/holds, and safe next actions while staying consistent with the canonical Matter app matter profile. | Matter shell/team exists. File cabinet, task queue, records summary, Matter app consistency, and document actions are incomplete. |
| Matter file cabinet | Matter contains folders/document sets or an explicit metadata-driven equivalent, with templates and inheritance-aware security. | Missing. |
| Single-file upload | Upload starts by selecting a permitted canonical Matter app Matter Code/name, then file, profile metadata, validation, duplicate/version decision, extraction/OCR status, and post-upload AI prep status. | Backend upload exists; Matter app-backed browser flow is missing. |
| Bulk upload/import | Users can upload many files, assign them to one matter/folder or map by canonical Matter app matter code, review failures, retry, and see indexing/prep progress. | Bulk job skeleton exists server-side; operator UX is missing. |
| Email filing | Users can file emails and attachments into a matter/folder from Outlook, with suggested filing locations, saved filing preferences, and audit. | Backend/add-in foundations exist; unified Vault UX is incomplete. |
| Document browse/list | Users can browse documents by matter/folder with columns, filters, safe labels, and row actions. | `/files` is empty/hidden; no production browse flow. |
| Document detail/action center | A document page provides preview, metadata/profile, versions, download/open/edit, access, audit, AI prep status, and related documents. | Detail route exists but action center is incomplete. |
| Metadata/profile editor | Users can view/edit required profile fields: type/subtype, confidentiality, privilege, responsible person, tags/terms, dates, parties, filing location, custom metadata. | Partial backend metadata. UI editor/taxonomy are incomplete. |
| Version control | Users can see latest/prior versions, add a new version, compare/open versions, and understand superseded/current state. | APIs exist; UX missing. |
| Check-out/check-in or coauthoring lock | Users can see who is editing, lock/check out where required, check in, cancel checkout, or use approved coauthoring with clear state. | Missing or undecided. Needs ADR or implementation. |
| Preview with hit navigation | Users can preview documents and jump to search hits; OCR/searchability problems are visible. | Snippet foundation exists; preview/hit navigation UX missing. |
| Download/open/edit in Office | Users can download or open in Office with permission-aware actions and audit; edited files save back as current/new version. | Download/open/edit UX incomplete; Office/OneDrive lane gated. |
| Enterprise search | Users can search title/body/metadata/emails/attachments/matters/folders/clients with advanced filters, refiners, saved searches, sorting/grouping, and permission trimming. | Backend FTS/facets exist; advanced UX/filter model incomplete. |
| Recent/favorites/pinned work | Users can return to recent matters/documents, favorite/pin matters, and save frequent searches. | Limited dashboard recency; favorites/pinned/saved search missing. |
| Effective access view | Users/admins can understand who can access a matter/document, why, and what wall/role/policy controls apply. | Permission foundations exist; enterprise-friendly access explanation/pickers need work. |
| Ethical wall and confidentiality UX | Wall/confidentiality states are visible in context, with safe denied states and admin workflows using pickers. | Walls/admin exist; picker/raw-ref gaps remain. |
| Sensitivity/DLP/security labels | Users can see/apply sensitivity/confidentiality labels where approved; DLP/search/eDiscovery behaviors are clear. | DLP/security foundations exist; label UX and file-level status are incomplete. |
| External sharing/client portal | Where approved, secure external sharing/client portal has explicit recipients, expiry, watermark/download policy, audit, and revocation. | Intentionally gated by current production approval; future lane only. |
| Workflow/action inbox | Users see assigned document tasks: review, approve, sign, complete metadata, resolve OCR/indexing, retention/disposal actions. | Missing as a unified DMS flow. |
| Notifications | Users receive actionable notifications for upload completion, failed extraction/OCR, access requests, approvals, holds, expiring shares, and workflow tasks. | Partial status surfaces; unified notifications missing. |
| Records lifecycle | Users/admins can apply legal hold, retention policy, archive/dispose, review certificates, and see lifecycle status from matter/document context. | Strong backend/records surface; contextual UX polish remains. |
| Audit/activity timeline | Matter/document pages show safe activity timelines and admin audit supports export without raw content. | Audit console exists; contextual document/matter timeline needs work. |
| Admin taxonomy/templates | Admins manage document types/subtypes, custom metadata, matter templates, folder templates, required fields, and search refiners. | Admin exists for enterprise readiness/security; taxonomy/template admin incomplete. |
| Admin operations health | Admins see indexing, extraction/OCR, queue, AI prep, integration, storage, audit, and records health with retry controls. | Some dashboard/AI prep/reindex foundations exist; unified ops health missing. |
| Integrations | Outlook, Office, OneDrive/SharePoint, Teams/mobile/desktop flows keep documents in familiar tools while preserving Vault governance. | Outlook foundations exist; Office/OneDrive/mobile/desktop DMS flows incomplete or gated. |
| Responsive/accessibility/no fake data | All flows work on desktop/tablet/mobile, keyboard, screen reader basics, and never show fake counts/people/documents. | Current UI package improved this, but new DMS flows need the same QA gates. |

The immediate product gap is therefore not one isolated screen. Vault needs a coherent operational loop:

1. Create/select matter by canonical Matter app matter code.
2. Upload/file/import into that matter.
3. Complete profile metadata and security labels.
4. Extract/OCR/index and show processing status.
5. Browse/search/preview the document.
6. Edit/version/check-in or coauthor.
7. Route review/approval/tasks.
8. Apply records/security governance.
9. Audit every action.
10. Return through recents/favorites/saved searches.

## Frozen Delta Backlog

These TUWs should be treated as the DMS UX backlog for closing the enterprise gap. Bundle them into larger PRs to reduce review overhead, but keep acceptance criteria separate.

### DMS-UX-001 Baseline And Inventory Lock

- Update `docs/ui/production-ui-inventory.md` to reference this baseline.
- Update UI PR checklist so DMS upload/browse/profile/version flows are not treated as optional once the backend API is ready.
- Acceptance: docs clearly distinguish current approved scope from future external collaboration scope.

### DMS-UX-101 Browser Upload Activation

- Add a `/files` upload entry point using the existing `POST /matters/:matterId/documents` endpoint.
- Add matter-code/name picker before file selection, file chooser, title/type/confidentiality/privilege fields, validation errors, success state, and post-upload AI-prep status link.
- Do not allow free-floating uploads. If no permitted matter is selected, the upload action must stay disabled and explain that a matter is required.
- Add a FormData-safe web API helper instead of forcing JSON `apiFetch`.
- Acceptance: an authenticated permitted user can search/select a canonical Matter app matter by matter code or display name and upload into that allowed matter; denied matter/member cases fail closed; no raw IDs are displayed as primary labels.

### DMS-UX-102 Files Browse Surface

- Replace the `/files` empty state with a permission-scoped file table once list API support is available.
- Include safe title, matter, document type, version, updated time, owner/uploader, confidentiality, status, and action menu.
- Acceptance: empty tenant shows a polished empty state; seeded tenant shows real data only; no fake counts or sample rows.

### DMS-UX-103 Matter File Cabinet

- Add matter-detail tab/section for files.
- If folder/document-set backend is not available, create a product decision: implement a minimal folder model or explicitly defer folder hierarchy behind a visible non-goal.
- Acceptance: users can start from a matter and reach upload/list/document detail without search.

### DMS-UX-104 Document Profile Editor

- Add profile edit flow for title, type/subtype, confidentiality, privilege/status, responsible user, tags/terms, and filing location.
- Add safe picker components for users/matters/folders.
- Acceptance: profile edits are audited, validation is clear, and reference IDs are secondary/debug-only.

### DMS-UX-105 Document Detail Action Center

- Add permission-aware action bar: preview, download, edit metadata, add version, view versions, copy reference, and AI-prep status.
- Integrate existing preview/download/version APIs.
- Acceptance: denied actions show stable disabled or denied states; successful actions record audit where required.

### DMS-UX-106 Version And Lock Decision

- Implement version history and add-version UI.
- Decide whether check-out/check-in/lock is part of the immediate launch or explicitly deferred by ADR.
- Acceptance: the user can identify latest version, prior versions, upload a new version, and understand current edit/lock status.

### DMS-UX-107 Picker Infrastructure

- Build shared matter/user/folder picker components with loading, empty, denied, and error states.
- Replace advanced raw-reference-first forms in team, wall, records, upload, and metadata screens.
- Acceptance: normal operators do not need UUIDs or internal refs to complete common tasks.

### DMS-UX-108 Workflow And Action Queue

- Add a document operations queue for review, approval, metadata completion, retention action, and AI-prep needs-attention items.
- Acceptance: dashboard summary links into actionable queues, not only historical cards.

### DMS-UX-109 Office/Outlook/OneDrive DMS Flow

- Unify Outlook filing, email attachment ingestion, and document upload status under the same DMS concepts.
- Plan Office/OneDrive open-save-sync as a separate gated integration lane.
- Acceptance: email filing and regular upload produce consistent document records, metadata, audit, and AI-prep status.

### DMS-UX-110 Smoke And QA Gate Upgrade

- Update `pnpm ui:production-smoke` so `/files` hidden/empty passes only when upload/list APIs are intentionally disabled by policy.
- Add authenticated smoke for: upload allowed, upload denied, post-upload row visible, document detail actions visible, version history visible, no fake data.
- Acceptance: CI fails if API-ready production still lacks the upload/browse UX.

### DMS-UX-111 Enterprise Search Upgrade

- Add explicit search target/scope controls: title, full text/body, metadata/profile, docs, emails/attachments, matters, clients, folders when available, current matter/folder, recent matters, and all permitted content.
- Expand `searchFiltersSchema`, backend filter builder, facets, and UI filter panel for: matter code/name, client, folder/path, document type/subtype, file type/MIME, author/operator/uploader/filed-by, created/modified/uploaded date ranges, responsible lawyer, confidentiality, privilege, sensitivity label, legal hold, retention status, OCR/extraction status, version status, and custom metadata.
- Add active filter chips, multi-select facets where safe, sort controls, result grouping, and saved search/search folder support.
- Add preview hit navigation so highlighted snippets can lead into a document preview with next/previous occurrence controls.
- Add searchability operations view for stale index, OCR pending/failed, extraction failed, and reindex status.
- Acceptance: body full-text search is proven with fixture text; permission-before-search remains enforced; facets never expose unauthorized labels/counts; raw document body is not logged or stored in audit; no-results/denied/error states clear stale results.

## Recommended Implementation Bundle

To reduce PR overhead, implement in three larger PRs:

1. **PR-A Upload And Browse Foundation**: DMS-UX-001, 101, 102, 110.
2. **PR-B Matter And Document Operations**: DMS-UX-103, 104, 105, 106.
3. **PR-C Enterprise Search And Operations**: DMS-UX-107, 108, 111.
4. **PR-D Integrations**: DMS-UX-109.

## Immediate Conclusion

Current Vault is strong on permission, audit, records, search discipline, and local AI guardrails. It is not yet enterprise DMS-complete operationally because the visible file lifecycle is incomplete: upload, browse, file cabinet, document profile, version history, preview/download/action center, and picker-based operation flows are still missing or partial.

The highest-priority correction is not another AI feature. It is to make `/files` and matter-level file operations real, backed by the already-existing upload/version/download APIs, and to update production smoke so this gap cannot pass unnoticed again.
