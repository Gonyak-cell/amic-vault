# OneDrive Production Pilot Import TUW Plan

Date: 2026-06-29
Scope: `LC-ONEDRIVE-CLOSEOUT-05` production pilot or bounded batch import
Approval ref: `APPROVAL-ONEDRIVE-PROD-PILOT-IMPORT-2026-06-29`

## Goal

Implement and operate the production pilot import gate without collapsing it
into source-of-truth cutover, OneDrive connected-state, Office sync, Gemma
indexing, or go-live claims.

This plan covers only production pilot or bounded batch import. It does not
authorize production source-of-truth cutover, OneDrive connected-state, Office
open/save/sync, Gemma indexing, or customer-wide go-live.

## Control Surface

Run the no-write runtime target check before any production execute attempt:

```bash
pnpm onedrive:production-runtime-target-check -- \
  --dry-run \
  --run-id lc-onedrive-production-runtime-target-check \
  --approval-ref APPROVAL-ONEDRIVE-PROD-PILOT-IMPORT-2026-06-29 \
  --manifest-approval-ref approval-ingest.sanitized.json \
  --production-preflight .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-preflight-ready-check.sanitized.json \
  --import-decision .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-import-decision-ready.sanitized.json \
  --pilot-gate .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-pilot-import-approved-dry-run.sanitized.json \
  --tenant-slug amic \
  --actor-user-id 1ffdb4f1-a3d1-5e7a-bae8-4e3ae2dae4c6 \
  --sanitized-out .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-runtime-target-check.sanitized.json \
  --limit 1 \
  --offset 0
```

The runtime target check writes only booleans, hashed refs, and sanitized
evidence filenames. It does not store `DATABASE_URL`, `PGHOST`, `AWS_PROFILE`,
object keys, raw paths, account IDs, or customer content. Status
`ready_for_pilot_execute` means the same runtime target conditions required by
the LC-05 wrapper are present. When blocked, `missing_runtime_requirements`
names the missing requirement class without recording secret values. When
ready, `execute_handoff.status=ready` confirms the bounded scope and the
required `--runtime-target-check` receipt argument for the execute wrapper.

Use the LC-05 wrapper:

```bash
pnpm onedrive:production-pilot-import -- \
  --dry-run \
  --run-id lc-onedrive-production-pilot-import-approved-wrapper-dry-run \
  --approval-ref APPROVAL-ONEDRIVE-PROD-PILOT-IMPORT-2026-06-29 \
  --manifest-approval-ref approval-ingest.sanitized.json \
  --production-preflight .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-preflight-ready-check.sanitized.json \
  --import-decision .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-import-decision-ready.sanitized.json \
  --pilot-gate .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-pilot-import-approved-dry-run.sanitized.json \
  --runtime-target-check .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-runtime-target-check.sanitized.json \
  --manifest .omo/evidence/BULK-SCOPE-APPROVAL/provisional-approve-complete/document-import-target-resolution/post-matter-code-123-check/resolved-import-manifest.with-supplement.local.ndjson.gz \
  --scope .omo/evidence/BULK-SCOPE-APPROVAL/provisional-approve-complete/ingest/approved-import-scope.local.ndjson.gz \
  --tenant-slug amic \
  --actor-user-id 1ffdb4f1-a3d1-5e7a-bae8-4e3ae2dae4c6 \
  --sanitized-out .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-pilot-import-approved-wrapper-dry-run.sanitized.json \
  --local-receipt-out .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-pilot-import-approved-wrapper.local.ndjson \
  --state .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-pilot-import-approved-wrapper-state.local.json \
  --limit 1 \
  --offset 0 \
  --max-failures 1
```

Execute uses the same inputs with `--execute`, but only after production DB and
source-object runtime target env are present and the matching
`production-runtime-target-check.sanitized.json` receipt reports
`ready_for_pilot_execute`. The wrapper blocks execute when `DATABASE_URL` or
`PGHOST`/`PGDATABASE`/`PGUSER` is absent, source object access env is absent, or
the runtime target check receipt is missing/not ready/scope mismatched.
It also validates the receipt's `execute_handoff` block, including
`required_receipt_ref`, `required_wrapper_arg`, and bounded scope, before
calling the import runner.

