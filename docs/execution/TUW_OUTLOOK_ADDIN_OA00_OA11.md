# Outlook Add-in / Desktop Integration OA00-OA11 TUW Contract

Status: planned extension after ADR-015 proposal.
Scope: AMIC Vault Outlook Web Add-in strategy, desktop boundary alignment, API
contracts, deployment planning, and verification evidence through OA11.

This document does not authorize live Microsoft 365, Graph, NAA, Smart Alert, or
production Outlook deployment behavior. It defines the gate-aware work breakdown
that must be satisfied before those behaviors can be implemented.

## 0. Pyramid

```text
L0 Product Outcome
  AMIC Vault behaves like an Outlook-native law-firm filing surface without
  weakening Vault permission, audit, tenant, records, AI, or external-sharing
  controls.

L1 Product Pillars
  A. Governance and gate split
  B. Email Vault server foundation
  C. M365/Outlook API contract
  D. Outlook add-in thin client
  E. Filing job and idempotency
  F. Send-and-file / Smart Alerts
  G. Insert from Vault
  H. Folder mapping / auto-file
  I. Admin deployment / rollback
  J. Verification and evidence

L2 PACKs
  OA00 governance
  OA01 server prerequisites
  OA02 API/DTO contracts
  OA03 data model contracts
  OA04 server filing API
  OA05 add-in MVP client
  OA06 auth and Graph gate
  OA07 send-and-file
  OA08 insert from Vault
  OA09 folder mapping / auto-file
  OA10 deployment
  OA11 verification / evidence

L3 TUWs
  Each OA pack below contains 3-8 TUWs with explicit gates and stop conditions.
```

## 1. Global Invariants

- `docs/package/**` remains read-only.
- Outlook is a thin Office.js client, not a desktop shell embed.
- Shared identity is allowed after a server-approved exchange; shared PWA
  session cookies are not.
- PermissionService remains the only authority for matter, document, email,
  insert, and folder mapping access.
- Search and matter suggestion results are built after query-stage permission
  scope injection. No client post-filtering is allowed.
- Audit is part of the action or job transition.
- No Outlook-local Vault cache, offline queue, document body store, prompt store,
  response store, or audit store.
- No public, guest, secure, VDR, or external links before the relevant R11+
  policy gates.
- No live Microsoft Graph, NAA, tenant admin consent, Smart Alert enforcement, or
  Outlook deployment before an explicit integration gate.
- No raw email body, subject, raw header, participant address, filename, private
  endpoint, provider metadata, account id, secret, token, cookie, or customer
  data in repo evidence.

## 2. Gate Split

| Work                           | Allowed Now | Implementation Gate                      |
| ------------------------------ | ----------: | ---------------------------------------- |
| ADR-015 and threat model delta |         yes | Human/operator acceptance before binding |
| API/DTO contracts              |         yes | OA02 review                              |
| Deployment runbook             |         yes | Tenant/admin approval before use         |
| Filing server implementation   |          no | R4 Email Vault + integration approval    |
| Matter suggestions             |          no | Search Gate remains intact + OA04        |
| Outlook add-in task pane shell |          no | OA05 live client approval                |
| NAA/Graph attachment read      |          no | OA06 integration gate                    |
| Smart Alerts send-and-file     |          no | OA07 integration gate                    |
| Insert from Vault              |          no | OA08 + R11/R13 policy gates              |
| Folder mapping/auto-file       |          no | OA09 admin/audit gate                    |
| Production rollout             |          no | OA10/OA11 evidence + tenant approval     |

## 3. PACK-OA00 Governance And Boundary

Branch: `codex/outlook-oa11-plan`

| TUW                        | Objective                                                                                                                      | Files                                                                             | Verification                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `OUTLOOK-ADR-TUW-001`      | Add ADR-015 with accepted target architecture and rejected desktop-embed path.                                                 | `docs/adr/ADR-015-outlook-addin-strategy.md`, `docs/adr/README.md`                | ADR names DEC/ADR traces and remains Proposed until human acceptance. |
| `OUTLOOK-THREAT-TUW-001`   | Add Outlook threat model delta covering session, mailbox, suggestion, filing, insert, Graph, folder mapping, and Smart Alerts. | `docs/security/outlook-addin-threat-model.md`                                     | Stop conditions and required tests are measurable.                    |
| `OUTLOOK-BOUNDARY-TUW-001` | Register OA00-OA11 execution contract without changing frozen package docs.                                                    | `docs/execution/TUW_OUTLOOK_ADDIN_OA00_OA11.md`, `docs/execution/PACKS_R4_R14.md` | `pnpm docs:frozen` green.                                             |
| `OUTLOOK-EVIDENCE-TUW-001` | Add reference-only evidence IDs for Outlook planning, contract, deployment, and verification.                                  | `docs/release/evidence-register.md`                                               | No private URLs, account ids, endpoints, or secrets in evidence rows. |

