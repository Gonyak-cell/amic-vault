# PACK-OSS03-02 — Reconcile, certificate, and real-storage fault gate

Status: canonical under `USER-UMBRELLA-AUTONOMY-20260721`, based on merged
`PACK-OSS03-01` at `origin/main` `23c7e6aefa23bafd3ca08761f32c1a880dc3f3a6`.

## Invariants

- Only the sealed inventory's opaque exact-version identity can be reconciled,
  deleted, or certified. Key-only delete and guessed object identity are
  prohibited.
- A missing object has either a bounded receipt/recovery record or no DB state
  can claim it is active. A `DISPOSED` record requires all exact-version
  receipt proofs, a recomputable certificate, and audit evidence.
- Permission, dual approval, legal/active hold, AuditService transaction,
  tenant RLS, immutable inventory/receipts, and append-only audit remain
  authoritative. Raw storage keys, errors, bodies, titles, filenames, and
  source content must never enter DB/audit/log output.
- Dead-letter retry is explicit, admin-authorized, reason-coded, and audited;
  it is never automatic. No dependency, bucket policy, production object,
  deployment, source vendoring, external operation, or `docs/package/**`
  modification is in scope.

## Ordered TUWs

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS03-RCN-TUW-001` | C | DSP-004 | reconcile stale/missing receipt state and expose only operator-gated review/retry |
| 2 | `DEVOPS-OSS03-RCN-TUW-002` | C | RCN-001 | atomically tombstone/certify only fully proven disposal |
| 3 | `DEVOPS-OSS03-RCN-TUW-003` | C | RCN-001, RCN-002 | prove the end-to-end fault invariant against disposable versioned storage |

## `DEVOPS-OSS03-RCN-TUW-001` — crash reconciler and dead-letter review

- **Files create:** `apps/api/src/modules/records/records-disposal-reconciler.service.ts`
  and direct spec.
- **Files modify:** `records.module.ts`; `records.controller.ts` and shared
  DTO only when needed for a read-only review or explicit retry endpoint;
  direct Records integration tests.
- **Files NOT-modify:** sealed inventory/receipt mutability rules, automatic
  dead-letter retry, hardcoded tenant scans, legacy key-only delete,
  dependencies/locks, `docs/package/**`.
- **Implementation:** iterate configured tenants; recover stale claims; for each
  sealed inventory entry without a receipt, inspect only the exact opaque
  version and record `deleted`/`already_absent`, retryable, or bounded blocked
  state. Review exposes only reason code, attempt count, and inventory hash.
  A retry reclaims one outbox only after authorization, explicit reason, and
  transaction-coupled audit.
- **Verification (AND):** crash-before/partial/all-receipt permutations,
  stale claim, repeated reconciliation, cross-tenant/admin negative, raw-error
  negative, and audit-failure rollback of retry authorization.
- **Stop:** reconciliation requires guessed object identity, stores raw error
  or content, or needs automatic retry to make progress.

## `DEVOPS-OSS03-RCN-TUW-002` — finalization, tombstone, and certificate

- **Files create:** `records-disposal-finalizer.service.ts` and direct spec
  only if the existing Records service cannot preserve one transaction.
- **Files modify:** `records.service.ts`, its direct spec, `records.module.ts`,
  and shared Records DTO/types only for bounded final status/certificate data.
- **Files NOT-modify:** audit rows, sealed inventory/receipts, retention-law
  historical metadata, key-only delete, dependencies/locks, `docs/package/**`.
- **Implementation:** verify the complete receipt set and canonical hashes;
  recheck approval/hold immediately before update; transition allowed DB state
  to the tombstone/final status; insert one certificate with inventory/result
  hash and approval/audit references; record audit; commit atomically. Define
  the audit-ID/hash ordering explicitly and make duplicate finalization return
  the same certificate without a second state transition.
- **Verification (AND):** incomplete/blocked receipt deny, hold-race deny,
  audit rollback, duplicate finalization x10, and exact certificate
  recalculation.
- **Stop:** certificate/audit/DB state cannot be one transaction, or active
  historical metadata must be unprovenly removed.

## `DEVOPS-OSS03-RCN-TUW-003` — real storage disposal fault gate

- **Files create:** `tests/integration/legal-hold/records-disposal-faults.spec.ts`,
  `tests/integration/storage-isolation/disposal-object-versions.spec.ts`, and
  `tests/integration/audit-coverage/disposal-saga-audit.spec.ts`.
- **Files modify:** `tests/integration/records-governance.spec.ts` and direct
  helpers only.
- **Files NOT-modify:** a new integration top-level suite, flaky skips, real
  customer objects, dependencies/locks, `docs/package/**`.
- **Implementation:** use a disposable Nest/Postgres/versioned MinIO fixture to
  inject before-first, partial, all-delete-before-receipt, finalization
  rollback, duplicate, lock timeout, newly applied hold, 404/403/timeout/5xx,
  and audit failure. Assert object-version inventory and DB invariants after
  every step.
- **Verification (AND):** focused fault specs; legal-hold, storage-isolation,
  audit-coverage, cross-tenant, and records-governance suites; common PACK
  validation; exact-head evidence artifacts.
- **Stop:** real versioned-storage failure injection is unavailable; unit-only
  proof cannot pass this Gate.

## Evidence boundary

Store exact source SHA/tree, sealed inventory/result hashes, reconciliation
matrix, retry authorization/audit results, fault matrix, object-inventory
receipt, and certificate recalculation under
`artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS03-02/<tuw>/`. A local pass
does not claim CI, merge, deployment, release, or go-live.
