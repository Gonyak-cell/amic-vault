# PACK-OSS03-01 — Sealed disposal inventory and saga

Status: canonical post-R14 extension under `USER-UMBRELLA-AUTONOMY-20260721`.
This is the canonical form of `PROPOSED-PACK-OSS03-01`, independently based on
`origin/main` `95580b5ca5a32b31b5d2dd14ea34a03633f88f98`.

## Scope and invariants

- No irreversible disposal proceeds unless the configured storage proves exact
  object-version inventory, delete, and HEAD/readback on a disposable bucket.
  An absent/ambiguous capability blocks the entire PACK; unversioned `delete`
  is never a disposal fallback.
- Permission, dual approval, legal/active hold checks, immutable originals,
  audit append-only behavior, and tenant RLS remain authoritative. The worker
  may record object receipts but cannot finalize a DB disposal certificate.
- A disposal target set is canonically sorted and sealed before work begins.
  Certificates/audits contain only bounded identifiers, hashes, status/reason
  codes and timestamps: no raw storage key, object body, filename, or raw S3
  error is permitted.
- All source is L0 Vault-owned no-copy work. No upstream source/fixture copy,
  dependency, bucket policy, production object, deployment, or external
  mutation is authorized.

## TUW order

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS03-DSP-TUW-001` | C | QUE-004 | prove/reject exact-version storage capability |
| 2 | `DEVOPS-OSS03-DSP-TUW-002` | C | DSP-001 pass | add sealed inventory, outbox, and receipt schema |
| 3 | `DEVOPS-OSS03-DSP-TUW-003` | C | DSP-002 | atomically seal inventory/outbox/audit at approval |
| 4 | `DEVOPS-OSS03-DSP-TUW-004` | C | DSP-003 | claim, recheck, exact-delete, and receipt worker |

## `DEVOPS-OSS03-DSP-TUW-001`

- **Files create:** `apps/api/src/modules/storage/versioned-storage-capability.ts`
  and spec; `tools/storage/probe-versioned-disposal.mjs` and spec.
- **Files modify:** `storage-adapter.interface.ts`, `s3-storage.adapter.ts`,
  their direct specs, and `security/oss-adoption-decisions.yml` only for new
  L0 no-copy paths.
- **Files NOT-modify:** `records.service.ts`, disposal state, bucket policy,
  production object/data, dependencies/locks, `docs/package/**`.
- **Implementation:** introduce opaque object-version values and explicit
  list/head/delete-version operations or an explicit unsupported result. A
  caller cannot construct an object version. Mark legacy `delete(key)` as
  ineligible for Records disposal. Probe only a disposable synthetic bucket:
  versioning disabled, null version, delete marker, wrong version, cross-tenant
  key, `403`, `404`, timeout, and ambiguous `5xx` all fail closed.
- **Verification (AND):** adapter/spec tests; disposable probe transcript
  without credential/key values; existing storage isolation tests; source-map,
  reuse-first, backlog, frozen-doc and diff checks.
- **Stop:** exact inventory/delete/readback cannot be shown, capability is
  ambiguous, or a production-like versioning/Object-Lock profile is absent.

## `DEVOPS-OSS03-DSP-TUW-002`

- **Files create:** next verified migration
  `db/migrations/<next>_create_records_disposal_outbox.sql`,
  `apps/api/src/modules/records/disposal-receipt.types.ts`, and its spec.
- **Files modify:** shared bounded Records/audit action types/specs only if a
  new action is required by this schema; L0 decisions for new product paths.
- **Files NOT-modify:** existing disposal approval rows, audit mutability,
  legal-hold tables, storage policy, dependencies/locks, `docs/package/**`.
- **Implementation:** add tenant FORCE-RLS tables for pending/processing/
  completed/dead-letter/blocked outbox state, immutable sealed inventory and
  append-like per-object receipt. Inventory holds only tenant/document/version/
  file-object identifiers, storage-key hash, opaque version and SHA-256; raw
  keys/errors/content/names are prohibited. Enforce transitions, canonical
  inventory hash and deterministic receipt identity with least grants and a
  reversible migration.
- **Verification (AND):** migration up/down/up, RLS/cross-tenant, invalid
  transition, inventory/receipt mutation, raw-field and audit-immutability
  negatives.
- **Stop:** complete inventory cannot seal, rollback silently destroys required
  evidence, or a forward-only/disposal-policy decision is required.

## `DEVOPS-OSS03-DSP-TUW-003`

- **Files create:** `records-disposal-inventory.service.ts` and spec only if
  the existing service cannot host the bounded inventory operation.
- **Files modify:** `records.service.ts`, direct spec, `records.module.ts`,
  and shared response DTO only for a bounded pending-execution reference.
- **Files NOT-modify:** storage adapter delete call, PermissionService,
  approval rules, legal-hold semantics, dependencies/locks, `docs/package/**`.
- **Implementation:** after existing permission/approval/hold checks, take one
  repeatable tenant transaction snapshot, resolve originals/current versions and
  preview derivatives, canonical-sort, hash, insert inventory/outbox and audit
  atomically. Return same pending reference for retries. Delete calls are zero.
- **Verification (AND):** complete inventory/hash/idempotency; non-admin,
  non-member, hold and concurrent-approval negatives; audit fault leaves no
  inventory/outbox/status change; storage-delete spy remains zero.
- **Stop:** snapshot/audit cannot be atomic or current code deletes before seal.

## `DEVOPS-OSS03-DSP-TUW-004`

- **Files create:** `apps/api/src/modules/records/records-disposal.worker.ts`
  and spec.
- **Files modify:** `records.module.ts`, Queue registry only for scheduling
  trigger, and direct Records integration tests.
- **Files NOT-modify:** generic Temporal/Kafka, unversioned delete fallback,
  automatic dead-letter replay, certificate/finalization, dependencies/locks,
  `docs/package/**`.
- **Implementation:** claim with `FOR UPDATE SKIP LOCKED`, recover stale
  claims, recheck approval/hold/Object Lock immediately before each exact
  deletion, then HEAD/reconcile and write a bounded receipt. `404` is
  `already_absent` only with sealed inventory plus HEAD proof; `403`, timeout,
  and `5xx` never mean success. API role remains worker-disabled.
- **Verification (AND):** before/partial/all-delete fault matrix, duplicate
  run x10, hold-after-approval race, 404/403/timeout/5xx, worker/API-role and
  cross-tenant negatives.
- **Stop:** delete outcome cannot be determined by exact HEAD/readback, hold
  race remains open, or automatic replay/unversioned fallback is required.

## Evidence boundary

Record exact source SHA/tree, storage capability, synthetic-only transcript,
sealed inventory hash, permission/hold/audit negatives, and each fault result
under `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS03-01/<tuw>/`. A local
pass does not claim CI, push, merge, deployment, release, or go-live.
