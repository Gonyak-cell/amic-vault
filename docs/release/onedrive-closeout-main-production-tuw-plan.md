# OneDrive Closeout Main And Production TUW Plan

Date: 2026-06-29
Scope: AMIC OneDrive-to-Vault customer-wide migration after local import,
local source-of-truth cutover, full extraction/search/Gemma closeout, and Matter
app migration DB linkage.

## Current Verified Local State

The current local Vault DB and sanitized receipts prove this local state:

| Metric | Count |
| --- | ---: |
| `clients` | 80 |
| `matters` | 123 |
| `active_documents` | 22,299 |
| `document_versions` | 22,299 |
| `file_objects` | 22,299 |
| `docs_with_matter` | 22,299 |
| `canonical_extraction_ready` | 22,299 |
| `search_indexed_documents` | 22,299 |
| `ai_allowed_documents` | 22,299 |
| `docs_with_all_4_real_gemma` | 22,299 |
| `real_gemma_outputs` | 89,196 |
| `fallback_payloads` | 0 |
| `stale_required_artifacts` | 0 |
| `non_completed_required_artifacts` | 0 |

Import scope reconciliation:

| Metric | Count |
| --- | ---: |
| `approved_scope_rows` | 22,403 |
| `imported_or_reused_rows` | 22,286 |
| `allowed_skipped_rows` | 117 |
| `blocked_rows` | 0 |
| `failed_rows` | 0 |

Matter app local linkage:

| Metric | Count |
| --- | ---: |
| `matter_app_clients_resolved` | 80 |
| `matter_app_matters_resolved` | 123 |
| `vault_projection_synced_matters` | 123 |
| `duplicate_create_count` | 0 |
| `document_mutation_count` | 0 |

## Non-Claims

The following remain unclaimed until separate production or product evidence
exists:

- OneDrive connected-state.
- Office open/save/sync.
- Production customer-wide import execution.
- Production source-of-truth cutover.
- Production Gemma or AI prep execution for this migrated corpus.
- Any live customer go-live claim beyond the local Vault DB closeout receipts.

## Evidence Sources

Repo-safe sanitized receipts:

- `.omo/evidence/BULK-SCOPE-APPROVAL/provisional-approve-complete/customer-wide-import/customer-wide-import-closeout.sanitized.json`
- `.omo/evidence/OP-ONEDRIVE-CUTOVER-EXECUTE/post-cutover-read-surface-smoke.sanitized.json`
- `.omo/evidence/OP-ONEDRIVE-CUTOVER-EXECUTE/post-cutover-web-read-surface-smoke.sanitized.json`
- `.omo/evidence/OP-FULL-CLOSEOUT/full-closeout-remediation-execute.sanitized.json`
- `.omo/evidence/OP-FULL-CLOSEOUT/gemma-cw-ai-allowed-full-closeout-execute.sanitized.json`
- `.omo/evidence/OP-FULL-CLOSEOUT/gemma-full-closeout-real-output-execute.sanitized.json`
- `.omo/evidence/OP-FULL-CLOSEOUT/full-closeout-final-reconciliation.sanitized.json`
- `.omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/bridge-execute/client-matter-write.sanitized.json`
- `.omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/bridge-replay/client-matter-write.sanitized.json`
- `.omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/matter-app-migration-db-linkage-closeout.sanitized.json`

These receipts must remain aggregate/reference-only. Do not add raw source
paths, document body text, OCR excerpts, screenshots, object keys, cookies,
tokens, tenant-private raw values, or customer document names.

## TUW Breakdown

### LC-ONEDRIVE-CLOSEOUT-00: Evidence Freeze And Index

Objective:

Freeze the local closeout evidence into a repo-readable index without copying
customer content or private runtime values.

Implementation:

- Create a release evidence index with current branch SHA, local DB count
  snapshot, receipt paths, non-claims, and leak-scan status.
- Record which evidence is local-only and which gates remain external.
- Keep `.omo` receipts as evidence refs; do not inline sensitive receipt payloads.

Verification:

