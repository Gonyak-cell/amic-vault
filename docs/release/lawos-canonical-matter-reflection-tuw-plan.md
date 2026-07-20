# Law Firm OS Canonical Matter Reflection TUW Plan

Date: 2026-07-01
Status: planning baseline
Scope: Law Firm OS LazyCodex client/matter identity reflected into AMIC Vault

## Goal

Implement a Law Firm OS canonical client and Matter Code reflection lane for AMIC
Vault, using the Law Firm OS LazyCodex artifact and Matter app contract as the
source of truth for both values and format. The implementation must produce a
no-write preflight, a dry-run comparison, a guarded staging execute path,
idempotent replay proof, runtime lookup/upload/search smoke, permission negative
checks, rollback containment, and sanitized receipts without mutating customer
documents, file objects, OCR/text, OneDrive connected-state, Office sync state,
Gemma indexing state, or production go-live truth.

## Source Of Truth

The canonical source is Law Firm OS, not Vault.

- Source artifact:
  `/Users/jws/Documents/Codex/Law Firm OS/docs/lazycodex/evidence/matter-desktop/artifacts/amic-matter-code-candidates-2026-07-01.json`
- Source package:
  `/Users/jws/Documents/Codex/Law Firm OS/packages/matter/src/amic-matter-code-candidates.js`
- Source contract:
  `/Users/jws/Documents/Codex/Law Firm OS/contracts/matter-core-contract.json`
- Source revision:
  `amic_current_onedrive_matter_code_inventory_2026_07_01`
- Current source counts:
  `clients=99`, `matters=148`, `duplicates=0`, `over_120=0`,
  `review_required=0`
- Current axis counts:
  `LIT=99`, `Advisory=14`, `Dispute=7`, `DEAL=28`

## Canonical Matter Code Format

Vault must preserve the Law Firm OS format as-is. Do not rewrite it into the old
Vault `Civil/Criminal/Advisory/M&A` format. Do not rewrite `Advisory` to `ADV`.
Do not drop `Dispute`.

Allowed canonical formats:

```text
[client_short_name]/Advisory/[matter_detail_type_korean]
[client_short_name]/DEAL/[matter_detail_type_korean]
[client_short_name]/Dispute/[matter_detail_type_korean]
[client_short_name]/LIT/[CIV|CRM|ADM]/[matter_detail_type_korean]
```

Law Firm OS aliases may be accepted only at import/validation edges when the
source contract accepts them, but Vault stored projection values must match the
canonical source artifact.

## Non-Goals And Hard Stops

- No customer document import, re-import, storage write, or file object rewrite.
- No document body, OCR/text excerpt, raw object key, screenshot, token, secret,
  or tenant-private raw path in repo receipts or logs.
- No external sharing, VDR, secure link, or external-user behavior.
- No OneDrive connected-state, Office open/save/sync, Gemma indexing execution,
  production go-live, or public release claim.
- No hard delete. Rollback is projection containment only.
- Stop if Law Firm OS source revision changes without an explicit new freeze.
- Stop if Vault would need to remap existing document `matter_id` values without
  a separate owner-approved migration plan.

## Implementation Surfaces

Planned Vault surfaces:

- `tools/migration/lawos-canonical-matter-reflection.mjs`
- `tools/migration/lawos-canonical-matter-reflection.spec.mjs`
- `docs/release/lawos-canonical-matter-reflection-tuw-plan.md`
- `.omo/evidence/LAWOS-CANONICAL-MATTER-REFLECTION/*` local receipts

Optional package/script surfaces if the implementation needs shared validation:

- `packages/shared/src/matter/lawos-matter-code.ts`
- `packages/shared/src/matter/lawos-matter-code.spec.ts`
- `package.json` scripts:
  `matter:lawos-reflection`, `matter:lawos-reflection:dry-run`,
  `matter:lawos-reflection:closeout`

Do not modify `docs/package/**`.

## TUW Breakdown

