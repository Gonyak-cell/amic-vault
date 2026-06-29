# OneDrive Production Gate Request Packet

Date: 2026-06-29
Branch: `codex/onedrive-production-gate-check`
Base: `origin/main` after PR #328 merge (`782a4126e97c65c5dc612dba7d219f721c197b0d`)

## Status

Local OneDrive-to-Vault closeout evidence is on `main`, but production promotion
is still blocked because the production external refs have not been supplied to
the no-write production preflight surface.

Current no-write preflight:

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
