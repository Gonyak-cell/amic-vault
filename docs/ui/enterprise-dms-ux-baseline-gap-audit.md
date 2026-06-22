# Enterprise DMS UX Baseline Gap Audit

Date: 2026-06-18

Status: Historical baseline snapshot. Current route capability status is
tracked in `docs/ui/enterprise-dms-ux-route-capability-inventory.md` and
`docs/ui/production-ui-inventory.md`.

Scope: This freezes the operational UX baseline for AMIC Vault as an enterprise SaaS legal DMS. It covers file organization, document/matter operations, permissions, audit, records, and integration flows. It does not approve legal analysis, AI summary generation, external model routing, raw prompt/source/model-response storage, or ungated external sharing.

Implementation plan: `docs/ui/enterprise-dms-ux-tuw-plan.md`

Current-state note, 2026-06-22: several gaps recorded below have since been
closed in the web code, including visible `/files`, Matter Code gated upload,
document browse/list, document action center, version flows, contextual audit,
saved searches/search folders, work queue, notifications, and admin taxonomy
surfaces. Remaining DMS GA risk is primarily external authenticated DMS smoke
and owner evidence, plus explicitly deferred Office/check-out/folder-inheritance
contracts.

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
| Matter/workspace containers | Matter/workspace root, folder or document-set navigation, consistent templates, inheritance-aware security, recent/favorite access. | Current checkout has matter workspace actions, file sections, records/audit links, and document-set template contracts; full folder inheritance remains deferred. |
| Upload/intake | User must choose a valid canonical Matter app matter by human-facing matter code/name before upload, then upload an existing file into that matter/folder, select required metadata, see validation, decide duplicate/version behavior, and see post-upload status. | Current checkout has Matter Code gated upload and post-upload status for approved APIs; external authenticated DMS smoke remains required before GA. |
| Document browse/list | Users can browse files by matter/folder with sort, filter, safe display names, owner/uploader/status/version/updated columns, and action affordances. | Implemented in current code for approved APIs; external DMS smoke still required before GA. |
| Document profile/metadata | Document profile shows and edits matter, type, subtype, confidentiality, privilege/status, tags, dates, parties, responsible user, and safe reference IDs only when operationally necessary. | Required. Backend fields exist; profile UX is incomplete. |
| Versioning and locks | Version history, add-new-version, compare/open latest, check-out/check-in or explicit lock flow, lock owner, comments, and audit. | Current checkout has version list/add-version flow for approved APIs. Check-out/check-in or Office coauthoring remains deferred by product/ADR. |
| Preview/download/open/edit | Document detail supports preview, controlled download, open/edit handoff, and all actions show permission-aware disabled states. | Required. Preview/download APIs exist; detail UX is incomplete. |
| Search/discovery | Permission-before-search results across document title, document body, metadata, emails/attachments where in scope, matters, folders, and clients; selectable search scope; advanced metadata filters/refiners; safe facets; highlighted snippets; preview keyword navigation; saved searches/search folders; no raw UUID fallback; recent/favorite shortcuts; no pre-query fake results. | Current checkout has approved search targets, refiners, saved searches/search folders, sorting/grouping, and bounded hit context. True PDF text anchor navigation and broader federation remain deferred. |
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

### Material Gaps At Baseline Snapshot

The table below records the 2026-06-18 baseline gaps. It is intentionally
preserved for traceability and no longer represents the current checkout for
rows marked closed in `docs/ui/enterprise-dms-ux-route-capability-inventory.md`.

