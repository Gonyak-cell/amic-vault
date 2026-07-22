# PACK-OSS04-02 — Promotion, reconciliation, and malware gate

Status: canonical under `USER-UMBRELLA-AUTONOMY-20260721`, based on merged
`PACK-OSS04-01` at `origin/main` `23c7e6aefa23bafd3ca08761f32c1a880dc3f3a6`.

## Invariants

- A scanner verdict is input only. Only Vault validates a tenant-scoped scan
  record, fresh signature, expected hash and server-derived storage identity.
- Unpromoted, unknown, stale, mismatched, infected and error objects are
  fail-closed: no primary byte, document/version/file-object claim, preview,
  extraction, search hit, AI input, or delivery is exposed.
- Promotion never overwrites an original. Its DB state, bounded audit and
  immutable primary object are one recovery-aware operation; partial outcomes
  stay closed and become reconciliation evidence, not success.
- Reconciliation/retry requires explicit authorized reason and transactional
  audit. Infected/error/security-hold release or delete is never automatic;
  raw malware labels, filenames, content, keys and credentials are prohibited.
- No dependency, public scanner port, scanner mount/credential, deployment,
  external operation, source vendoring, or `docs/package/**` change is in scope.

## Ordered TUWs

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS04-PRM-TUW-001` | C | QRT-004 | promote only verified clean quarantine bytes and atomically materialize Vault records |
| 2 | `DEVOPS-OSS04-PRM-TUW-002` | C | PRM-001 | require a common promoted-state assertion across read/search/AI/delivery surfaces |
| 3 | `DEVOPS-OSS04-PRM-TUW-003` | C | PRM-002 | classify orphans and expose only admin/audited review/retry |
| 4 | `DEVOPS-OSS04-PRM-TUW-004` | C | PRM-001~003 | prove clean/EICAR/fault/ingress/surface invariants in disposable integration |

## `DEVOPS-OSS04-PRM-TUW-001` — clean promotion and finalization

- **Files create:** `db/migrations/0204_create_file_security_promotion_inputs.sql`, `apps/api/src/modules/file-security/file-promotion.service.ts` and their direct specs.
- **Files modify:** `quarantine-intake.service.ts` and its direct spec only to atomically retain the already-validated, bounded document/file metadata required for later finalization; direct storage adapter/service only for server-derived copy/readback; direct document upload-finalization helper; file-security module; direct audit action/types; direct integration tests.
- **Files NOT-modify:** original overwrite, infected/error release, audit success after failure, scanner authority, dependencies/locks, `docs/package/**`.
- **Metadata contract:** the new tenant-RLS/FORCE append-only `file_security_promotion_inputs` row is created in the same intake/audit transaction as its scan row. It retains only the normalized/original filename, sniffed MIME type, allowed source system, uploader, and schema-validated document/version/folder/tag/duplicate/preflight fields required to reproduce the accepted upload intent. It never holds content, storage key/credential, malware label/signature text, or audit metadata; it is not selected by the scanner worker. Existing scan rows without this receipt are fail-closed and become reconciliation evidence rather than guessed promotions.
- **Implementation:** lock scan plus promotion-input rows; recheck clean result, signature freshness, expected hash, original upload permission/preflight and any legal hold; copy quarantine bytes to a server-derived immutable primary identity; HEAD/hash verify; atomically create document/version/file object, mark scan promoted, and record bounded upload/promotion audit. A DB rollback keeps the surface closed and records an orphan for later review.
- **Verification (AND):** promotion-input RLS/append-only/constraint negatives; clean success; missing/invalid input, stale/infected/error/hash mismatch denial; duplicate promotion x10; copy failure; DB/audit rollback; primary hash equality.
- **Stop:** server-side copy/readback equality or idempotent finalization cannot be proven.

## `DEVOPS-OSS04-PRM-TUW-002` — shared promoted guard

- **Files create:** `apps/api/src/modules/file-security/promoted-file.guard.ts` and direct spec.
- **Files modify:** confirmed document-download, preview, extraction, search, AI and delivery call sites and their direct integration tests only.
- **Files NOT-modify:** PermissionService replacement, post-search filtering, default allow, dependencies/locks, `docs/package/**`.
- **Implementation:** permission and promoted-state assertions are both needed; either error gives safe denial. Search/AI exclude before index/retrieval. A surface inventory check finds raw storage read paths that bypass the guard.
- **Verification (AND):** each positive promoted and negative unknown, quarantined, scanning, infected, error, stale, cross-tenant and permission case; no title/snippet/metadata leakage; denied audit where applicable.
- **Stop:** any legacy object requires default allow without a distinct backfill/cutover TUW.

## `DEVOPS-OSS04-PRM-TUW-003` — orphan reconciler and review

- **Files create:** `apps/api/src/modules/file-security/file-security-reconciler.service.ts` with spec; optional bounded admin review endpoint only if required.
- **Files modify:** file-security module, queue schedule and bounded health/metrics, plus direct tests.
- **Files NOT-modify:** automatic infected release/delete, hard deletion of held content, raw malware/filename display, dependencies/locks, `docs/package/**`.
- **Implementation:** classify quarantine object without row, row without object, clean without promotion, primary orphan, and stale signature. Retry and review need permission, reason and audit; automatic actions are non-destructive only.
- **Verification (AND):** every orphan class, duplicate reconciliation, non-admin/cross-tenant, legal hold, audit failure, unavailable scanner and stale-signature readiness negatives.
- **Stop:** resolving an orphan requires content/filename logging or unapproved release/delete.

## `DEVOPS-OSS04-PRM-TUW-004` — real fault and cutover gate

- **Files create:** focused storage-isolation, document-access, search-permission and audit-coverage file-security integration specs.
- **Files modify:** compose readiness and direct upload/extraction/search tests only for pending-to-promoted handshake/cutover evidence.
- **Files NOT-modify:** public scanner port, non-test EICAR, flaky skips, dependencies/locks, `docs/package/**`.
- **Implementation:** inject clean/EICAR/unavailable/timeout/stale/hash mismatch/cross-tenant/duplicate/audit-failure cases and assert all ingress/surfaces expose zero bytes/search/AI/delivery before promotion.
- **Verification (AND):** focused specs; document/storage/search/metadata/audit/cross-tenant suites; worker pytest; common validation and exact-head evidence.
- **Stop:** any scanner error promotes or any ingress/surface bypass exists.

## Evidence boundary

Store only synthetic, bounded promotion-hash/audit, surface guard, orphan, signature-freshness and EICAR/clean evidence under `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS04-02/<tuw>/`. A local pass does not claim CI, merge, deployment, release or go-live.
