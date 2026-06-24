# OneDrive Pilot Import Runbook

Status: POST-LAUNCH PILOT RUNBOOK ONLY
Owner: Operator / Security owner / Legal-data owner / Rollback owner
Related design: `docs/release/onedrive-pilot-import-worker-design.md`

## Scope

This runbook operates only on one approved post-launch pilot Matter. It must not
be used for customer-wide import, OneDrive connected-state claims, Office
open/save/sync, Gemma indexing, or source-of-truth cutover.

## Phase 0 - Preconditions

Required before any dry-run:

1. `LC-ONEDRIVE-00` PASS.
2. `LC-ONEDRIVE-01` PASS.
3. `LC-ONEDRIVE-02` PASS.
4. Candidate id selected from sanitized summary.
5. Mapping row status is `ready_for_dryrun`.
6. Required owner refs are recorded outside the repository.
7. Local-only detailed scope manifest is present and protected.

Required before write-mode:

1. `LC-ONEDRIVE-04` dry-run PASS.
2. `LC-ONEDRIVE-05` synthetic write-mode PASS.
3. Mapping row status is `ready_for_write_mode`.
4. Import lock procedure is available.
5. Pre-import DB snapshot ref is recorded.
6. Pre-import storage containment ref is recorded.
7. Write window ref is approved.
8. Rollback owner confirms no-hard-delete rollback constraints.

## Phase 1 - Dry-Run

Command shape:

```bash
node tools/migration/onedrive-pilot-dryrun.mjs \
  --mode dry-run \
  --run-id <ONEDRIVE-STAGING-RUN-REF> \
  --candidate-id <ONEDRIVE-PILOT-CANDIDATE-REF> \
  --scope-manifest <local-only-scope-manifest> \
  --mapping-ref <ONEDRIVE-MAPPING-REF> \
  --permission-ref <ONEDRIVE-PERMISSION-REF> \
  --retention-ref <ONEDRIVE-RETENTION-REF> \
  --rollback-ref <ONEDRIVE-ROLLBACK-REF> \
  --sanitized-out <pilot-dryrun-report.sanitized.json>
```

Expected result:

- no Vault DB writes;
- no Vault storage writes;
- deterministic target count;
- explicit blocked, skipped, retryable, and ready counts;
- expected document, file object, version, and audit event counts;
- sanitized output only.

Proceed only if dry-run is PASS or all blockers have approved waiver refs.

## Phase 2 - Synthetic Write Test

Command shape:

```bash
node tools/migration/onedrive-pilot-import.mjs \
  --mode synthetic-write \
  --fixture <synthetic-fixture> \
  --sanitized-out <synthetic-import-receipt.sanitized.json>
```

Expected result:

- fixture-only Vault storage write;
- fixture-only DB writes;
- `file_objects.source_system = 'migration'`;
- audit event created for every fixture success;
- idempotent rerun reports already-imported fixture rows;
- unauthorized or ambiguous fixture rows fail closed.

Synthetic write PASS is required before real pilot write-mode.

## Phase 3 - Pilot Write Mode

Command shape:

```bash
pnpm onedrive:pilot-write -- \
  --execute \
  --run-id <ONEDRIVE-STAGING-RUN-REF> \
  --candidate-id <ONEDRIVE-PILOT-CANDIDATE-REF> \
  --scope <local-only-scope-manifest> \
  --mapping <local-only-mapping-json> \
  --target <local-only-vault-target-json> \
  --source-manifest <local-only-raw-source-manifest> \
  --sanitized-out <pilot-import-receipt.sanitized.json> \
  --local-receipt-out <pilot-import-receipt.local.ndjson>
```

Execution rules:

- acquire import lock first;
- run `pnpm onedrive:pilot-write -- --dry-run ...` with the same inputs before
  `--execute`;
- stop if the scope is broader than one pilot Matter;
- stop if any approval ref is missing;
- stop if the local-only target file does not contain approved Vault tenant,
  Matter, actor, and upload-preflight targets;
- stop after three repeated failures with the same root category;
- never mutate or delete staging source objects;
- never hard-delete Vault documents, file objects, versions, or audit events;
- keep detailed local receipt protected with mode `0600`.

## Phase 4 - Immediate Post-Write Checks

Run before releasing the import lock:

| Check | Expected |
|---|---|
| succeeded + failed | equals dry-run target count |
| failed | zero or approved exclusions |
| storage writes | equal successful imports |
| document rows | equal successful new documents |
| file object rows | equal successful file objects |
| initial version rows | equal successful new documents |
| audit events | equal successful writes plus denials where applicable |
| local detailed receipt | exists, protected, not uploaded to repo |
| sanitized receipt | exists and contains no detailed source labels |

## Phase 5 - Reconciliation Handoff

Produce handoff inputs for `LC-ONEDRIVE-07`:

- sanitized import receipt;
- local-only detailed receipt;
- dry-run report;
- approval refs;
- import lock record;
- DB snapshot ref;
- storage containment ref;
- failed-item categories;
- rollback owner confirmation.

## Rollback And Containment

Rollback must be containment-first:

- disable further import jobs;
- preserve staging source objects;
- preserve Vault audit events;
- preserve immutable originals and versions;
- mark imported pilot records as quarantined or excluded through approved
  lifecycle controls where available;
- reconcile rather than hard-delete when DB write succeeded.

Any rollback that requires hard delete is a stop condition and must be escalated.

## Operator Output Rules

Operator-facing summaries may include:

- counts;
- bytes;
- hashed candidate id;
- sanitized approval refs;
- status categories;
- S3 control keys for sanitized artifacts.

Operator-facing summaries must not include:

- customer document names;
- detailed customer folder labels;
- source object keys;
- document body text;
- private tenant identifiers;
- provider console metadata;
- screenshots exposing matter data;
- cookies, tokens, or secrets.