After a successful bounded execute, run the no-write post-execute closeout:

```bash
pnpm onedrive:production-pilot-closeout -- \
  --dry-run \
  --run-id lc-onedrive-production-pilot-closeout \
  --production-pilot-import .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-pilot-import-execute.sanitized.json \
  --runtime-target-check .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-runtime-target-check.sanitized.json \
  --sanitized-out .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-pilot-closeout.sanitized.json \
  --expected-limit 1 \
  --expected-offset 0
```

This closeout reads only sanitized receipts. It verifies `PROD-IMPORT-005`
post-execute counts and `PROD-IMPORT-006` replay idempotency before production
cutover preflight can consume the closeout receipt.

Before expanding beyond the bounded pilot, run the no-write batch expansion
gate with a separate approval ref:

```bash
pnpm onedrive:closeout-gate -- \
  --dry-run \
  --gate production-batch-expansion \
  --run-id lc-onedrive-production-batch-expansion-gate \
  --production-preflight .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-preflight-ready-check.sanitized.json \
  --tuw-plan docs/release/onedrive-production-import-tuw-plan.md \
  --approval-ref <production-batch-expansion-approval-ref> \
  --production-import-closeout .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-pilot-closeout.sanitized.json \
  --sanitized-out .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-batch-expansion-gate.sanitized.json
```

This gate does not execute production import or cutover. It only proves the
pilot closeout receipt is `PASS`, production import actually executed for the
bounded pilot, and connected-state/Office/Gemma/cutover claims remain false.
Any expanded production execute scope (`--limit > 1` or `--offset > 0`) must
pass the resulting receipt to `pnpm onedrive:production-pilot-import` with
`--batch-expansion-gate <production-batch-expansion-gate.sanitized.json>`.
The wrapper blocks expanded execute if that receipt is missing or not
`ready_for_next_gate`.

## TUW Breakdown

### PROD-IMPORT-001: Approval Ref Fixed

Objective:

Record the explicit production pilot/batch import approval ref without storing
secrets, endpoints, account IDs, raw paths, document names, object keys, or
customer content.

Implementation:

- Approval ref is passed as `--approval-ref`.
- Sanitized receipts store only `approval_ref_hash`.
- Manifest provenance approval is passed separately as `--manifest-approval-ref`.

Verification:

- `approval_ref_invalid` absent.
- `manifest_approval_ref_invalid` absent.
- Receipt contains hashes, not raw private values.

Current status:

```text
PROD-IMPORT-001 = PASS
```

### PROD-IMPORT-002: Pilot Import Dry-Run

Objective:

Re-run the production pilot import gate with the approval ref and verify that no
production write occurs.

Implementation:

- `pnpm onedrive:closeout-gate -- --dry-run --gate production-pilot-import ...`
- `pnpm onedrive:production-pilot-import -- --dry-run ...`

Verification:

- Gate status: `ready_for_next_gate`.
- Wrapper status: `ready_for_execute`.
- `production_write_executed=false`.
- `production_import_executed=false`.

Current status:

```text
PROD-IMPORT-002 = PASS
```

### PROD-IMPORT-003: Pilot Scope Fixed

Objective:

Limit the first production run to a small pilot or bounded batch with explicit
count and offset.

Implementation:

- Wrapper enforces `limit > 0 && limit <= 100`.
- Current pilot uses `limit=1`, `offset=0`.
- Receipt stores tenant/operator only as hashes.
- Rollback ref remains the opaque production backup ref.

Verification:

- `pilot_scope_limit_out_of_bounds` absent.
- Receipt records `scope.bounded=true`.

Current status:

```text
PROD-IMPORT-003 = PASS
```

### PROD-IMPORT-004: Production Pilot Execute

Objective:

Execute only the approved bounded scope through `DocumentUploadService` and
never combine it with cutover or product integration claims.

Implementation:

- Wrapper calls the customer-wide import runner only after all preflight and
gate receipts are ready.
- `--execute` is blocked unless production runtime target env is present.
- `--execute` is blocked unless the matching runtime target check receipt is
  present and ready.