- `active_documents=document_versions=file_objects=22,299`.
- `docs_with_matter=22,299`.
- `docs_with_all_4_real_gemma=22,299`.
- `real_gemma_outputs=89,196`.
- `fallback_payloads=0`.
- Evidence index contains no raw path, OCR/body excerpt, object key, token, or
  tenant-private raw value.

Acceptance:

```text
local_evidence_index_created = true
local_db_snapshot_matches_receipts = true
leak_scan = PASS
```

### LC-ONEDRIVE-CLOSEOUT-01: Main PR Package

Objective:

Prepare the current 9-commit local closeout branch plus uncommitted Matter app
linkage implementation for review against `origin/main`.

Implementation:

- Commit the Matter app migration DB linkage plan, runner, tests, and script
  registration.
- Add a PR package document that separates:
  - local complete claims,
  - production-not-executed claims,
  - explicit non-claims,
  - validation commands,
  - sanitized evidence refs.
- Push the branch and open a PR against `main`.

Verification:

- Branch is ahead of `origin/main` by the intended migration closeout commits.
- PR exists and CI starts.
- PR body does not claim OneDrive connected-state, Office sync, production
  import, or production cutover.

Acceptance:

```text
branch_pushed = true
pull_request_open = true
ci_started = true
forbidden_claims_absent = true
```

### LC-ONEDRIVE-CLOSEOUT-02: Review And Merge Gate

Objective:

Drive the PR through review without self-merging.

Implementation:

- Track CI status and review comments.
- Address requested changes in separate commits.
- Keep code/data/receipt changes scoped to closeout and linkage surfaces.
- Codex must not merge its own PR. Merge requires operator or independent
  reviewer action.

Verification:

- CI is green or failures are diagnosed and fixed.
- Review comments requiring changes are resolved.
- Merge commit appears on `origin/main` only after external review/operator
  action.

Acceptance:

```text
ci_green = true
review_required_changes_resolved = true
merged_by_operator_or_independent_reviewer = true
origin_main_contains_closeout_commits = true
```

### LC-ONEDRIVE-CLOSEOUT-03: Production Preflight Surface

Objective:

Implement a production preflight receipt surface that can prove the production
environment is ready before any migrated corpus write occurs.

Implementation:

- Add or reuse a no-write production preflight runner.
- Inputs must be runtime-only:
  - production DB target ref,
  - storage containment ref,
  - tenant/matter scope ref,
  - operator role ref,
  - rollback/snapshot ref,
  - manifest/evidence refs.
- Validate schema/migration level, storage target, import lock, actor role,
  tenant scope, expected counts, and source manifest hash/ref.
- Emit only sanitized counts, refs, booleans, and blocker codes.

Verification:

- Dry-run with missing production env returns `blocked_external_env_missing`.
- Dry-run with configured env can produce `ready_for_execute` without writes.
- Receipt records `production_write_executed=false`.

Acceptance:

```text
production_preflight_surface_exists = true
dry_run_no_write = true
missing_env_blocks_cleanly = true
receipt_leak_scan = PASS
```

Current local receipt:

- `.omo/evidence/LC-ONEDRIVE-CLOSEOUT/production-preflight-missing-env.sanitized.json`
- Status: `blocked`
- Blocker: `production_external_refs_missing`
- `production_write_executed=false`

### LC-ONEDRIVE-CLOSEOUT-04: Production Import Decision Gate

Objective:

Make the production import path explicit before any write.

Implementation:

- Document and encode the decision that production should use a controlled
  import runner with the same approved manifest/evidence refs, not an
  uncontrolled local DB copy.
- Require dry-run count parity with local closeout:
  - `approved_scope_rows=22,403`,
  - `expected_imported_or_reused=22,286`,
  - `expected_allowed_skipped=117`.
- Block if production target already contains conflicting matter/document
  rows that cannot be idempotently reused.

Verification:

- Decision receipt exists.
- Production dry-run expected counts match local closeout.
- Conflicts are explained before execute.

Acceptance:

```text
production_import_strategy = controlled_runner_replay
production_dry_run_count_parity = PASS
conflict_matrix_ready = true
```

