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
| `/dashboard` | Entry point for recent activity, AI prep status, integrations, action links. | Partial. API-backed dashboard exists, but it is not yet a full DMS action launcher. | DMS-UX-507 |
| `/matters` | Matter app-backed matter list and workspace entry. | Partial. Vault matter list exists, but Matter app source-of-truth contract is not implemented. | DMS-UX-003, 004, 113 |
| `/matters/[matterId]` | Matter workspace home. | Partial. Profile/team shell and matter-scoped file section exist; records context, activity, task context incomplete. | DMS-UX-113, 405, 406 |
| `/matters/[matterId]/team` | Matter membership/admin view. | Partial. Uses safe labels, but broader picker/source-of-truth alignment is still needed. | DMS-UX-107, 401, 402 |
| `/files` | File upload and browse surface. | Partial. Matter Code picker, upload panel, and matter-scoped browse surface exist; production navigation remains gated until Matter app source is configured and authenticated smoke is ready. | DMS-UX-102, 108, 111 |
| `/documents/[id]` | Document detail/action center. | Partial. Document route exists, but preview/download/profile edit/version/action center are incomplete. | DMS-UX-201 to 212 |
| `/search` | Permission-bound enterprise search. | Partial. Backend title/body FTS, snippets, facets, audit exist; advanced scope/filter/refiner UX incomplete. | DMS-UX-301 to 314 |
| `/records` | Records lifecycle console. | Partial/strong backend. Needs contextual matter/document panels and picker cleanup. | DMS-UX-405, 505 |
| `/audit` | Admin audit search/export. | Partial/strong. Needs contextual timelines on matter/document pages. | DMS-UX-406 |
| `/walls` | Ethical wall/security admin. | Partial. Wall surfaces exist; normal operations still need picker-first UX and raw-ref reduction. | DMS-UX-402 |
| `/admin` | Enterprise/admin settings. | Partial. SSO/BYOK/SIEM/backup/compliance surfaces exist; taxonomy/template/admin ops missing. | DMS-UX-601 to 610 |
| `/admin/security` | Security/admin compatibility route. | Partial. Same admin/security route policy as `/admin`. | DMS-UX-401 to 404 |
| `/integrations` | Integration status parent. | Partial/hidden parent. Must avoid fake connected states. | DMS-UX-607, 610 |
| `/integrations/outlook` | Outlook filing/admin status. | Partial. Outlook foundations exist; unified DMS filing UX incomplete. | DMS-UX-606 |
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
| Document metadata update | `PATCH /documents/:documentId/metadata` | Exists. Profile editor missing. | DMS-UX-205 |
| Document download | `GET /documents/:documentId/download` | Exists. Controlled UI flow incomplete. | DMS-UX-203 |
| Document versions | add/list version endpoints | Exists. Version UI missing. | DMS-UX-206, 207 |
| Document list/browse | `GET /matters/:matterId/documents` through `document_search_index idx` and search permission scope | Exists for matter-scoped current document listing; broader global `/documents` browse remains deferred. | DMS-UX-104, 108 |
| Preview | Preview module exists in repo. | UI integration incomplete. | DMS-UX-202, 308 |
| Search title/body | `document_search_index` with `title_tsv` and `content_tsv` | Exists. Advanced scope/filter UX incomplete. | DMS-UX-301 to 314 |
| Records | Records APIs and route exist. | Strong backend; contextual UX incomplete. | DMS-UX-405, 505 |
| Audit | Audit query/export exists. | Strong backend; contextual timelines incomplete. | DMS-UX-406 |
| AI prep | Local Gemma file-organization prep status exists. | Approved narrow scope. Keep guarded. | DMS-UX-509 |
| Workflow/task inbox | No unified DMS task API identified. | Gap. | DMS-UX-501 to 507 |
| Notifications | No unified notification API identified. | Gap. | DMS-UX-506 |
| Taxonomy/templates | No DMS taxonomy/template admin API identified. | Gap. | DMS-UX-601 to 605 |
| Matter app lookup/sync | Matter app runtime endpoint not found in this checkout. | Gap/blocker for production-grade Matter Code picker. | DMS-UX-003, 004 |

## Immediate PR-A Decision

PR-A may implement dev/test UI against Vault's local matter projection only if the UI and docs keep this distinction explicit. Production activation of upload must remain blocked or explicitly scoped until the Matter app source-of-truth contract is implemented or an ADR approves the local projection as the Matter app mirror.

The safest PR-A order is:

1. Matter app contract and route/API inventory.
2. Matter picker component that can show `unconfigured`, `loading`, `empty`, `denied`, and `projection` states.
3. FormData upload helper.
4. Upload UI behind a readiness gate that requires a permitted matter and does not claim production Matter app integration unless configured.
5. Smoke guard that fails when production says upload is ready but Matter app lookup/picker/upload/list are not ready.
