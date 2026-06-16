# Outlook Add-in OA11 Verification Matrix

Status: OA11 technical-prepared. No live Microsoft 365 tenant deployment,
tenant admin consent, production rollout, or provider evidence is authorized by
this repository artifact.

Pack: PACK-OA-11

Primary artifact: `docs/release/outlook-addin-verification-matrix.md`.

## Purpose

Close the Outlook Add-in / Desktop integration plan by mapping every OA11
verification TUW to repo-local evidence. This matrix proves the Outlook add-in
surface remains server-gated, permission-scoped, audit-backed, tenant-isolated,
hash-only, rollback-ready, and blocked from live tenant deployment until the
external Microsoft 365 integration gate is approved.

## Verification Boundaries

- Repository evidence is limited to test names, file paths, command names, PR
  refs, release SHAs, bounded statuses, and non-secret evidence IDs.
- `EV-OUTLOOK-002` remains blocked until non-production manifest validation is
  approved outside the repository.
- `EV-OUTLOOK-003` remains blocked until tenant-admin Graph consent evidence is
  approved outside the repository.
- No tenant id, tenant domain, tenant-bound app/client id, consent URL,
  redirect URL, endpoint URL, mailbox address, filename, folder name, raw
  Outlook id, raw Graph payload, token, cookie, provider screenshot, customer
  document, or document body is recorded here.

## Gate Summary

| Gate | Required result | Repository evidence |
|---|---|---|
| Permission negative tests | 100% mapped | API unit tests, search-permission integration tests, cross-tenant RLS tests |
| Audit mandatory coverage | 100% mapped | `apps/api/src/modules/outlook/outlook-audit.events.ts`, migrations, unit tests |
| Unsafe metadata count | 0 | DTO rejection tests, web hash helper tests, RLS column-deny tests, release checkers |
| Cross-tenant leakage count | 0 | Outlook RLS integration tests and matter suggestion cross-tenant test |
| Duplicate filing count | 0 unhandled duplicates | manual filing, send-and-file, insertion, and auto-file dedupe paths |
| Local Vault cache count | 0 | Smart Alerts stateless runtime, no Web storage, no offline success claim |
| Graph scope drift count | 0 | approved scope registry and deployment checker |
| External link before policy count | 0 | insert-from-Vault internal-reference-only tests and R11 boundary |

## OA11 TUW Matrix

| TUW | Acceptance target | Evidence refs | Status |
|---|---|---|---|
| `OUTLOOK-VERIFY-TUW-001` | Permission negative matrix covers filing, suggestion, insert, status, folder mapping | API specs, `tests/integration/search-permission/outlook-matter-suggestions.spec.ts` | prepared |
| `OUTLOOK-VERIFY-TUW-002` | Audit coverage matrix covers success, denied, failed, retried, cancelled states | audit events helper, 0070-0074 migrations, API specs | prepared |
| `OUTLOOK-VERIFY-TUW-003` | Metadata leakage matrix covers logs, audit, UI, job status, denied responses | shared DTO specs, web hash specs, RLS column-deny specs | prepared |
| `OUTLOOK-VERIFY-TUW-004` | Tenant isolation matrix covers mailbox, matter, email, attachment, folder mapping | cross-tenant Outlook RLS specs | prepared |
| `OUTLOOK-VERIFY-TUW-005` | Idempotency and dedupe matrix covers retry, resend, forward, migration, duplicate attachments | manual filing, send-and-file, document insertion, auto-file tests | prepared |
| `OUTLOOK-VERIFY-TUW-006` | Graph scope and deployment evidence matrix is least-privilege and still externally blocked | Graph scope matrix, manifest tests, deployment checker | prepared |
| `OUTLOOK-VERIFY-TUW-007` | Offline and Smart Alert failure matrix proves no local filing success or Vault cache | Smart Alerts runtime tests, send-policy gate tests | prepared |
| `OUTLOOK-VERIFY-TUW-008` | Evidence register and gate report checklist is current and reference-only | `EV-OUTLOOK-001` through `EV-OUTLOOK-011`, this matrix, release checkers | prepared |

## Permission Negative Matrix