Stop conditions:

- Any attempt to add live Office.js code, Graph calls, Outlook manifest
  deployment, or production tenant instructions in OA00.
- Any `docs/package/**` modification.

## 4. PACK-OA01 Server Foundation Mapping

Status: mapping only. The underlying Email Vault work already belongs to R4
Email Vault and remains the prerequisite for live add-in filing.

| TUW                         | Objective                                                                                        | Existing Source                |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| `OUTLOOK-SERVERMAP-TUW-001` | Map Outlook filing to EmailMessage schema, raw immutable email storage, message duplicate block. | R4 `EMAIL-EMAIINGE-PARS-*`     |
| `OUTLOOK-SERVERMAP-TUW-002` | Map Outlook metadata normalization to header/participant/date/external participant handling.     | R4 `EMAIL-EMAIMETA-NORM-*`     |
| `OUTLOOK-SERVERMAP-TUW-003` | Map Outlook attachments to FileObject and Document version pipeline.                             | R4 `EMAIL-ATTAHAND-ATTALINK-*` |
| `OUTLOOK-SERVERMAP-TUW-004` | Map manual filing and timeline semantics to existing Email Vault filing service.                 | R4 `EMAIL-MATTFILI-FILIENGI-*` |
| `OUTLOOK-SERVERMAP-TUW-005` | Map DLP and wrong-matter warnings to Email Security hooks.                                       | R4 `EMAIL-EMAISECU-EMAIDLP-*`  |

Verification:

- This pack has no implementation until the live integration gate opens.
- Any future server implementation must prove R4/R5/R11/R13 gates remain intact.

## 5. PACK-OA02 API And DTO Contracts

| TUW                              | Objective                                                                                                               | Files                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `OUTLOOK-API-CONTRACT-TUW-001`   | Define `/v1/m365/outlook/filing-requests` create/status/cancel contract.                                                | `docs/integrations/outlook-addin-api-contract.md` |
| `OUTLOOK-API-CONTRACT-TUW-002`   | Define `OutlookItemRefDto`, `OutlookAttachmentRefDto`, safe status DTO, and denied response shape.                      | `docs/integrations/outlook-addin-api-contract.md` |
| `OUTLOOK-API-CONTRACT-TUW-003`   | Define `/v1/search/matter-suggestions` as a Search Gateway endpoint, not an M365 post-filter endpoint.                  | `docs/integrations/outlook-addin-api-contract.md` |
| `OUTLOOK-API-CONTRACT-TUW-004`   | Define send-and-file, document insertion, folder mapping, and deployment readiness contracts as gated future endpoints. | `docs/integrations/outlook-addin-api-contract.md` |
| `OUTLOOK-AUDIT-CONTRACT-TUW-001` | Define Outlook audit event catalog and metadata allow-list.                                                             | `docs/integrations/outlook-addin-api-contract.md` |

Verification:

- DTOs include no raw subject/body/header/filename/address fields.
- Contracts identify gate boundaries for endpoints that cannot be live now.
- Errors use only the nine standard AMIC error codes.

## 6. PACK-OA03 Data Model Contracts

Implementation started on branch `codex/outlook-oa03-oa04-skeleton`. Planned tables must be introduced only with
`tenant_id NOT NULL`, RLS, FORCE RLS, rollback, and permission tests.

| TUW                          | Objective                                                                                       | Gate |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | ---- |
| `OUTLOOK-MAILBOX-TUW-001`    | Define `outlook_mailboxes` reference model with mailbox fingerprint only.                       | OA06 |
| `OUTLOOK-FILINGREQ-TUW-001`  | Define `outlook_filing_requests` status machine and idempotency columns.                        | OA04 |
| `OUTLOOK-FILINGJOB-TUW-001`  | Define pg-boss job payload shape with refs/hashes only.                                         | OA04 |
| `OUTLOOK-IDEMP-TUW-001`      | Define unique constraints for tenant, user, mailbox, matter, message hash, and attachment hash. | OA04 |
| `OUTLOOK-AUDIT-META-TUW-001` | Define metadata normalizer additions for Outlook events.                                        | OA04 |