| Gap | Evidence | Why it matters |
| --- | --- | --- |
| Browser file upload flow absent at baseline | Closed in current checkout: `/files` is visible and includes Matter Code gated upload, upload receipts, single/bulk upload affordances, and matter-scoped refresh. | A DMS without user-visible, matter-scoped upload is not operationally complete even if the API works. |
| File cabinet/folder/document-set UX incomplete at baseline | Partly closed in current checkout through matter file sections, all-documents vault, Matter template document-set contracts, and metadata-driven filing. Full folder inheritance remains deferred. | Mature DMS products organize documents within matter containers, not only as search results. |
| Document list/browse surface absent at baseline | Closed in current checkout for approved APIs: `/files` and matter file sections provide stable document browse/list surfaces. | Users need a primary place to inspect and operate on documents without knowing search terms. |
| Document detail lacked primary DMS actions at baseline | Closed in current checkout for approved APIs: document action center exposes profile edit, preview, controlled download, versions, audit, records, related documents/emails, and AI prep status. | Document detail should be the operational center for a file. |
| Version history/add-version UX missing at baseline | Closed in current checkout for approved APIs through document action center version list and add-version flow. | Version control is a core DMS expectation. |
| Check-out/check-in or lock UX is missing | Research baseline treats locking/check-in as standard. Current product has lifecycle and permission controls but no user-facing lock workflow. | Without a visible lock/editing state, users cannot understand who can edit or whether a document is controlled. |
| Metadata/profile UX incomplete at baseline | Partly closed in current checkout through profile edit and approved taxonomy catalog usage; future custom/profile expansion remains bounded by approved APIs. | DMS findability and governance depend on profile metadata. |
| Pickers are incomplete | Some team/wall/admin flows still rely on advanced reference inputs or unavailable picker states. | Enterprise UX should use matter/user/folder pickers and hide raw references by default. |
| Workflow/task inbox absent at baseline | Partly closed in current checkout through `/work` and `/notifications` for approved DMS operating events; broader SLA/workflow customization remains deferred. | Enterprise DMS operations need work routing, not only passive history. |
| Office/OneDrive DMS flow incomplete | Integration/admin surfaces exist, but there is no unified open/save/sync or Office editing flow for documents. | Legal DMS usage is tightly tied to Office document lifecycle. |
| Release checks did not catch upload UX absence at baseline | Partly closed by production UI and DMS smoke gates. External authenticated DMS smoke remains the release boundary before GA. | The current gate must fail if a production-ready DMS flow is missing. |
| External collaboration remains intentionally gated | External portal/client portal patterns are enterprise DMS standards, but current AMIC approval excludes broader external sharing. | This is a future product lane, not a defect in the current approved internal-only scope. |

### Search-Specific Findings

Current Vault search is not a mock shell. It has meaningful foundations:

- `db/migrations/0036_create_document_search_index.sql` creates `title_tsv` and `content_tsv`, so indexed document body text is searchable.
- `apps/api/src/modules/search/query/search-query.builder.ts` uses PostgreSQL `websearch_to_tsquery`, ranks title higher than body, and builds highlighted snippets.
- `packages/shared/src/search/search-query.dto.ts` supports filters for matter, client, document type, date range, and current/superseded/all version status.
- `apps/web/src/app/(app)/search/search-client.tsx` and `apps/web/src/components/search/search-facets.tsx` expose those basic facets and avoid raw UUID labels.
- `apps/api/src/modules/search/search.service.ts` records reference-only `SEARCH_EXECUTED` audit events and applies permission scope before search.

At the baseline snapshot, the missing enterprise search layer was:

| Search gap | Expected enterprise behavior | Current Vault state |
| --- | --- | --- |
| Search target/scope selector | User can choose title-only, full-text/body, metadata/profile, docs, emails, attachments, folders, matters, clients, current matter/folder, recent matters, or whole allowed tenant. | Current checkout exposes title/body/all target scope and display-safe DMS result actions; broader federated scopes remain gated. |
| Full advanced filter panel | Matter code/name, client, folder/path, document type/subtype, file extension/MIME, author/operator/uploader/filed-by, created/modified/uploaded dates, responsible lawyer, confidentiality, privilege, sensitivity label, legal hold, retention status, OCR status, version status, and custom metadata. | Current checkout has expanded approved filters/refiners and active filter state; unsupported/custom fields remain bounded by approved APIs. |
| Query syntax controls | Exact phrase, boolean operators, all words/any words, exclude terms, document number/reference lookup, and safe parser errors. | Current checkout includes compact query syntax help over the approved `websearch_to_tsquery` behavior. |
| OCR/searchability status | Images and scanned PDFs are OCR-indexed or clearly marked as OCR pending/failed/unsearchable. | Current checkout exposes extraction/OCR searchability facets and admin search health; true remediation automation remains follow-up. |
| Result refinement UX | Dynamic refiners update after search, with counts, safe labels, multi-select where appropriate, and clear active-filter chips. | Current checkout includes display-safe refiners, active filter chips, URL state, sort, and grouping for approved fields. |
| Result preview and hit navigation | Result snippet highlights hit terms; preview lets users jump between occurrences within the document. | Current checkout passes bounded hit context into document detail/preview. True PDF text anchor navigation remains deferred until preview/index APIs expose safe anchors. |
| Saved search/search folder | Users can save frequent searches and expose them as matter/folder-level virtual result sets. | Current checkout implements user-scoped saved searches and `/search/folders`; shared folders and analytics remain deferred. |
| Result grouping and sorting | Sort by relevance, modified date, created date, title, author, matter, type; group by object type/matter/client. | Current checkout supports approved sort/group controls. |
| Metadata/taxonomy search | Custom managed metadata fields are searchable/queryable/refinable and can be conditional by document type/context. | Current checkout consumes approved taxonomy/search refiner catalog; unsupported/disabled filters are stripped. |
| Federated/integration search | Where approved, searches can include Outlook/email filings, OneDrive/Office content, or external repositories with security trimming. | Outlook/email filing foundations are present; OneDrive/Office and broader federation remain gated. |
| Search analytics/admin | Admin can see stale index, failed extraction/OCR, no-results queries, slow searches, and reindex status without body leakage. | Current checkout has admin reindex and bounded search health aggregates without body leakage. |