| Surface | Negative path | Evidence |
|---|---|---|
| Manual filing create | `OUTLOOK_ADDIN_ENABLED=false` denies before `PermissionService` | `apps/api/src/modules/outlook/outlook.service.spec.ts` |
| Manual filing create | `PermissionService.canUploadToMatter` deny blocks queueing | `apps/api/src/modules/outlook/outlook.service.spec.ts` |
| Filing status lookup | different user receives safe `PERMISSION_DENIED` without existence leak | `apps/api/src/modules/outlook/outlook.service.spec.ts` |
| Matter suggestions | wall-excluded matter is not suggested even with matching Outlook hashes | `tests/integration/search-permission/outlook-matter-suggestions.spec.ts` |
| Matter suggestions | attacker-supplied cross-tenant hashes do not expose matters | `tests/integration/search-permission/outlook-matter-suggestions.spec.ts` |
| Auth exchange | gate disabled, verifier unavailable, stale mailbox binding deny safely | `apps/api/src/modules/outlook/outlook-auth.service.spec.ts` |
| Graph attachment acquisition | gate disabled, stale add-in session, denied transport fail closed | `apps/api/src/modules/outlook/outlook-graph-attachment.service.spec.ts` |
| Smart Alert policy | policy gate disabled denies server policy evaluation | `apps/api/src/modules/outlook/outlook-send-file.service.spec.ts` |
| Send-and-file | policy closed, permission denied, unacknowledged warnings block filing | `apps/api/src/modules/outlook/outlook-send-file.service.spec.ts` |
| Insert from Vault | external recipient, attach-copy, permission deny, hold/disposal lock block | `apps/api/src/modules/outlook/outlook-document-insertion.service.spec.ts` |
| Folder mapping | gate disabled, unauthorized matter, non-admin approval, revoked mapping block | `apps/api/src/modules/outlook/outlook-folder-mapping.service.spec.ts` |

## Audit Coverage Matrix

| Action family | Required states | Evidence |
|---|---|---|
| Session exchange | exchanged, denied | `OUTLOOK_ADDIN_SESSION_EXCHANGED`, `OUTLOOK_ADDIN_SESSION_DENIED` |
| Manual filing | requested, denied, cancelled | `OUTLOOK_EMAIL_FILE_REQUESTED`, `OUTLOOK_EMAIL_FILE_DENIED`, `OUTLOOK_EMAIL_FILE_CANCELLED` |
| Filing lifecycle allow-list | completed, failed, attachment filed | 0070-0074 audit action allow-list migrations |
| Send policy | allow, warn, block | `OUTLOOK_SEND_POLICY_EVALUATED` |
| Send-and-file | requested, denied, duplicate | `OUTLOOK_SEND_FILE_REQUESTED`, `OUTLOOK_SEND_FILE_DENIED` |
| Graph acquisition | requested, acquired, denied | `OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_REQUESTED`, `OUTLOOK_GRAPH_ATTACHMENT_ACQUIRED`, `OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_DENIED` |
| Document insertion | ready/requested, denied, duplicate | `OUTLOOK_DOCUMENT_INSERT_REQUESTED`, `OUTLOOK_DOCUMENT_INSERT_DENIED` |
| Folder mapping | pending, active, revoked, denied | `OUTLOOK_FOLDER_MAPPING_CHANGED` |
| Auto-file | disabled, denied, retrying, queued | `OUTLOOK_AUTOFILE_JOB_RECORDED` |

All Outlook audit metadata is bounded to Vault refs, hashes, counts, statuses,
reason codes, and non-secret IDs. It must not contain document body, message
body, subject, raw address, filename, folder name, folder path, raw Outlook id,
raw Graph id, token, cookie, provider metadata, tenant id, or endpoint values.

## Metadata Leakage Matrix

| Layer | Leakage guard | Evidence |
|---|---|---|
| Shared DTOs | raw mailbox/message/subject/body/domain/filename/folder/Graph/token fields rejected | `packages/shared/src/outlook/outlook-types.spec.ts` |
| Web Office item capture | raw Office item data is transformed to hashes and not serialized | `apps/web/src/lib/outlook-addin/outlook-item.spec.ts` |
| Task pane UI | compact filing pane does not render raw Outlook message data | `apps/web/src/app/outlook-addin/outlook-addin-client.test.tsx` |
| Smart Alerts runtime | no Web storage, token variables, or local filing success persistence | `apps/web/src/app/outlook-addin/outlook-manifest.spec.ts` |
| DB schemas | Outlook tables omit raw token, payload, filename, folder, address columns | cross-tenant Outlook RLS specs |
| Release evidence | no concrete external URLs, tenant refs, or secrets | `pnpm outlook:deployment:check`, `pnpm outlook:verification:check` |

## Tenant Isolation Matrix

