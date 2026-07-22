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

- **Files create:** none when the existing `RecordsDisposalWorker` already
  supplies the required tenant iteration, stale-claim recovery, exact-version
  inspection, and missing-receipt reconciliation; otherwise
  `records-disposal-reconciler.service.ts` and direct spec.
- **Files modify:** the existing worker only when its reconciliation invariant
  is incomplete; `records.controller.ts` and shared DTO only when needed for a
  read-only review or explicit retry endpoint; direct Records integration
  tests.
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

### RCN-001 scope amendment — audited terminal retry authority

The pre-existing sealed outbox transition intentionally makes `dead_letter`
and `blocked` terminal. An explicit operator retry therefore needs a narrowly
scoped migration: an append-only tenant-RLS retry-authorization record with a
bounded reason, terminal state/code snapshot, actor and audit reference, plus
a trigger that permits terminal-to-pending only when a fresh authorization is
present. This amendment permits that migration, its audit-action declaration,
its single L0 no-copy path declaration, and direct migration/service specs. It
does not permit automatic retry, receipt or inventory mutation, raw storage
data, a dependency, external operation, deployment, or `docs/package/**`
change.

### RCN-001 reuse determination — no duplicate reconciler

`RecordsDisposalWorker` already iterates configured tenants, atomically recovers
only stale `processing` claims, inspects the sealed exact version, treats an
exactly absent version as `already_absent`, and persists immutable receipts.
RCN-001 therefore reuses that L0 reconciler and adds only the missing audited
terminal retry authority; a parallel reconciler would duplicate the same queue
and state-transition authority.

## `DEVOPS-OSS03-RCN-TUW-002` — finalization, tombstone, and certificate

- **Files create:** `records-disposal-finalizer.service.ts` and direct spec
  only if the existing Records service cannot preserve one transaction.
- **Files modify:** `records.service.ts`, its direct spec, `records.module.ts`,
  and shared Records DTO/types only for bounded final status/certificate data.
- **Files NOT-modify:** audit rows, sealed inventory/receipts, retention-law
  historical metadata, key-only delete, dependencies/locks, `docs/package/**`.
- **Implementation:** verify the complete receipt set and canonical hashes;
  recheck approval/hold immediately before update; transition allowed DB state
  to the `disposal_requests.executed` tombstone/final status; insert one
  certificate with the sealed inventory hash and deterministic receipt-result
  hash bound into its certificate hash; record audit; commit atomically. The
  Document row remains historical metadata and is neither physically deleted
  nor status-mutated in this TUW. Define the audit-ID/hash ordering explicitly
  and make duplicate finalization return the same certificate without a second
  state transition.
- **Verification (AND):** incomplete/blocked receipt deny, hold-race deny,
  audit rollback, duplicate finalization x10, and exact certificate
  recalculation.
- **Stop:** certificate/audit/DB state cannot be one transaction, or active
  historical metadata must be unprovenly removed.

## `DEVOPS-OSS03-RCN-TUW-003` — real storage disposal fault gate

- **Files create:** none when the existing direct worker/service fault suites
  and `tests/integration/records-governance.spec.ts` together cover the fault,
  real versioned-storage, audit and RLS assertions; otherwise the three named
  focused suites below.
- **Files modify:** `apps/api/src/modules/records/records-disposal.worker.spec.ts`,
  `records.service.spec.ts`, `tests/integration/records-governance.spec.ts`,
  and direct helpers only.
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

### RCN-003 reuse determination — one real fixture plus existing fault matrix

The direct `RecordsDisposalWorker` suite already injects exact absence,
Object Lock, partial receipt then timeout, hold-after-approval, 403, timeout,
unavailable, and repeated worker execution. The direct Records service suite
already covers incomplete-receipt denial and audit-failure retry rollback.
`records-governance.spec.ts` supplies the non-substitutable real, disposable
versioned-storage path: approval, exact worker deletion, receipt completion,
certificate/idempotency, audit redaction, tenant RLS, and no destructive
runtime-table privilege. Creating parallel suites would replicate fixtures
without adding a distinct trust-boundary assertion.

## Evidence boundary

Store exact source SHA/tree, sealed inventory/result hashes, reconciliation
matrix, retry authorization/audit results, fault matrix, object-inventory
receipt, and certificate recalculation under
`artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS03-02/<tuw>/`. A local pass
does not claim CI, merge, deployment, release, or go-live.