- `cutoverPolicy` must be `not_requested`.

Verification:

- On missing runtime target, blocker is `production_runtime_target_env_missing`.
- On execute, runner status must be `pass`.
- `source-of-truth cutover` remains not executed.

Current status:

```text
PROD-IMPORT-004 = BLOCKED_RUNTIME_TARGET
```

### PROD-IMPORT-005: Post-Execute Reconciliation

Objective:

After execute, verify production import counts and relation consistency for the
bounded scope.

Implementation:

- Wrapper records imported/reused/skipped/blocked/failed counts from the import
  runner.
- `pnpm onedrive:production-pilot-closeout` verifies the sanitized execute
  receipt and runtime-target receipt without production writes.
- For full DB relation counts, run only after production target env is present.

Verification:

- `blocked=0`.
- `failed=0`.
- Expected created counts match the bounded pilot scope.
- DB relation checks are required before promoting beyond pilot.

Current status:

```text
PROD-IMPORT-005 = DEFERRED_UNTIL_EXECUTE
```

### PROD-IMPORT-006: Replay Idempotency

Objective:

Re-run the same bounded scope after execute and prove duplicate create count is
zero.

Implementation:

- On successful `--execute`, wrapper automatically performs a replay dry-run
  using the same state file.
- `pnpm onedrive:production-pilot-closeout` blocks unless replay status is
  `PASS` and replay `ready/blocked/failed` counts are all zero.

Verification:

- Replay status: `PASS`.
- `ready=0`.
- `already_imported` or skipped rows account for the bounded scope.

Current status:

```text
PROD-IMPORT-006 = DEFERRED_UNTIL_EXECUTE
```

### PROD-IMPORT-007: Leak Scan And Non-Claim Check

Objective:

Ensure receipts and docs do not store raw path, object key, token, customer
body, OCR excerpt, private endpoint, account ID, or secret value.

Implementation:

- Wrapper receipt stores hashes and sanitized filenames only.
- Non-claims remain false in every wrapper receipt.

Verification:

- Leak scan over touched docs and `LC-ONEDRIVE-PRODUCTION-GATE` receipts passes.
- `production_source_of_truth_cutover_executed=false`.
- `onedrive_connected_state_claimed=false`.
- `office_open_save_sync_claimed=false`.
- `gemma_indexing_executed=false`.

Current status:

```text
PROD-IMPORT-007 = PASS
```

### PROD-IMPORT-008: Next Gate Handoff

Objective:

After pilot PASS, route to production batch expansion or production cutover
preflight without implying either has already happened.

Implementation:

- Wrapper receipt reports `WAITING_FOR_PRODUCTION_RUNTIME_TARGET` until execute.
- If execute passes, next gate is batch expansion or cutover preflight.
- Batch expansion requires `production-batch-expansion` closeout gate PASS with
  a separate approval ref and pilot closeout receipt.
- Expanded production batch execute requires the batch expansion gate receipt
  via `--batch-expansion-gate`; pilot-only execute does not.
- Cutover still needs separate approval.

Verification:

- No source-of-truth cutover receipt is generated by LC-05.
- Handoff does not claim OneDrive connected-state, Office sync, Gemma indexing,
  or go-live.

Current status:

```text
PROD-IMPORT-008 = WAITING_FOR_PRODUCTION_RUNTIME_TARGET
```

## Acceptance Gate

```text
approval_ref_present = true
production_preflight_ready = true
production_import_decision_ready = true
pilot_import_dry_run_ready = true
pilot_scope_bounded = true
runtime_target_present_before_execute = true
pilot_execute_receipt_pass = true
blocked_rows = 0
failed_rows = 0
replay_ready_rows = 0
duplicate_create = 0
leak_scan = PASS
cutover_executed = false
gemma_indexing_executed = false
office_sync_claimed = false
onedrive_connected_state_claimed = false
go_live_claimed = false
```

## Current Blocker

The current local shell has no production runtime target env, so production
execute is intentionally blocked:

```text
production_runtime_target_env_missing
production_import_execute_not_run
```
