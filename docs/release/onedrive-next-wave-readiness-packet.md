# OneDrive Next-Wave Readiness Packet

Status: READY FOR BOUNDED-BATCH APPROVAL, NOT AUTHORIZED FOR WRITE
Date: 2026-06-25
Plan ID: `onedrive-next-wave-readiness-20260625`
Depends on:

- PR #321 pilot execution closeout
- `docs/release/onedrive-pilot-closeout-reconciliation.md`
- `docs/release/onedrive-bulk-wave-plan.md`

## Boundary

This packet prepares the next bounded Matter-batch decision after the successful
13-document local pilot. It does not approve or execute customer-wide import,
OneDrive connected-state, Office open/save/sync, source-of-truth cutover,
external sharing, Gemma indexing, or another Vault write.

The next executable action is a dry-run-only approval for one explicit bounded
Matter batch. The exact batch mapping, freeze window, rollback owner, and
operator approval must be held as opaque local refs before any dry-run runs.

## Testable Units

| Unit | Scope | Current State | PASS Evidence | Stop Condition |
|---|---|---|---|---|
| NWR-00 | Baseline | complete | PR #321 merged; pilot closeout recorded | pilot closeout cannot be verified |
| NWR-01 | Wave limit | complete | `matter_batch` only, max 3 Matters per wave | `customer_wide`, `full_corpus`, or `all_matters` |
| NWR-02 | Approval refs | gate available, pending operator input | `next-wave-approval` gate PASS | placeholder or ambiguous approval ref |
| NWR-03 | LC09 gate | complete | `wave-plan` gate PASS with zero blockers | wave count or Matter count exceeds limit |
| NWR-04 | Dry-run input | gate available, pending exact local refs | `next-wave-dryrun-inputs` gate PASS | raw path, filename, object key, document text, or tenant-private value would enter repo |
| NWR-05 | Dry-run execution | not run | no Vault DB write and no Vault storage write | blocked/retryable rows lack approved handling |
| NWR-06 | Write decision | pending separate approval | explicit operator approval request only | approval bundles write with cutover or AI indexing |

## Current Gate Result

Local-only receipt:
`.omo/evidence/BULK-SCOPE-APPROVAL/provisional-approve-complete/pilot-import-dry-run/post-target-resolution/next-wave-readiness-gate.sanitized.json`

Expected sanitized result:

- LC ID: `LC-ONEDRIVE-09`
- mode: `wave-plan`
- gate: `pass`
- blockers: `0`
- wave count: `1`
- max Matters per wave: `3`
- first allowed scope: `batch_after_pilot_validation`
- source-of-truth policy: `onedrive_read_only_until_cutover_ref`

The gate proves only that a bounded next-wave plan is structurally eligible. It
does not approve the exact batch or perform a dry-run/import.

## Approval Values Needed Next

The operator must provide or record opaque refs for the exact next wave:

| Field | Required Value Shape | Notes |
|---|---|---|
| `customer_scope_ref` | external approval/ticket/ref id | Must approve one named bounded Matter batch only. |
| `freeze_window_ref` | freeze window ref id | Must cover dry-run timing and change freeze expectations. |
| `batch_mapping_ref` | local mapping evidence ref | Must resolve exact candidate Matters without raw paths in repo. |
| `rollback_ref` | rollback/containment ref id | Must preserve audit and avoid hard delete. |
| `security_permission_ref` | security review ref id | Must cover permission, member, and ethical-wall checks. |
| `legal_data_ref` | legal-data/retention ref id | Must cover retention, legal-hold, and data handling. |
| `operator_dryrun_ref` | operator approval ref id | Must say dry-run only, no write/import/cutover/indexing. |

Approval text should be narrow:

```text
Approve OneDrive next-wave dry-run only for plan
onedrive-next-wave-readiness-20260625, scope_kind=matter_batch,
max_matters_per_wave=3, no Vault write/import, no customer-wide import,
no source-of-truth cutover, no Gemma indexing, no OneDrive connected-state,
and no Office open/save/sync claim.
```

## Next Command Shape

After the exact refs exist locally, validate the next wave plan:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode wave-plan \
  --run-id onedrive-next-wave-readiness-20260625 \
  --wave-plan <next-wave-plan.local.json> \
  --reconciliation-report <pilot-reconciliation.sanitized.json> \
  --gemma-readiness <pilot-gemma-readiness.sanitized.json> \
  --sanitized-out <next-wave-readiness-gate.sanitized.json>
```

Then validate the exact dry-run-only approval refs:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode next-wave-approval \
  --run-id onedrive-next-wave-readiness-20260625 \
  --approval <next-wave-approval.local.json> \
  --wave-gate <next-wave-readiness-gate.sanitized.json> \
  --sanitized-out <next-wave-approval.sanitized.json>
```

Then validate the local-only dry-run input refs:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode next-wave-dryrun-inputs \
  --run-id onedrive-next-wave-readiness-20260625 \
  --dryrun-inputs <next-wave-dryrun-inputs.local.json> \
  --approval-gate <next-wave-approval.sanitized.json> \
  --sanitized-out <next-wave-dryrun-inputs.sanitized.json>
```

Proceed to next-wave dry-run only if all three commands return
`gate_status=pass` with zero blockers and the operator separately approves the
exact bounded batch. Do not proceed to write/import from this packet.

The approval JSON must explicitly keep all execution boundaries closed:

```json
{
  "plan_id": "onedrive-next-wave-readiness-20260625",
  "scope_kind": "matter_batch",
  "matter_count": 2,
  "max_matters_per_wave": 3,
  "customer_scope_ref": "<external-ref>",
  "freeze_window_ref": "<external-ref>",
  "batch_mapping_ref": "<local-evidence-ref>",
  "rollback_ref": "<external-ref>",
  "security_permission_ref": "<external-ref>",
  "legal_data_ref": "<external-ref>",
  "operator_dryrun_ref": "<external-ref>",
  "dryrun_only": true,
  "vault_write_authorized": false,
  "customer_wide_import": false,
  "source_of_truth_cutover": false,
  "gemma_indexing": false,
  "onedrive_connected_state": false,
  "office_open_save_sync": false
}
```

The dry-run input JSON must also keep repo output metadata-only:

```json
{
  "plan_id": "onedrive-next-wave-readiness-20260625",
  "scope_kind": "matter_batch",
  "matter_count": 2,
  "max_matters_per_wave": 3,
  "manifest_ref": "<local-evidence-ref>",
  "batch_mapping_ref": "<local-evidence-ref>",
  "target_resolution_ref": "<local-evidence-ref>",
  "permission_review_ref": "<external-ref>",
  "legal_data_ref": "<external-ref>",
  "rollback_ref": "<external-ref>",
  "sanitized_receipt_destination_ref": "<local-evidence-ref>",
  "local_receipt_handling_ref": "<local-evidence-ref>",
  "operator_ref": "<external-ref>",
  "dryrun_only": true,
  "vault_write_authorized": false,
  "customer_wide_import": false,
  "source_of_truth_cutover": false,
  "gemma_indexing": false,
  "source_content_in_repo": false,
  "raw_paths_in_repo": false
}
```

## Hard Stops

Stop if:

- the batch includes more than 3 Matters;
- the batch is customer-wide, full-corpus, or all-Matters;
- any approval ref is placeholder-like or cannot be tied to the exact batch;
- source-of-truth cutover is included in the same approval;
- Gemma indexing execution is requested;
- rollback requires hard delete or audit mutation;
- repo output would include raw OneDrive paths, customer filenames, source
  object keys, document text, OCR excerpts, screenshots, tenant-private values,
  cookies, tokens, or secrets.