Current implementation notes:

- `outlook_filing_requests` and `outlook_filing_request_attachments` store only
  tenant-scoped refs, hashes, counts, status, and bounded MIME metadata.
- `OUTLOOK_ADDIN_ENABLED=false` by default keeps the API fail-closed until an
  explicit operator/integration gate opens live filing behavior.
- `outlook_mailboxes` and live mailbox-user binding remain deferred to OA06.
- No raw Graph id, mailbox address, subject, body, header, participant address,
  filename, attachment byte, local cache, Office.js client, or Microsoft 365
  call is introduced.

Stop conditions:

- Raw Graph ids, raw mailbox addresses, raw subjects, raw body, or filenames in
  tables.
- Table without tenant RLS.

## 7. PACK-OA04 Server Filing API

Partial server skeleton started after R4 Email Vault and search prerequisites
remained green. Live Graph/NAA acquisition, pg-boss filing worker execution, and
Office.js client deployment remain deferred behind their explicit gates.

| TUW                       | Objective                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `OUTLOOK-FILEAPI-TUW-001` | Implement create filing request endpoint with PermissionService and AuditService.              |
| `OUTLOOK-FILEAPI-TUW-002` | Implement safe status endpoint with same-user/tenant/matter authorization.                     |
| `OUTLOOK-FILEAPI-TUW-003` | Implement cancel/retry transition with audit and no raw data exposure.                         |
| `OUTLOOK-SUGGEST-TUW-001` | Implement matter suggestion endpoint through query-stage permission search.                    |
| `OUTLOOK-JOB-TUW-001`     | Implement filing worker job using existing Email Vault and Document pipelines.                 |
| `OUTLOOK-IDEMP-TUW-002`   | Implement idempotent duplicate handling for retry, resend, migrated messages, and attachments. |

Current implementation notes:

- Implemented `POST /v1/m365/outlook/filing-requests`,
  `GET /v1/m365/outlook/filing-requests/:id`, and
  `POST /v1/m365/outlook/filing-requests/:id/cancel`.
- Create path calls `PermissionService.canUploadToMatter` before creating a
  request when the gate is enabled.
- Status/cancel paths require same user plus current `canReadMatter`.
- Disabled gate and permission-denied paths record bounded Outlook audit events
  and return safe `PERMISSION_DENIED`.
- Implemented `POST /v1/search/matter-suggestions` through the existing Search
  Gateway. The endpoint accepts hash-only Outlook inputs, applies
  `SearchPermissionScopeProvider` to `document_search_index idx` before matter
  candidate construction, and records bounded
  `OUTLOOK_MATTER_SUGGESTIONS_VIEWED` audit metadata.
- Worker execution and Microsoft acquisition remain deferred.

Required tests:

- non-member matter filing denied,
- wall-excluded suggestion denied,
- cross-tenant mailbox/status denied,
- duplicate message returns existing safe status,
- audit insert failure rolls back state transition.

## 8. PACK-OA05 Add-in MVP Client

Implementation pack. The add-in remains a thin client.

| TUW                            | Objective                                                              |
| ------------------------------ | ---------------------------------------------------------------------- |
| `OUTLOOK-ADDIN-SHELL-TUW-001`  | Create Office.js add-in shell and manifest in a separate app surface.  |
| `OUTLOOK-ADDIN-ITEM-TUW-001`   | Show selected email metadata without subject/body raw logging.         |
| `OUTLOOK-ADDIN-MATTER-TUW-001` | Matter picker consumes server-filtered suggestions only.               |
| `OUTLOOK-ADDIN-FILE-TUW-001`   | Submit selected message/attachments to filing request endpoint.        |
| `OUTLOOK-ADDIN-STATUS-TUW-001` | Display safe queued/processing/completed/denied/failed statuses.       |
| `OUTLOOK-ADDIN-ERROR-TUW-001`  | Use safe denied/unavailable states without leaking resource existence. |

Implementation notes:

- Branch/worktree: `codex/outlook-addin-client` at
  `/Users/jws/Projects/amic-vault-outlook-oa05`.
