# DMS OSS Workbench Action Matrix

> `PACK-DMS-WB-00` action/permission/audit reference.
> All denied states use safe copy and must not disclose document or Matter existence.

| UI action | current owner | permission/audit boundary | workbench rule | negative evidence |
|---|---|---|---|---|
| list documents | document/search list API | `PermissionService` query-stage scope | never client-filter or fabricate zero | document/search permission suites |
| select row | browser state only | no audit or fetch | list DTO only; clear stale state | selection test proves API count 0 |
| filter/sort/page | existing list/search API | existing query validation | URL is state, not a policy bypass | malformed filter and leakage tests |
| open detail | canonical document route | `PermissionService` read guard + audit | pass safe ref/context only | safe denied/document permission |
| open preview | preview session API | session issue + preview audit | explicit action; never place token in URL | preview session/token/audit tests |
| use search anchor | existing DMS-GA-3B route contract | validated opaque anchor | preserve; invalid value falls back | search metadata leakage |
| upload | upload panel/API | Matter upload permission + audit | keep selected Matter context | upload permission/bulk upload |
| status transition | existing document API | existing edit permission + audit | do not add a second state machine | lifecycle/audit tests |
| document editing/review | action center | existing editing service + audit | detail-route link only | editing lifecycle |
| share | sharing route | external policy/audit | no generic list/inspector shortcut | external policy regression |
| disposal | records route | records service/hold/approval/audit | no direct delete action | records governance |
| break-glass | break-glass API | two-approver/revoke/audit | no fake self-service state | break-glass tests |
| 즐겨찾기 add/remove/reorder | `SavedItemService` | existing document search scope, Matter permission query, personal saved-search owner check + transactional audit | personal only; server labels/routes only; optimistic failure restores target state | saved-item service and canonical integration tests |
| batch folder/tag/status mutation | `DocumentBulkActionBatchService` and existing single-document services | creation injects the existing search scope; every worker attempt re-enters the edit/Matter permission and audit transaction; batch create/complete/retry audit is transactional | current page only; max 100 unique IDs; explicit partial receipt; failed-only retry; no delete/share/Office action | shared/API/web tests and canonical `document-bulk-actions.spec.ts` cover bounds, replay conflict, invisible/missing parity, cross-tenant rejection, partial result, retry, and audit counts |

## Required UI-safe data

- Safe display data may include the existing response's display title, Matter label/code, status, type, tag/folder labels, timestamps, redacted snippet, and approved bounded count.
- Forbidden in primary labels, URL state, analytics, or new audit metadata: raw UUIDs, raw query/snippet/body, preview token/session, object key/path, hashes, deny reason, wall membership, or external credential.

## Contract decisions remaining

| decision | smallest allowed initial scope | stop condition |
|---|---|---|
| 즐겨찾기 | ADR-019 closes personal document/Matter/personal-saved-search scope | team-shared or administrator-curated visibility requires a new contract |
| batch mutations | ADR-020 closes current-page folder/tag/status actions with explicit per-item receipt and failed-only retry | all-result selection, direct delete/share/Office action, cached permission, or silent partial failure requires a new contract |
| offline | explicit no-document-cache policy guard | client document caching, token persistence, or missing logout/tenant-switch proof |
