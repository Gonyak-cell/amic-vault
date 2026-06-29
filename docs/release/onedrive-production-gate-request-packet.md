# OneDrive Production Gate Request Packet

Date: 2026-06-29
Initial Branch: `codex/onedrive-production-gate-check`
Follow-up Branch: `codex/onedrive-production-preflight-ready`
Base: `origin/main` after PR #329 merge (`04d8b231dee0426f9bdcdea0d72d8a0f7192c21d`)

## Status

Local OneDrive-to-Vault closeout evidence is on `main`. PR #329 added the
production gate request packet, and the follow-up no-write production preflight
has now reached the production import decision gate. Production import itself is
still not executed and remains blocked until a separate production import
approval ref is supplied.

Initial no-write preflight:

- Command: `pnpm onedrive:production-preflight -- --dry-run ...`
- Receipt: `.omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-preflight-ref-check.sanitized.json`
- Result: `blocked`
- Blocker: `production_external_refs_missing`
- `production_write_executed=false`
- `production_import_executed=false`
- `production_source_of_truth_cutover_executed=false`
- `onedrive_connected_state_claimed=false`
- `office_open_save_sync_claimed=false`
- `gemma_indexing_executed=false`

Follow-up no-write preflight:

- Receipt: `.omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-preflight-ready-check.sanitized.json`
- Result: `ready_for_production_import_decision`
- Blockers: none
- `production_write_executed=false`
- `production_import_executed=false`
- `production_source_of_truth_cutover_executed=false`
- `onedrive_connected_state_claimed=false`
- `office_open_save_sync_claimed=false`
- `gemma_indexing_executed=false`

Production import decision gate:

- Receipt: `.omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-import-decision-ready.sanitized.json`
- Result: `ready_for_next_gate`
- Blockers: none
- `production_write_executed=false`

Production pilot import gate:

- Receipt: `.omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-pilot-import-blocked-no-approval.sanitized.json`
- Result: `blocked`
- Blocker: `production_import_approval_ref_missing`
- `production_write_executed=false`

## Required Runtime Refs

The operator must provide these refs as opaque, repo-safe identifiers. Do not
paste secrets, private endpoints, account IDs, ARNs, customer file paths,
document names, object keys, screenshots, cookies, or tokens into the repo.

| Ref | Required For | Required Format |
| --- | --- | --- |
| `production_db_ref` | Identifies the production Vault DB target and schema/migration readiness evidence. | Opaque evidence ID or sanitized receipt filename. |
| `storage_containment_ref` | Proves the production storage target is isolated, encrypted/versioned where required, and not the local/dev bucket. | Opaque evidence ID or sanitized receipt filename. |
| `rollback_snapshot_ref` | Proves a rollback/snapshot checkpoint exists before any production migrated-corpus write. | Opaque evidence ID or sanitized receipt filename. |
| `operator_role_ref` | Proves the migration operator role/window is approved and bounded. | Opaque approval/evidence ID. |
| `manifest_ref` | Pins the approved manifest/evidence bundle used for production replay. | Opaque manifest hash/ref or sanitized evidence ID. |
| `approval_ref` | Explicit approval to proceed to production dry-run/execute gates for this migration lane. | Opaque approval ID. |

The no-write preflight ready check used only opaque refs and hashes them in the
sanitized receipt. It does not prove production customer document import was
executed.

## Next No-Write Command

After the refs above exist, run only the no-write preflight first:

```bash
pnpm onedrive:production-preflight -- \
  --dry-run \
  --run-id lc-onedrive-production-gate-ready-check \
  --target-environment production \
  --import-closeout .omo/evidence/BULK-SCOPE-APPROVAL/provisional-approve-complete/customer-wide-import/customer-wide-import-closeout.sanitized.json \
  --full-closeout .omo/evidence/OP-FULL-CLOSEOUT/full-closeout-final-reconciliation.sanitized.json \
  --matter-linkage-closeout .omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/matter-app-migration-db-linkage-closeout.sanitized.json \
  --evidence-index docs/release/onedrive-closeout-evidence-index.md \
  --production-db-ref "<opaque-production-db-ref>" \
  --storage-containment-ref "<opaque-storage-containment-ref>" \
  --rollback-snapshot-ref "<opaque-rollback-snapshot-ref>" \
  --operator-role-ref "<opaque-operator-role-ref>" \
  --manifest-ref "<opaque-manifest-ref>" \
  --approval-ref "<opaque-approval-ref>" \
  --sanitized-out .omo/evidence/LC-ONEDRIVE-PRODUCTION-GATE/production-preflight-ready-check.sanitized.json
```

Passing this preflight does not execute production import, production cutover,
OneDrive connected-state, Office sync, or Gemma indexing. Those remain separate
gates with their own receipts.

## Next Approval Required

The next executable gate is `LC-ONEDRIVE-CLOSEOUT-05` production pilot/batch
import. It needs a separate explicit approval ref before any production import
runner can be invoked.

Required approval shape:

```text
approval_ref = <opaque production import approval id>
scope = production pilot or bounded batch import only
source refs = production-preflight-ready-check.sanitized.json and production-import-decision-ready.sanitized.json
forbidden claims = OneDrive connected-state, Office open/save/sync, Gemma indexing
```

Without that approval ref, the gate remains:

```text
production_pilot_import_status = blocked
blocker = production_import_approval_ref_missing
production_write_executed = false
```

## Acceptance Gate

Production import may not proceed until all checks below pass:

```text
production_preflight_status = ready_for_execute
production_refs_present = true
production_refs_safe = true
local_import_closeout_pass = true
local_full_closeout_pass = true
matter_linkage_closeout_pass = true
local_count_parity_pass = true
production_write_executed = false during preflight
receipt_leak_scan = PASS
explicit_execute_approval_exists = true
```

## Current Non-Claims

The following remain unclaimed:

- Production customer-wide import execution.
- Production source-of-truth cutover.
- OneDrive connected-state.
- Office open/save/sync.
- Production Gemma or AI prep execution for this migrated corpus.
- Any live customer go-live claim beyond local closeout evidence.