These gaps should not be confused with AI summary or legal analysis. Enterprise search can and should search body text and metadata while still preserving the approved product limit: no legal conclusion generation, no document summary, no external model route, and no raw prompt/source/model-response storage.

## Obvious Enterprise DMS UX Flow Checklist

This section freezes the "of course this should exist" flows. Matter-code-first upload and enterprise search are examples of this broader class.

| Flow | Baseline expectation | Current Vault posture |
| --- | --- | --- |
| Matter creation and matter-code lookup | Users create or select a matter using the canonical Matter app matter code/name before any matter-scoped document action. Matter code is the operational handle; UUIDs are not normal-user inputs. Vault may cache or mirror matter references, but the Matter app is the source of truth unless an ADR explicitly says otherwise. | Current checkout has Matter Code picker and safe Matter app source/gate status. Runtime Matter app endpoint evidence remains a release blocker before production authority claims. |
| Matter workspace home | A Vault matter page shows profile, members, permission state, files, recent activity, tasks, records/holds, and safe next actions while staying consistent with the canonical Matter app matter profile. | Current checkout has matter workspace actions, matter-scoped files, audit, records links, governance context, and real-status work queue. Broader workflow customization remains deferred. |
| Matter file cabinet | Matter contains folders/document sets or an explicit metadata-driven equivalent, with templates and inheritance-aware security. | Current checkout has matter file sections and approved Matter template document-set contracts. Full folder inheritance/virtual folder tree semantics remain deferred. |
| Single-file upload | Upload starts by selecting a permitted canonical Matter app Matter Code/name, then file, profile metadata, validation, duplicate/version decision, extraction/OCR status, and post-upload AI prep status. | Implemented in current checkout for approved APIs; external DMS smoke remains required before GA. |
| Bulk upload/import | Users can upload many files, assign them to one matter/folder or map by canonical Matter app matter code, review failures, retry, and see indexing/prep progress. | Implemented in current checkout within approved `/files` upload surface; broader import automation remains deferred. |
| Email filing | Users can file emails and attachments into a matter/folder from Outlook, with suggested filing locations, saved filing preferences, and audit. | Current checkout has Outlook/add-in foundations and aligned status surfaces; live tenant evidence remains external. |
| Document browse/list | Users can browse documents by matter/folder with columns, filters, safe labels, and row actions. | Implemented in current checkout for approved APIs through `/files` and matter file sections. |
| Document detail/action center | A document page provides preview, metadata/profile, versions, download/open/edit, access, audit, AI prep status, and related documents. | Implemented in current checkout for approved APIs; Office live edit remains gated. |
| Metadata/profile editor | Users can view/edit required profile fields: type/subtype, confidentiality, privilege, responsible person, tags/terms, dates, parties, filing location, custom metadata. | Partly implemented through profile edit and approved taxonomy catalog; deeper custom metadata remains API-bounded. |
| Version control | Users can see latest/prior versions, add a new version, compare/open versions, and understand superseded/current state. | Implemented in current checkout for approved APIs; compare/open edit remains deferred. |
| Check-out/check-in or coauthoring lock | Users can see who is editing, lock/check out where required, check in, cancel checkout, or use approved coauthoring with clear state. | Missing or undecided. Needs ADR or implementation. |
| Preview with hit navigation | Users can preview documents and jump to search hits; OCR/searchability problems are visible. | Snippet foundation exists; preview/hit navigation UX missing. |
| Download/open/edit in Office | Users can download or open in Office with permission-aware actions and audit; edited files save back as current/new version. | Download/open/edit UX incomplete; Office/OneDrive lane gated. |
| Enterprise search | Users can search title/body/metadata/emails/attachments/matters/folders/clients with advanced filters, refiners, saved searches, sorting/grouping, and permission trimming. | Backend FTS/facets exist; advanced UX/filter model incomplete. |
| Recent/favorites/pinned work | Users can return to recent matters/documents, favorite/pin matters, and save frequent searches. | Limited dashboard recency; favorites/pinned/saved search missing. |
| Effective access view | Users/admins can understand who can access a matter/document, why, and what wall/role/policy controls apply. | Permission foundations exist; enterprise-friendly access explanation/pickers need work. |
| Ethical wall and confidentiality UX | Wall/confidentiality states are visible in context, with safe denied states and admin workflows using pickers. | Walls/admin exist; picker/raw-ref gaps remain. |
| Sensitivity/DLP/security labels | Users can see/apply sensitivity/confidentiality labels where approved; DLP/search/eDiscovery behaviors are clear. | DLP/security foundations exist; label UX and file-level status are incomplete. |
| External sharing/client portal | Where approved, secure external sharing/client portal has explicit recipients, expiry, watermark/download policy, audit, and revocation. | Intentionally gated by current production approval; future lane only. |
| Workflow/action inbox | Users see assigned document tasks: review, approve, sign, complete metadata, resolve OCR/indexing, retention/disposal actions. | Current checkout has `/work` backed by approved DMS operating events and persisted records/document work items; broader SLA/workflow customization remains deferred. |
| Notifications | Users receive actionable notifications for upload completion, failed extraction/OCR, access requests, approvals, holds, expiring shares, and workflow tasks. | Current checkout has `/notifications` for approved processing, duplicate, legal hold, and disposal states; broader delivery preferences remain deferred. |
| Records lifecycle | Users/admins can apply legal hold, retention policy, archive/dispose, review certificates, and see lifecycle status from matter/document context. | Strong backend/records surface; contextual UX polish remains. |
| Audit/activity timeline | Matter/document pages show safe activity timelines and admin audit supports export without raw content. | Current checkout has contextual matter/document timelines and stale-row clearing on denied/error reloads. |
| Admin taxonomy/templates | Admins manage document types/subtypes, custom metadata, matter templates, folder templates, required fields, and search refiners. | Current checkout has API-backed taxonomy, Matter template, and search refiner administration; folder inheritance remains deferred. |
| Admin operations health | Admins see indexing, extraction/OCR, queue, AI prep, integration, storage, audit, and records health with retry controls. | Current checkout has bounded search health, reindex, local file organization prep health/metrics, and approved ops/status surfaces; broader retry automation remains follow-up. |
| Integrations | Outlook, Office, OneDrive/SharePoint, Teams/mobile/desktop flows keep documents in familiar tools while preserving Vault governance. | Outlook foundations exist; Office/OneDrive/mobile/desktop DMS flows incomplete or gated. |
| Responsive/accessibility/no fake data | All flows work on desktop/tablet/mobile, keyboard, screen reader basics, and never show fake counts/people/documents. | Current UI package improved this, but new DMS flows need the same QA gates. |

At the baseline snapshot, the immediate product gap was not one isolated screen.
The desired operational loop was:

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

- Current checkout note: `/files` now has a permission-scoped file table/list surface for approved APIs.
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

- Current checkout note: production UI and DMS smoke gates now cover the upload/browse boundary; external authenticated DMS smoke remains required before GA.
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

Baseline conclusion, superseded by current checkout: Vault was strong on
permission, audit, records, search discipline, and local AI guardrails, but the
visible file lifecycle was incomplete. Current checkout has closed the approved
upload, browse, document profile, version, preview/download/action center,
picker, search-folder, work, notification, audit, and admin taxonomy surfaces
for approved APIs. Enterprise DMS GA still requires external authenticated DMS
smoke, owner signoff, responsive/accessibility receipts, monitoring, rollback,
and production approval evidence.

The highest-priority remaining correction is not another AI feature. It is to
complete the external DMS GA evidence boundary and keep deferred Office,
check-out/coauthoring, folder inheritance, broader workflow, and external
sharing lanes separate from already implemented internal DMS surfaces.
