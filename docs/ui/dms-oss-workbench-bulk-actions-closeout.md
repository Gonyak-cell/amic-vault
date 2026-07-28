# DMS OSS Workbench Bulk Actions Closeout

Pack: `PACK-DMS-WB-04`
TUWs: `DMS-WB-BULK-TUW-001~005`
Decision: `docs/adr/ADR-020-document-bulk-actions.md`
Base: `origin/main@5dbf977d04693b587bd8dcfb19a7baf47474626f`

## Contract Receipt

| Layer           | Evidence                                                                  | Closed behavior                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| persistence     | `db/migrations/0211_create_document_bulk_actions.sql`                     | tenant-scoped batch/item receipts, RLS/FORCE RLS, 1..100 bounds, exact action parameters, 30-day reference-only retention, append-only batch audit actions |
| shared contract | `packages/shared/src/dto/document/bulk-action.dto.ts`                     | four allowed actions, 100 unique document IDs, caller UUID idempotency, failed-item retry input, bounded queue payload                                     |
| batch API       | `DocumentBulkActionBatchService` and controller                           | exact ordered-request SHA-256, same-key replay, changed-input rejection, permission-scoped materialization before enqueue, actor-owned read/retry           |
| execution       | queue/job/executor plus existing folder, metadata, and lifecycle services | each attempt re-enters current permission, Ethical Wall, legal-hold, immutable-state, domain transition, and mutation-audit boundaries                     |
| UI              | `/files` current-page checkboxes and `DocumentBulkActions`                | explicit count and confirmation, progress, persistent success/failure receipt, safe denied copy, failed-only retry, selection reset on list-context change |

## Automated Evidence

- Shared DTO: 3 tests for 1/100 acceptance, 0/101/duplicate rejection, and the
  exact allowed action set.
- API: 7 focused tests across request hashing/bounds, existing-service
  delegation, queue configuration, per-item result recording, and receipt-write
  failure behavior.
- Web: 12 focused tests across page-only selection/reset, common transition
  targets, confirmation, progress, partial receipt, failed-only retry, and
  same-Matter folder behavior.
- Canonical integration:
  `tests/integration/document-access/document-bulk-actions.spec.ts`, 4 tests
  covering successful mutation, concurrent and sequential exact idempotency
  replay, changed replay rejection, one allowed plus one denied partial result,
  failed-only retry, create/complete/retry audit counts, invisible/nonexistent
  safe-denial parity, cross-tenant fail-closed behavior, legal hold, and
  cross-Matter folder rejection.
- Whole integration regression on a disposable isolated database: 133 of 137
  files passed completely. The four remaining local-container evidence files
  were outside WB04: two ingestion compose suites timed out with Docker storage
  at 99%, and two scanner suites received the existing ClamAV
  `malformed_response` fail-closed result. No assertion was skipped or weakened;
  the disposable database was removed.
- Migration verification: 0211 UP succeeded on the local development database.
  An isolated disposable database applied the actual 0211 UP, proved RLS and
  FORCE RLS plus tenant policies, applied the actual DOWN, proved both tables
  and new audit actions absent, and was removed.
- AI-slop review: the changed product UI has no finding. A post-ledger run has
  33 repository matches: 26 weak source-provenance URL matches and seven
  immutable ledger matches, including one strong historical wording match.
  They are evidence metadata or historical records, not rendered UI or copy.

## Authenticated Rendered Evidence

An authenticated local session verified the real `/files` workbench:

1. The current-page checkbox selected the seven authorized rows visible on the
   page and exposed an exact `현재 페이지 7건 선택` action bar.
2. The confirmation dialog named the bounded action and exact count; cancel,
   Escape, and focus restoration use the existing keyboard contract.
3. A tag request produced an honest partial receipt: two successes and five
   safe `PERMISSION_DENIED` failures.
4. The receipt stayed visible through the list refresh and displayed only safe
   document labels plus `접근 권한을 확인할 수 없습니다.`
5. `실패 항목 재시도` requeued only the five failed rows. The two successes were
   not replayed, and the receipt remained two successes/five failures.
6. The latest batch had one create audit, two terminal-completion audits, and
   one retry audit; every failed item had retry count one.
7. The stacked action controls and receipt remained visible inside the
   rail/list/inspector workbench without being covered by the inspector.

No selection or bulk action issued preview/download requests. No DLP
bulk-download receipt was used as mutation evidence. No external connection,
customer data, deployment, release, or go-live operation was used.

## Rollback

Before bulk-action audit rows exist, migration 0211 can roll back normally.
After any batch audit row exists, append-only audit immutability intentionally
prevents removal of the new audit action values. Runtime rollback is then to
hide/disable the action bar, routes, and worker while retaining batch receipts
and audit history; do not delete audit rows or rewrite successful item results.