Current local receipt:

- `.omo/evidence/LC-ONEDRIVE-CLOSEOUT/production-import-decision.sanitized.json`
- Status: `blocked`
- Blockers: `production_preflight_not_ready`, `production_external_refs_missing`
- `production_import_executed=false`

### LC-ONEDRIVE-CLOSEOUT-05: Production Pilot/Batch Execute Gate

Objective:

Execute production import only in controlled waves after preflight and explicit
operator approval.

Implementation:

- Start with a pilot or small wave.
- Use bounded idempotent runner execution.
- Produce per-wave receipts with imported/reused/skipped/blocked/failed counts.
- Stop on any failed/blocked row that is not policy-approved.

Verification:

- Per-wave `imported + reused + allowed_skipped` equals target scope.
- `blocked=0` and `failed=0`, or execution halts with remediation receipt.
- Role restore and containment receipt are present for each wave.

Acceptance:

```text
production_wave_receipts_pass = true
production_blocked_failed_zero = true
production_replay_idempotent = true
```

Current local receipt:

- `.omo/evidence/LC-ONEDRIVE-CLOSEOUT/production-pilot-import.sanitized.json`
- Status: `blocked`
- Blockers include `production_import_approval_ref_missing`
- `production_import_executed=false`

### LC-ONEDRIVE-CLOSEOUT-06: Production Source-Of-Truth Cutover

Objective:

Cut production Vault over to the imported corpus only after production import
reconciliation passes.

Implementation:

- Reuse the local cutover control pattern for production.
- Require production import closeout PASS and explicit cutover approval.
- Execute cutover separately from import waves.
- Keep OneDrive connected-state and Office sync claims false unless separately
  implemented and proved.

Verification:

- Production cutover receipt exists.
- Production read surface/API smoke passes.
- `vault_source_of_truth=true`.
- `onedrive_connected_state_claimed=false`.
- `office_open_save_sync_claimed=false`.

Acceptance:

```text
production_source_cutover_pass = true
production_read_smoke_pass = true
forbidden_product_claims_false = true
```

Current local receipt:

- `.omo/evidence/LC-ONEDRIVE-CLOSEOUT/production-cutover.sanitized.json`
- Status: `blocked`
- Blockers include `production_cutover_approval_ref_missing`
- `production_source_of_truth_cutover_executed=false`

### LC-ONEDRIVE-CLOSEOUT-07: Production OCR/Search/Gemma Backlog Gate

Objective:

Ensure production does not inherit an unresolved OCR/Gemma backlog.

Implementation:

- In production, classify any non-ready, non-indexed, or non-ai-allowed rows
  into remediation, retry, policy exclusion, or blocker lanes.
- If production follows the local full closeout path, require parity:
  - `canonical_extraction_ready=22,299`,
  - `search_indexed_documents=22,299`,
  - `ai_allowed_documents=22,299`,
  - `docs_with_all_4_real_gemma=22,299`.

Verification:

- Production backlog matrix has unresolved count 0 or approved exclusion count.
- No row is marked Gemma complete without completed artifact rows.

Acceptance:

```text
production_unresolved_ai_backlog = 0
production_gemma_required_artifacts_complete = true
```

Current local receipt:

- `.omo/evidence/LC-ONEDRIVE-CLOSEOUT/production-ai-backlog.sanitized.json`
- Status: `blocked`
- Blocker: production import closeout required before production AI backlog gate

### LC-ONEDRIVE-CLOSEOUT-08: Gemma Indexing Execution Claim Gate

Objective:

Prevent `gemma_indexing_executed=true` from being set by documentation alone.

Implementation:

- Keep `gemma_indexing_executed=false` until a real production or local indexing
  job receipt exists for the intended indexing surface.
- Define whether "indexing" means AI prep artifact generation, search index
  backfill, vector/embedding indexing, or retrieval-ready Gemma prep. The local
  closeout currently proves search index and Gemma prep artifacts, not a
  separate product claim unless the executed receipt names that surface.
- Require post-index permission-filtered retrieval smoke.

Verification:

- Indexing execute receipt exists before claim.
- Audit/event receipt exists.
- Permission-filtered retrieval smoke passes.

Acceptance:

```text
gemma_indexing_claim_has_execute_receipt = true
post_index_permission_smoke_pass = true
```

Current local receipt:

- `.omo/evidence/LC-ONEDRIVE-CLOSEOUT/gemma-indexing-claim.sanitized.json`
- Status: `blocked`
- Blockers: Gemma indexing execute, audit, and permission smoke receipts missing
- `gemma_indexing_executed=false`

### LC-ONEDRIVE-CLOSEOUT-09: OneDrive Connected-State Product Gate

Objective:

Keep migration completion separate from live OneDrive integration.

Implementation:

- Do not claim connected-state from imported corpus existence.
- Define the product surface required for connected-state:
  - OAuth/account binding,
  - tenant-scoped connector config,
  - delta/sync cursor state,
  - permission-safe sync receipts,
  - disconnect/revoke behavior.
- Add a future product TUW plan if connected-state becomes in scope.

Verification:

- Current closeout receipts keep connected-state false.
- No PR text or release note claims live OneDrive sync.

Acceptance:

```text
onedrive_connected_state_claimed = false
connected_state_product_tuw_deferred = true
```

Current local receipt:

- `.omo/evidence/LC-ONEDRIVE-CLOSEOUT/onedrive-connected-state.sanitized.json`
- Status: `deferred_product_gate`
- `onedrive_connected_state_claimed=false`

### LC-ONEDRIVE-CLOSEOUT-10: Office Open/Save/Sync Product Gate

Objective:

Keep Office integration separate from Vault migration.

Implementation:

- Do not claim Office open/save/sync from imported document availability.
- Define future product requirements separately:
  - Office add-in or desktop integration,
  - version creation path,
  - immutable original preservation,
  - lock/conflict behavior,
  - audit receipt.

Verification:

- Current closeout receipts keep Office sync claim false.
- No PR text or release note claims Office sync.

Acceptance:

```text
office_open_save_sync_claimed = false
office_sync_product_tuw_deferred = true
```

Current local receipt:

- `.omo/evidence/LC-ONEDRIVE-CLOSEOUT/office-sync.sanitized.json`
- Status: `deferred_product_gate`
- `office_open_save_sync_claimed=false`

### LC-ONEDRIVE-CLOSEOUT-11: Final Release Statement

Objective:

Provide an exact completion statement after main/production gates finish.

Implementation:

- Split final statement into:
  - local Vault migration complete,
  - production import complete,
  - production source-of-truth cutover complete,
  - OneDrive connected-state not claimed unless product gate passes,
  - Office sync not claimed unless product gate passes,
  - Gemma/search/prep completion state.

Verification:

- Statement references PR number, merge SHA, production receipts if any, and
  sanitized evidence refs.

Acceptance:

```text
final_statement_has_exact_scope = true
no_unproved_claims = true
```

## Implementation Order

1. LC-ONEDRIVE-CLOSEOUT-00
2. LC-ONEDRIVE-CLOSEOUT-01
3. LC-ONEDRIVE-CLOSEOUT-02
4. LC-ONEDRIVE-CLOSEOUT-03
5. LC-ONEDRIVE-CLOSEOUT-04
6. LC-ONEDRIVE-CLOSEOUT-05
7. LC-ONEDRIVE-CLOSEOUT-06
8. LC-ONEDRIVE-CLOSEOUT-07
9. LC-ONEDRIVE-CLOSEOUT-08
10. LC-ONEDRIVE-CLOSEOUT-09
11. LC-ONEDRIVE-CLOSEOUT-10
12. LC-ONEDRIVE-CLOSEOUT-11

## Stop Conditions

- Production credentials, target refs, or approval refs are unavailable for an
  execute step.
- A production preflight count differs from local closeout and cannot be
  explained by idempotent reuse or approved skip policy.
- Any receipt or PR text would expose raw source path, customer content, object
  key, token, secret, screenshot, or tenant-private raw value.
- A requested action would merge the PR by Codex without independent review or
  operator action.