### LCX-LAWOS-VLT-00: Source Freeze And Receipt

Objective:

Freeze the exact Law Firm OS LazyCodex artifact and source revision that Vault
will reflect.

Tasks:

- Read the Law Firm OS JSON artifact.
- Verify top-level `source_revision`, `client_count`, `matter_count`, and
  `axis_counts`.
- Compute a source artifact hash.
- Produce a sanitized source-freeze receipt with counts and hashes only.
- Record that Law Firm OS is canonical for both identity and matter-code format.

Write behavior:

- No Vault DB write.
- No Law Firm OS write.

Acceptance:

```text
source_revision = amic_current_onedrive_matter_code_inventory_2026_07_01
source_clients = 99
source_matters = 148
source_duplicate_matter_codes = 0
source_over_120 = 0
receipt_leak_scan = PASS
```

### LCX-LAWOS-VLT-01: Canonical Format Mirror

Objective:

Mirror the Law Firm OS canonical Matter Code validator into Vault so dry-run and
execute use the same format contract.

Tasks:

- Implement or import a validator for:
  `Advisory`, `DEAL`, `Dispute`, and `LIT/CIV|CRM|ADM`.
- Validate segment count, non-empty segments, slash-free segment values, NFC
  normalization, max length `120`, and duplicate detection.
- Add unit tests for accepted and rejected examples.
- Add explicit tests proving `client/ADV/detail`, `client/Civil/detail`, and
  `client/LIT/detail` are not stored canonical forms.

Write behavior:

- Source code and tests only.
- No DB write.

Acceptance:

```text
lawos_format_validator_tests = PASS
invalid_old_vault_format_rejected = PASS
advisory_not_rewritten_to_adv = PASS
dispute_retained = PASS
```

### LCX-LAWOS-VLT-02: Reflection Manifest Builder

Objective:

Convert the Law Firm OS source artifact into a Vault reflection manifest without
changing canonical Matter Codes.

Tasks:

- Build one client manifest row per Law Firm OS client.
- Build one matter manifest row per Law Firm OS matter.
- Preserve `matter_code`, `matter_axis`, `matter_litigation_axis`,
  `matter_detail_type_korean`, `client_case_role`, confidence, status, and source
  lane metadata.
- Generate stable idempotency keys from tenant id, source revision, source ids,
  and canonical matter code.
- Store local details as `.local.ndjson.gz`; store only hashes/counts in
  `.sanitized.json`.

Write behavior:

- Local receipt files only.
- No DB write.

Acceptance:

```text
manifest_clients = 99
manifest_matters = 148
manifest_format_errors = 0
manifest_duplicate_matter_codes = 0
manifest_review_required = 0
manifest_receipt_leak_scan = PASS
```

### LCX-LAWOS-VLT-03: Vault Snapshot And Drift Check

Objective:

Capture current Vault client/matter projection state and compare it with the
Law Firm OS manifest.

Tasks:

- Read `clients` and `matters` for the target tenant.
- Count existing old-format Vault Matter Codes.
- Count existing Law Firm OS canonical-format Matter Codes.
- Detect `matter_code` duplicates, client-name collisions, missing clients,
  orphan matters, and existing document links per matter.
- Produce a no-write drift report.

Write behavior:

- No DB write.

Acceptance:

```text
vault_snapshot_loaded = PASS
duplicate_existing_matter_codes = 0
document_link_counts_recorded = PASS
dry_run_write_count = 0
receipt_leak_scan = PASS
```

### LCX-LAWOS-VLT-04: Upsert Plan And Collision Resolution

Objective:

Plan exactly which Vault clients and matters would be created, reused, or
updated, without executing the plan.

Tasks:

- Match clients by Law Firm OS source id, existing projection metadata, and
  normalized display/short name.
- Match matters by Law Firm OS source id, existing projection metadata, and
  canonical Matter Code.
- Mark any ambiguous client/matter match as blocked.
- Mark any update that would require document `matter_id` reassignment as
  blocked.