| Data family | Isolation evidence |
|---|---|
| filing requests and attachment refs | `tests/integration/cross-tenant/outlook-filing-requests-rls.spec.ts` |
| mailbox bindings, add-in sessions, Graph acquisition refs | `tests/integration/cross-tenant/outlook-auth-graph-rls.spec.ts` |
| document insertion refs | `tests/integration/cross-tenant/outlook-document-insertions-rls.spec.ts` |
| folder mappings and auto-file jobs | `tests/integration/cross-tenant/outlook-folder-mappings-rls.spec.ts` |
| matter suggestions | `tests/integration/search-permission/outlook-matter-suggestions.spec.ts` |

## Idempotency And Dedupe Matrix

| Flow | Dedupe key | Evidence |
|---|---|---|
| Manual filing | idempotency key, client request hash, message/matter/attachment set | duplicate manual filing request unit test |
| Send-and-file | idempotency key, client request hash, message/matter/attachment set | duplicate send-and-file request unit test |
| Document insertion | idempotency key, target message hash, document/version/mode | duplicate internal-reference insertion unit test |
| Folder mapping | idempotency key, mailbox/folder/matter/mode | folder mapping insert-or-find service path and RLS uniqueness |
| Auto-file | idempotency key and dedupe hash | disabled, wrong-matter, retry-count, and dedupe job service path |

## Graph Scope And Deployment Evidence Matrix

| Control | Required state | Evidence |
|---|---|---|
| Approved delegated Graph scope | `Mail.Read` only for selected attachment acquisition | `docs/release/outlook-addin-graph-scope-matrix.md` |
| Rejected broad scopes | `Mail.ReadWrite`, `Mail.Send`, `Files.Read.All`, `Sites.Read.All` rejected | shared DTO scope registry test and deployment checker |
| Token storage | server token storage prohibited | graph scope matrix and RLS column-deny tests |
| Admin consent | external reference pending, no concrete tenant values in repo | `EV-OUTLOOK-003` remains blocked |
| Manifest validation | non-production tenant validation pending | `EV-OUTLOOK-002` remains blocked |
| Rollout | Ring 0 through Ring 3 staged, disable/remove rehearsal required | deployment runbook |

## Offline And Smart Alert Failure Matrix

| Failure mode | Expected behavior | Evidence |
|---|---|---|
| Office item identifiers unavailable | fail closed with `OUTLOOK_ITEM_UNAVAILABLE` | web hash helper spec |
| folder mapping requested without folder ref | fail closed with `OUTLOOK_FOLDER_REF_UNAVAILABLE` | web hash helper spec |
| Smart Alert policy API unavailable or host failure | send may proceed without local filing success claim | Smart Alerts runtime and deployment runbook |
| Smart Alert policy gate disabled | server denies policy evaluation | send-file service spec |
| send gate disabled | server denies send-and-file queueing | send-file service spec |
| PWA/browser fallback | uses server-owned Vault controls and no Outlook-local Vault cache | deployment runbook |

## Evidence Register And Gate Checklist

- `EV-OUTLOOK-001`: planning prepared.
- `EV-OUTLOOK-002`: manifest validation blocked pending external tenant evidence.
- `EV-OUTLOOK-003`: Graph consent blocked pending tenant-admin evidence.
- `EV-OUTLOOK-004`: OA11 verification matrix prepared.
- `EV-OUTLOOK-005`: rollback prepared.
- `EV-OUTLOOK-006`: auth and Graph gate prepared.
- `EV-OUTLOOK-007`: Smart Alert send-file prepared.
- `EV-OUTLOOK-008`: insert from Vault prepared.
- `EV-OUTLOOK-009`: folder mapping prepared.
- `EV-OUTLOOK-010`: deployment readiness prepared.
- `EV-OUTLOOK-011`: OA11 closeout verification prepared.
- `EV-OUTLOOK-012`: operational gate implementation prepared.

Live Outlook production enablement remains blocked until `EV-OUTLOOK-002` and
`EV-OUTLOOK-003` are no longer blocked by external, reference-only evidence and
an operator explicitly approves rollout. OPS-OA-01 additionally requires
`pnpm outlook:operational:check` and `pnpm outlook:redaction:check` before any
production Outlook gate is enabled.

## Required Repo-Local Verification Commands

- `pnpm outlook:deployment:check`
- `pnpm outlook:verification:check`
- `pnpm outlook:redaction:check`
- `pnpm outlook:operational:check -- --target pr --mode advisory`
- `pnpm docs:frozen`
- `pnpm backlog:validate`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `docker compose -f infra/docker-compose.dev.yml up -d --wait`
- `pnpm db:migrate`
- `pnpm test:integration`
- `git diff --check`
- `git diff --name-only -- docs/package`