- Client surface: `apps/web/src/app/outlook-addin/page.tsx`.
- Manifest surface: `apps/web/public/outlook-addin/manifest.xml`.
- Hash-only extraction utilities live under `apps/web/src/lib/outlook-addin/`.
- Matter suggestions are consumed only from `POST /v1/search/matter-suggestions`;
  the client does not locally filter unauthorized matter IDs.
- Filing requests are submitted only through
  `POST /v1/m365/outlook/filing-requests`; the client displays returned status
  and does not assume offline filing success.

Stop conditions:

- Client receives unauthorized matter IDs for local filtering.
- Client stores Vault records or document bytes in local storage.
- Client assumes offline filing succeeded.

## 9. PACK-OA06 Auth And Graph Gate

Implementation pack. This is the first pack that defines the live Microsoft 365
auth and Graph boundary, but repository defaults remain fail-closed until
Security/Ops provides tenant/admin consent evidence and a reviewed provider
implementation.

| TUW                            | Objective                                                                 |
| ------------------------------ | ------------------------------------------------------------------------- |
| `OUTLOOK-AUTH-TUW-001`         | Implement add-in session exchange with shared identity, separate session. |
| `OUTLOOK-AUTH-TUW-002`         | Enforce tenant/mailbox/user binding and fail-closed stale mappings.       |
| `OUTLOOK-GRAPH-SCOPE-TUW-001`  | Add least-privilege Graph scope registry and admin consent checklist.     |
| `OUTLOOK-GRAPH-ATTACH-TUW-001` | Implement approved attachment acquisition adapter.                        |
| `OUTLOOK-GRAPH-AUDIT-TUW-001`  | Record Graph acquisition refs/hashes/counts only.                         |

Required evidence:

- scope matrix,
- tenant admin consent external ref,
- no stored access token values,
- no raw Graph payload in repo evidence.

Implementation notes:

- Branch/worktree: `codex/outlook-auth-graph-gate` at
  `/Users/jws/Projects/amic-vault-outlook-oa06`.
- Added `/v1/m365/outlook/session-exchanges` for separate add-in session
  exchange. The current Vault session is only the authenticated request
  context; the add-in receives a separate add-in session id.
- Added `outlook_mailbox_bindings`, `outlook_addin_sessions`, and
  `outlook_graph_attachment_acquisitions` with `tenant_id NOT NULL`, RLS, FORCE
  RLS, rollback, and reference-only columns.
- Added an approved scope registry and scope matrix at
  `docs/release/outlook-addin-graph-scope-matrix.md`.
- `EV-OUTLOOK-003` remains blocked pending real tenant/admin consent. OA06 code
  gates remain default-off and the default identity verifier/Graph transport
  deny until a reviewed live provider is wired in.
- No access token, refresh token, raw identity assertion, raw Graph payload, raw
  mailbox address, tenant id, account id, raw Graph id, filename, or attachment
  byte is stored or committed as repo evidence.

## 10. PACK-OA07 Send-And-File / Smart Alerts

Future implementation pack.

| TUW                        | Objective                                                                    |
| -------------------------- | ---------------------------------------------------------------------------- |
| `OUTLOOK-SMART-TUW-001`    | Add Smart Alert event handler manifest only after approved client gate.      |
| `OUTLOOK-SMART-TUW-002`    | Fetch server policy decision: allow, warn, or block.                         |
| `OUTLOOK-SENDFILE-TUW-001` | Create send-and-file request with idempotency and audit.                     |
| `OUTLOOK-SENDFILE-TUW-002` | Implement offline/network fallback as pending/unavailable, not local filing. |
| `OUTLOOK-SENDFILE-TUW-003` | Add wrong-matter, no-matter, external-recipient warning paths.               |

Block only when server policy says the send must not proceed. Warn when the user
can still send but filing is recommended. Do not treat Smart Alerts as the only
compliance control.

## 11. PACK-OA08 Insert From Vault

Future implementation pack with R11/R13 dependencies.

| TUW                      | Objective                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `OUTLOOK-INSERT-TUW-001` | Search authorized documents for insertion with query-stage permission filters.                  |
| `OUTLOOK-INSERT-TUW-002` | Insert copy or internal reference only when policy permits.                                     |
| `OUTLOOK-INSERT-TUW-003` | Detect external recipients and deny public/guest/secure link creation before policy permits it. |
| `OUTLOOK-INSERT-TUW-004` | Audit document viewed/downloaded/inserted transitions with reference-only metadata.             |
| `OUTLOOK-INSERT-TUW-005` | Add legal hold/records policy checks before insertion.                                          |