- Produce a human-readable action summary and machine-readable plan.

Write behavior:

- No DB write.

Acceptance:

```text
planned_clients = 99
planned_matters = 148
ambiguous_client_matches = 0
ambiguous_matter_matches = 0
document_matter_id_remap_required = 0
blocked_actions = 0
```

### LCX-LAWOS-VLT-05: Execute Gate

Objective:

Fail closed unless the operator, tenant, approval reference, source revision, and
preflight receipts are all explicit.

Tasks:

- Require `--tenant-id`.
- Require `--operator-user-id`.
- Require `--approval-ref`.
- Require matching source-freeze and dry-run receipts.
- Verify operator is active and has `firm_admin` or `matter_owner`.
- Verify execution mode is explicit via `--execute`.
- Record before counts.

Write behavior:

- No client/matter write until all checks pass.

Acceptance:

```text
missing_execute_flag_blocks = PASS
missing_approval_ref_blocks = PASS
operator_role_gate = PASS
source_revision_gate = PASS
before_counts_recorded = PASS
```

### LCX-LAWOS-VLT-06: Client Projection Execute

Objective:

Create or reuse Vault client projection rows for the 99 Law Firm OS clients.

Tasks:

- Upsert clients tenant-scoped.
- Preserve existing Vault client ids where a safe match exists.
- Store reference-only metadata:
  `lawosSourceRevision`, `lawosClientId`, `lawosClientShortNameHash`,
  `lawosMappingHash`, `migrationRunId`.
- Write `LAWOS_CLIENT_REFLECTED` audit events with reference-only metadata.
- Keep the action idempotent.

Write behavior:

- Writes `clients` and `audit_events` only.

Acceptance:

```text
lawos_clients_resolved = 99
client_projection_metadata_written = 99
client_audit_events_written = 99
client_duplicate_create_count = 0
```

### LCX-LAWOS-VLT-07: Matter Projection Execute

Objective:

Create, reuse, or safely update Vault matter projection rows for the 148 Law
Firm OS matters while preserving Law Firm OS Matter Codes exactly.

Tasks:

- Resolve each matter's Vault client id from LCX-LAWOS-VLT-06.
- Store `matter_code` exactly as Law Firm OS canonical value.
- Map Vault internal `matter_type` only for operational filtering:
  `Advisory -> advisory`, `DEAL -> ma`, `Dispute -> litigation` or `other`
  only if the implementation documents the chosen local enum mapping,
  `LIT/CIV -> litigation`, `LIT/CRM -> investigation`,
  `LIT/ADM -> litigation`.
- Store Law Firm OS axis and litigation sub-axis in metadata so no information is
  lost to the local enum.
- Write `LAWOS_MATTER_REFLECTED` audit events with reference-only metadata.

Write behavior:

- Writes `matters` and `audit_events` only.
- Does not write documents, document versions, file objects, storage, search
  index, AI prep, or source cutover rows.

Acceptance:

```text
lawos_matters_resolved = 148
lawos_matter_codes_preserved = 148
matter_projection_metadata_written = 148
matter_audit_events_written = 148
document_mutation_count = 0
file_object_mutation_count = 0
```

### LCX-LAWOS-VLT-08: Projection Invariants

Objective:

Prove Vault projection rows still satisfy tenant isolation, uniqueness, and
document linkage invariants.

Tasks:

- Verify `(tenant_id, matter_code)` uniqueness.
- Verify every reflected matter has a reflected/resolved client.
- Verify no document row lost its matter reference.
- Verify no existing linked matter was duplicated by Matter Code.
- Verify metadata contains no forbidden keys or raw content.

Write behavior:

- No DB write.

Acceptance:

```text
tenant_matter_code_duplicate_groups = 0
reflected_matters_without_client = 0
document_rows_lost_matter = 0
forbidden_metadata_keys = 0
receipt_leak_scan = PASS
```

### LCX-LAWOS-VLT-09: Replay And Idempotency

Objective:

Re-run the same execute plan and prove it reuses existing projections instead of
creating duplicates.

Tasks:

- Run the execute command again with the same `migrationRunId` or replay mode.
- Compare before/after counts.
- Verify idempotency keys return reused/skipped outcomes.
- Store replay receipt.

Write behavior:

- No net new client/matter rows.
- Audit may record bounded replay checks if the implementation uses audit for
  replay proof.

Acceptance:

```text
replay_duplicate_client_creates = 0
replay_duplicate_matter_creates = 0
replay_projection_drift = 0
replay_receipt_leak_scan = PASS
```

### LCX-LAWOS-VLT-10: Runtime Lookup And Upload Preflight Smoke

Objective:

Prove Vault runtime can use Law Firm OS canonical Matter Codes for ordinary
Matter lookup and upload preflight without storage writes.

Tasks:

- Run Matter Code lookup for representative `LIT`, `Advisory`, `Dispute`, and
  `DEAL` codes.
- Verify lookup returns safe labels only.
- Run upload preflight with a selected reflected matter.
- Verify upload preflight checks permission and source readiness but does not
  write storage.

Write behavior:

- No storage write.
- No document import.

Acceptance:

```text
lookup_lit = PASS
lookup_advisory = PASS
lookup_dispute = PASS
lookup_deal = PASS
upload_preflight_no_storage_write = PASS
safe_label_only = PASS
```

### LCX-LAWOS-VLT-11: Permission And Ethical Wall Negative Smoke

Objective:

Prove reflected Matter Codes do not weaken Vault permission, tenant, or ethical
wall boundaries.

Tasks:

- Run same-tenant unauthorized user lookup negative.
- Run cross-tenant lookup negative.
- Run ethical-wall excluded principal lookup negative if wall fixture exists.
- Verify denied responses do not leak counts or raw labels.

Write behavior:

- No DB write except optional bounded test audit if an existing smoke harness
  records access-denied audit.

Acceptance:

```text
unauthorized_lookup_denied = PASS
cross_tenant_lookup_denied = PASS
ethical_wall_lookup_denied = PASS_OR_NOT_APPLICABLE_WITH_REASON
denied_count_leak = 0
denied_label_leak = 0
```

### LCX-LAWOS-VLT-12: Search And Files Surface Smoke

Objective:

Prove user-facing Vault surfaces accept the Law Firm OS canonical Matter Code
format.

Tasks:

- Verify `/files?matterCode=<lawos-code>` pre-fills or selects the reflected
  matter.
- Verify search filter accepts 4-segment `LIT/CIV|CRM|ADM` codes.
- Verify `Advisory`, `Dispute`, and `DEAL` codes survive URL encoding/decoding.
- Verify no UUID-shaped internal reference appears as the primary user label.

Write behavior:

- No DB write.

Acceptance:

```text
files_prefill_lawos_code = PASS
search_filter_lit_four_segment = PASS
search_filter_advisory_dispute_deal = PASS
internal_uuid_primary_label = 0
```

### LCX-LAWOS-VLT-13: Closeout Receipt

Objective:

Create the final sanitized receipt and make the truth boundary explicit.

Tasks:

- Summarize source counts, plan counts, execute counts, replay counts, and smoke
  results.
- Include artifact hashes and receipt paths.
- Include blocked/non-claim fields for production, OneDrive connected-state,
  Office sync, Gemma indexing, and public/go-live release.
- Include rollback command and containment scope.

Write behavior:

- Receipt files only.

Acceptance:

```text
final_status = PASS
lawos_clients_reflected = 99
lawos_matters_reflected = 148
duplicate_create_count = 0
document_mutation_count = 0
receipt_leak_scan = PASS
production_go_live_claim = false
```

### LCX-LAWOS-VLT-14: Rollback Containment

Objective:

Provide a bounded rollback for Vault projection metadata and newly-created
unlinked projection rows only.

Tasks:

- Remove Law Firm OS projection metadata keys for the migration run.
- Revert matter codes only when a before snapshot proves the previous value and
  no document remap is required.
- Delete newly-created projection rows only if they have no document/file/search
  dependencies and no legal hold.
- Never delete Law Firm OS canonical records.
- Never delete customer documents or file objects.

Write behavior:

- Optional rollback writes to `clients`, `matters`, and `audit_events` only.

Acceptance:

```text
rollback_scope = Vault projection only
lawos_canonical_delete = 0
document_delete = 0
file_object_delete = 0
rollback_receipt_leak_scan = PASS
```

## Suggested Command Shape

```bash
pnpm matter:lawos-reflection -- \
  --source-json "/Users/jws/Documents/Codex/Law Firm OS/docs/lazycodex/evidence/matter-desktop/artifacts/amic-matter-code-candidates-2026-07-01.json" \
  --tenant-id "<tenant_uuid>" \
  --operator-user-id "<operator_uuid>" \
  --approval-ref "<approval_ref>" \
  --output-dir ".omo/evidence/LAWOS-CANONICAL-MATTER-REFLECTION/dry-run"

pnpm matter:lawos-reflection -- \
  --source-json "/Users/jws/Documents/Codex/Law Firm OS/docs/lazycodex/evidence/matter-desktop/artifacts/amic-matter-code-candidates-2026-07-01.json" \
  --tenant-id "<tenant_uuid>" \
  --operator-user-id "<operator_uuid>" \
  --approval-ref "<approval_ref>" \
  --migration-run-id "<run_id>" \
  --output-dir ".omo/evidence/LAWOS-CANONICAL-MATTER-REFLECTION/execute" \
  --execute
```

## Global Acceptance Gate

The full implementation is complete only when all of the following are true:

```text
Law Firm OS source revision pinned = PASS
Law Firm OS format preserved = PASS
clients reflected = 99
matters reflected = 148
tenant matter_code duplicate groups = 0
manifest/replay/closeout leak scans = PASS
document rows mutated = 0
file object rows mutated = 0
storage writes = 0
permission negative smoke = PASS
runtime lookup/preflight smoke = PASS
replay duplicate creates = 0
rollback containment available = PASS
production_go_live_claim = false
onedrive_connected_state_claim = false
office_open_save_sync_claim = false
gemma_indexing_execution_claim = false
```

## Implementation Goal Prompt

AMIC Vault에 Law Firm OS LazyCodex canonical client/matter identity reflection을
구현한다. 기준 문서는
`docs/release/lawos-canonical-matter-reflection-tuw-plan.md`이며, Law Firm OS
source artifact
`/Users/jws/Documents/Codex/Law Firm OS/docs/lazycodex/evidence/matter-desktop/artifacts/amic-matter-code-candidates-2026-07-01.json`
과 source revision `amic_current_onedrive_matter_code_inventory_2026_07_01`을
포맷까지 Source of Truth로 고정한다. Vault는 Law Firm OS canonical Matter Code
포맷 `[client]/Advisory/[detail]`, `[client]/DEAL/[detail]`,
`[client]/Dispute/[detail]`, `[client]/LIT/[CIV|CRM|ADM]/[detail]`을 그대로
보존해야 하며 `Advisory -> ADV` 또는 `LIT/CIV -> Civil` 같은 재정규화를 하면
안 된다. `tools/migration/lawos-canonical-matter-reflection.mjs`와 테스트,
package scripts, sanitized receipts를 구현하고, no-write preflight, dry-run,
guarded execute, projection invariant checks, replay/idempotency proof,
runtime lookup/upload-preflight/search/files smoke, permission/ethical-wall
negative smoke, rollback containment, final closeout receipt까지 완료한다. 이
작업은 identity/projection 반영만 수행하며 customer document import/re-import,
storage write, file object mutation, OneDrive connected-state claim, Office
open/save/sync claim, Gemma indexing execution claim, production go-live/public
release claim을 하지 않는다.