Stop conditions:

- Any public, guest, secure, VDR, or external link before R11+ controls.
- Any insert path that bypasses document permission checks.

## 12. PACK-OA09 Folder Mapping / Auto-File

Future implementation pack. This is high-risk because folder names and mappings
can expose matter information.

| TUW                         | Objective                                                                    |
| --------------------------- | ---------------------------------------------------------------------------- |
| `OUTLOOK-FOLDERMAP-TUW-001` | Create tenant-scoped folder mapping model with hashed folder refs.           |
| `OUTLOOK-FOLDERMAP-TUW-002` | Add user/admin approval workflow and audit.                                  |
| `OUTLOOK-FOLDERMAP-TUW-003` | Implement mapping status UI without exposing unauthorized matter names.      |
| `OUTLOOK-AUTOFILE-TUW-001`  | Implement server-side scheduled or notification-based sync after Graph gate. |
| `OUTLOOK-AUTOFILE-TUW-002`  | Add auto-file dedupe, retry, and wrong-matter warning paths.                 |

Verification:

- mapping creation denied for unauthorized matter,
- folder ref is bounded/hash-only in audit,
- auto-file is disabled by default until tenant approval.

## 13. PACK-OA10 Deployment / Rollback

| TUW                      | Objective                                                               | Files                                              |
| ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------- |
| `OUTLOOK-DEPLOY-TUW-001` | Document Microsoft 365 Integrated Apps rollout rings and rollback.      | `docs/release/outlook-addin-deployment-runbook.md` |
| `OUTLOOK-DEPLOY-TUW-002` | Define manifest validation and admin consent evidence refs.             | `docs/release/outlook-addin-deployment-runbook.md` |
| `OUTLOOK-DEPLOY-TUW-003` | Define support escalation, disable, rollback, and browser/PWA fallback. | `docs/release/outlook-addin-deployment-runbook.md` |
| `OUTLOOK-DEPLOY-TUW-004` | Define production readiness checklist without live tenant values.       | `docs/release/outlook-addin-deployment-runbook.md` |

Verification:

- no tenant IDs, domains, endpoints, consent URLs, or screenshots with private
  metadata are committed;
- rollout is staged: IT/admin, pilot practice group, broader firm, production.

## 14. PACK-OA11 Verification / Evidence

| TUW                      | Objective                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `OUTLOOK-VERIFY-TUW-001` | Permission negative matrix for filing, suggestion, insert, status, folder mapping.          |
| `OUTLOOK-VERIFY-TUW-002` | Audit coverage matrix for success, denied, failed, retried, cancelled.                      |
| `OUTLOOK-VERIFY-TUW-003` | Metadata leakage matrix for logs, audit, UI, job status, denied responses.                  |
| `OUTLOOK-VERIFY-TUW-004` | Tenant isolation matrix for mailbox, matter, email, attachment, folder mapping.             |
| `OUTLOOK-VERIFY-TUW-005` | Idempotency and dedupe matrix for retry, resend, forward, migration, duplicate attachments. |
| `OUTLOOK-VERIFY-TUW-006` | Graph scope and deployment evidence matrix.                                                 |
| `OUTLOOK-VERIFY-TUW-007` | Offline and Smart Alert failure matrix.                                                     |
| `OUTLOOK-VERIFY-TUW-008` | Evidence register and gate report checklist.                                                |

Minimum acceptance for live implementation:

- permission negative tests pass 100%,
- audit mandatory action coverage 100%,
- unsafe audit/log/repo metadata count 0,
- cross-tenant leakage count 0,
- duplicate filing count 0,
- local Vault cache count 0,
- Graph scope drift count 0,
- external link before policy count 0.

## 15. Closeout For This Planning Pack

This planning pack is complete when:

- ADR-015 exists and is listed in ADR README as Proposed,
- Outlook threat model delta exists,
- API contract exists,
- deployment runbook exists,
- OA00-OA11 execution contract exists,
- evidence register has reference-only Outlook planning refs,
- `docs/package/**` remains unchanged,
- docs/backlog/diff validation passes.
