# Matter App Migration DB Linkage TUW Plan

Date: 2026-06-29

## Scope

This plan connects the completed AMIC Vault migration database to the Matter app
canonical client/matter identity surface. The imported Vault document corpus is
already present in local Vault DB and is linked internally through:

- `clients`
- `matters.client_id`
- `documents.matter_id`
- `document_versions`
- `file_objects`
- `canonical_documents`
- `document_search_index`
- `ai_prep_artifacts`

The work here is not another document import. It is a Matter app linkage and
runtime verification package.

## Current Local Baseline

Local Vault DB baseline to preserve:

| Metric | Count |
| --- | ---: |
| `clients` | 80 |
| `matters` | 123 |
| `matters_with_client` | 123 |
| `matters_without_client` | 0 |
| `active_documents` | 22,299 |
| `docs_with_matter` | 22,299 |
| `docs_without_matter` | 0 |
| `document_matter_count` | 123 |
| `canonical_extraction_ready` | 22,299 |
| `search_indexed_documents` | 22,299 |
| `ai_allowed_documents` | 22,299 |
| `docs_with_all_4_real_gemma` | 22,299 |
| `real_gemma_outputs` | 89,196 |
| `fallback_payloads` | 0 |

Customer-wide import/cutover baseline:

| Metric | Value |
| --- | ---: |
| `approved_scope_rows` | 22,403 |
| `imported_or_reused_count` | 22,286 |
| `allowed_skipped_count` | 117 |
| `blocked_count` | 0 |
| `failed_count` | 0 |
| `vault_source_of_truth` | true |
| `onedrive_connected_state_claimed` | false |
| `office_open_save_sync_claimed` | false |

## Source Contract

Normative source:

- `docs/integrations/matter-app-vault-contract.md`
- `docs/release/matter-vault-linkage-plan.md`

Matter app remains the canonical source for Matter Code and matter profile
identity. Vault may hold a local projection for document joins, permission
checks, search facets, audit refs, and offline-safe display. The local Vault
projection is not a competing Matter registry.

Preferred runtime mode:

- `MATTER_APP_SOURCE_MODE=matter_app_api`

Supported but not preferred:

- `MATTER_APP_SOURCE_MODE=matter_app_event_projection`

Development fallback only:

- `MATTER_APP_SOURCE_MODE=vault_projection_only`

## Required Matter App Bridge

The Matter app side must expose the approved bridge endpoints:

- `GET /api/matters/vault-bridge/status`
- `POST /api/matters/vault-bridge/clients/upsert`
- `POST /api/matters/vault-bridge/matters/upsert`

Secrets and runtime values must not be committed or written to receipts:

- `MATTER_APP_API_BASE_URL`
- `MATTER_APP_API_TOKEN`
- `LAWOS_VAULT_BRIDGE_TOKEN`

## Final End State

The end state is:

1. The Matter app has canonical client identities corresponding to the 80 Vault
   clients.
2. The Matter app has canonical matter identities corresponding to the 123 Vault
   matters.
3. Vault `matters.metadata_json` stores reference-only Matter app identity refs
   and source revision data for each synced matter.
4. Vault lookup/status surfaces operate in `matter_app_api` mode and are fresh.
5. Matter Code picker and upload preflight resolve the same matter identity used
   by the migrated document corpus.
6. Permission-before-search and permission-before-upload remain SQL/service
   enforced.
7. No raw path, customer document body, OCR/text excerpt, screenshot, object
   key, token, secret, or tenant-private raw value is stored in repo receipts.

## TUW Plan

## Implementation Surface Map

The implementation is split into no-write gates, bounded bridge write, runtime
smoke, and final closeout. This keeps Matter app canonical identity linkage
separate from document import, storage writes, OneDrive connected-state, Office
sync, and Gemma execution.

| TUW | Implementation surface | Write behavior | Primary receipt |
| --- | --- | --- | --- |
| `MATTER-BRIDGE-001` | `pnpm matter:identity-preflight` bridge status/auth section | No write | `identity-preflight.sanitized.json` |
| `MATTER-BRIDGE-002` | `pnpm matter:identity-preflight` client export/preflight section | No write | `identity-preflight.sanitized.json` and `.local.ndjson.gz` details |
| `MATTER-BRIDGE-003` | `pnpm matter:identity-preflight` matter export/preflight section | No write | `identity-preflight.sanitized.json` and `.local.ndjson.gz` details |
| `MATTER-BRIDGE-004` | `pnpm matter:canonical-sync -- --execute` | Matter app upsert and Vault projection sync only | `canonical-upsert-sync.sanitized.json` |
| `MATTER-BRIDGE-005` | Runtime env plus `/v1/integrations/matter-app/status` | No DB write | API status smoke in final closeout |
| `MATTER-BRIDGE-006` | Authenticated Matter app lookup smoke | No write | `matter-app-migration-db-linkage-closeout.sanitized.json` |
| `MATTER-BRIDGE-007` | Permission/ethical-wall negative smoke | No write | `matter-app-migration-db-linkage-closeout.sanitized.json` |
| `MATTER-BRIDGE-008` | Upload preflight smoke | No storage write | `matter-app-migration-db-linkage-closeout.sanitized.json` |
| `MATTER-BRIDGE-009` | Migrated document read/search smoke | No write | `matter-app-migration-db-linkage-closeout.sanitized.json` |
| `MATTER-BRIDGE-010` | Re-run bridge write in dry-run/replay mode | No duplicate create | bridge replay receipt |
| `MATTER-BRIDGE-011` | `pnpm matter:bridge-closeout` | No write except temporary test session/role control | final sanitized closeout |
| `MATTER-BRIDGE-012` | `pnpm matter:canonical-rollback` | Optional Vault projection metadata rollback only | `canonical-projection-rollback.sanitized.json` |

### Current Implementation Chain

1. Run `pnpm matter:identity-preflight -- --tenant-id <tenant_uuid>` to freeze
   identity-only Vault counts, client/matter hashes, duplicate checks, and Matter
   app bridge status. This command never writes to Vault or Matter app.
2. If preflight status is `pass`, run
   `pnpm matter:canonical-sync` without `--execute` to produce a no-write
   upsert/projection sync plan from the current Vault canonical identity rows.
3. After explicit approval and live Matter app API readiness, run
   `pnpm matter:canonical-sync -- --execute` to upsert
   clients/matters and sync Vault projection refs. This command must remain
   identity-only and must not import or rewrite customer documents.
4. Re-run the same write runner in replay/dry-run mode to prove duplicate
   creates are zero.
5. Run `pnpm matter:bridge-closeout` to verify runtime status, lookup,
   permission negative, upload preflight, migrated document read/search, replay,
   and leak scan gates.
6. Keep `pnpm matter:canonical-rollback` ready as the rollback/containment
   surface. It removes only Vault projection metadata and does not delete Matter
   app canonical registry records.

### No-Write Identity Preflight Command

```bash
pnpm matter:identity-preflight -- \
  --tenant-id <tenant_uuid> \
  --sanitized-out .omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/identity-preflight.sanitized.json \
  --details .omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/identity-preflight.local.ndjson.gz
```

Required runtime values for bridge status:

- `MATTER_APP_API_BASE_URL`
- `MATTER_APP_API_TOKEN`

If these are missing, the preflight still writes a sanitized blocked receipt
with DB identity counts and `matter_app_api_config_missing`, but it does not
perform any write.

### Matter App Canonical Sync Command

```bash
pnpm matter:canonical-sync -- \
  --tenant-id <tenant_uuid> \
  --operator-user-id <operator_user_uuid> \
  --approval-ref <approval_ref> \
  --identity-preflight .omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/identity-preflight.sanitized.json \
  --receipt .omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/bridge-execute/canonical-upsert-sync.sanitized.json \
  --details .omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/bridge-execute/canonical-upsert-sync.local.ndjson.gz
```

Execution requires the same command plus `--execute`. The command reads existing
Vault `clients` and `matters`, upserts or reuses the matching canonical Matter
app records through the bridge API, and stores reference-only Matter app ids and
source revisions in Vault projection metadata. It must not create local Vault
clients/matters, import documents, rewrite file objects, claim OneDrive
connected-state, claim Office sync, or run Gemma indexing.

### Matter App Projection Rollback Command

```bash
pnpm matter:canonical-rollback -- \
  --tenant-id <tenant_uuid> \
  --operator-user-id <operator_user_uuid> \
  --bridge-execute-receipt .omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/bridge-execute/canonical-upsert-sync.sanitized.json \
  --rollback-approval-ref <rollback_approval_ref> \
  --receipt .omo/evidence/MATTER-APP-MIGRATION-DB-LINKAGE/bridge-rollback/canonical-projection-rollback.sanitized.json
```

Execution requires the same command plus `--execute`. This is a containment
surface for Vault projection metadata only. It removes Matter app reference keys
from Vault `clients.metadata_json` and `matters.metadata_json`, records
reference-only audit rows, and leaves Matter app canonical registry records
untouched. Use it only after an executed canonical sync receipt exists and a
rollback approval ref is supplied.

### MATTER-BRIDGE-001: Bridge Runtime Preflight

Objective:

Verify that the Matter app bridge exists, is reachable, and is authenticated
without storing secrets.

Implementation:

- Add or reuse a Vault-side bridge preflight runner.
- Read `MATTER_APP_API_BASE_URL` and `MATTER_APP_API_TOKEN` only from runtime env.
- Call `GET /api/matters/vault-bridge/status`.
- Confirm the response advertises client/matter upsert capability, tenant scope,
  source revision, and owner-approved bridge mode.
- Fail closed on missing env, auth failure, stale bridge, unsupported contract,
  or non-reference-safe response.

Verification:

- Dry-run receipt: bridge unavailable cases return `blocked`.
- Authenticated status receipt: `bridge_status_pass=true`.
- Receipt contains counts, status codes, source revision hash/ref only.
- Receipt contains no token, raw URL with credentials, cookies, customer body,
  raw path, object key, or tenant-private raw labels.

Acceptance:

```text
matter_app_bridge_status = PASS
bridge_auth = PASS
client_upsert_supported = true
matter_upsert_supported = true
secret_leak_scan = PASS
```

### MATTER-BRIDGE-002: Vault-To-Matter Client Upsert Dry Run

Objective:

Prepare a deterministic upsert plan for the 80 Vault clients.

Implementation:

- Select active tenant-local Vault clients.
- Normalize client display labels without mutating the DB during dry-run.
- Build idempotency keys from tenant id, Vault client id, and client display
  hash/ref.
- Call Matter app client upsert in dry-run or validation mode if supported;
  otherwise build a Vault-side no-write plan.
- Detect duplicate client candidates and ambiguous client labels.

Verification:

- Selected clients: 80.
- Duplicate/ambiguous client count: 0.
- Dry-run creates no Vault DB mutation and no Matter app write unless bridge
  explicitly supports no-op validation.

Acceptance:

```text
selected_clients = 80
client_duplicate_count = 0
client_ambiguity_count = 0
dry_run_write_count = 0
receipt_leak_scan = PASS
```

### MATTER-BRIDGE-003: Vault-To-Matter Matter Upsert Dry Run

Objective:

Prepare a deterministic upsert plan for the 123 Vault matters and their linked
clients.

Implementation:

- Select `matters` joined to `clients`.
- Verify `matters.client_id` is present for all rows.
- Verify `(tenant_id, matter_code)` uniqueness.
- Build matter upsert payloads using Matter Code, matter display name, client
  canonical candidate ref, status, practice group/source metadata if available,
  and idempotency key.
- Dry-run conflict detection for duplicate Matter Code, missing client mapping,
  closed/disposal states, and source revision mismatch.

Verification:

- Selected matters: 123.
- Matters with client: 123.
- Matter code duplicate count: 0.
- Missing client mapping count: 0.

Acceptance:

```text
selected_matters = 123
matters_with_client = 123
matter_code_duplicate_count = 0
missing_client_mapping_count = 0
dry_run_write_count = 0
receipt_leak_scan = PASS
```

### MATTER-BRIDGE-004: Client/Matter Upsert Execute

Objective:

Create or reuse the 80 clients and 123 matters in the Matter app, then store
reference-only canonical Matter app refs in Vault projection.

Implementation:

- Execute client upserts first.
- Execute matter upserts after client canonical ids are resolved.
- Store Matter app ids and source revision in Vault `clients.metadata_json` or
  `matters.metadata_json` when those fields exist; otherwise add the minimal
  migration-safe schema or use the established metadata column.
- Do not overwrite local Vault matter ids.
- Do not alter document rows or file objects.
- Record reference-only audit rows for bridge sync.

Verification:

- Client upsert created/reused count totals 80.
- Matter upsert created/reused count totals 123.
- Vault projection synced count totals 123.
- Re-run execute is idempotent and produces reused/skipped, not duplicates.

Acceptance:

```text
matter_app_clients_resolved = 80
matter_app_matters_resolved = 123
vault_projection_synced_matters = 123
duplicate_create_count = 0
document_mutation_count = 0
receipt_leak_scan = PASS
```

### MATTER-BRIDGE-005: Vault Runtime Gate Switch

Objective:

Switch Vault local runtime from projection fallback to Matter app API mode for
lookup and mutation gating.

Implementation:

- Set runtime env:
  - `MATTER_APP_SOURCE_MODE=matter_app_api`
  - `MATTER_APP_SOURCE_CONFIGURED=true`
  - `MATTER_APP_RUNTIME_READY=true`
  - `MATTER_APP_API_BASE_URL`
  - `MATTER_APP_API_TOKEN`
- Do not commit env files with real values.
- Confirm production does not use `vault_projection_only`.
- Confirm source freshness is within `MATTER_APP_STALENESS_MAX_SECONDS`.

Verification:

- `/v1/integrations/matter-app/status` returns source available.
- `uploadAuthoritative=true`.
- `sourceStale=false`.
- No token or secret appears in logs/receipts.

Acceptance:

```text
matter_app_status = PASS
source_mode = matter_app_api
source_available = true
upload_authoritative = true
source_stale = false
projection_fallback_allowed_in_production = false
```

### MATTER-BRIDGE-006: Authenticated Lookup Smoke

Objective:

Prove that authenticated Matter app lookup resolves migrated DB matters through
the canonical Matter app source and local Vault projection.

Implementation:

- Use an authenticated AMIC user with matter membership.
- Search by Matter Code.
- Search by matter name.
- Search by client name.
- Verify result contains the same Vault `matter_id`, Vault `client_id`, Matter
  app matter ref, Matter Code, and safe display labels.
- Verify UUID-shaped user input returns safe empty/validation behavior.

Verification:

- Positive lookup result count greater than 0.
- Matter Code/name/client searches all resolve expected projection rows.
- Denied/internal UUID input does not leak labels/counts.

Acceptance:

```text
matter_code_lookup = PASS
matter_name_lookup = PASS
client_name_lookup = PASS
uuid_input_rejected_or_safe_empty = PASS
label_leakage = false
```

### MATTER-BRIDGE-007: Permission And Ethical Wall Negative Tests

Objective:

Prove permission-before-search and ethical-wall filtering still apply after
Matter app linkage.

Implementation:

- Run lookup as a permitted member.
- Run lookup as a non-member or restricted user.
- Run lookup against a matter blocked by ethical-wall policy when available.
- Confirm SQL-stage filters remain present.

Verification:

- Permitted user sees permitted matters.
- Non-member receives safe empty or denied state.
- Ethical wall blocked matter is not returned.
- Tests assert SQL includes membership and ethical-wall predicates before
  result construction.

Acceptance:

```text
member_positive_lookup = PASS
non_member_negative_lookup = PASS
ethical_wall_negative_lookup = PASS
permission_sql_filter_present = true
ethical_wall_sql_filter_present = true
```

### MATTER-BRIDGE-008: Upload Preflight Smoke

Objective:

Prove migrated DB documents and future uploads use the same Matter app resolved
matter target.

Implementation:

- Use a synced matter with existing migrated documents.
- Request upload preflight through
  `/v1/matters/:matterId/documents/upload-preflight`.
- Confirm lifecycle/staleness, permission, ethical wall, and Matter app runtime
  gates pass.
- Confirm preflight ref is short-lived and reference-only.
- Run denied/closed/stale negative case when available.

Verification:

- Positive preflight returns `uploadEligible=true`.
- Permission denied returns fail-closed.
- Stale source returns blocked.
- No storage write is performed in this TUW.

Acceptance:

```text
upload_preflight_positive = PASS
permission_negative = PASS
stale_source_negative = PASS
storage_write_count = 0
preflight_ref_reference_only = true
```

### MATTER-BRIDGE-009: Migrated Document Read Surface Smoke

Objective:

Prove Matter app selected matters expose the migrated Vault document corpus.

Implementation:

- Resolve a Matter app matter through lookup.
- Query Vault document list/search scoped to the resolved local `matter_id`.
- Confirm document counts are non-zero for migrated matters.
- Confirm search/Gemma surfaces use the same matter/client projection.

Verification:

- Matter app lookup matter id maps to Vault projection matter id.
- Vault documents for that matter are visible to permitted user.
- Denied user cannot infer document labels/counts.

Acceptance:

```text
resolved_matter_documents_visible = PASS
search_scope_uses_resolved_matter = PASS
gemma_prep_refs_present = PASS
denied_user_leakage = false
```

### MATTER-BRIDGE-010: Idempotency Replay

Objective:

Prove client/matter bridge sync can be safely re-run.

Implementation:

- Re-run bridge client/matter sync in dry-run mode.
- Re-run execute if idempotency contract supports no-op reuse.
- Compare Vault projection refs before/after.

Verification:

- No duplicate Matter app clients.
- No duplicate Matter app matters.
- Vault projection refs remain stable.
- Audit records replay as reused/skipped, not new creates.

Acceptance:

```text
client_duplicate_create_count = 0
matter_duplicate_create_count = 0
projection_ref_changed_count = 0
replay_status = PASS
```

### MATTER-BRIDGE-011: Final Linkage Receipt

Objective:

Create a sanitized final receipt that proves Matter app canonical identity is
connected to the migrated Vault DB.

Implementation:

- Generate one final receipt under `.omo/evidence`.
- Include DB counts, bridge counts, lookup smoke results, preflight smoke
  results, replay results, and leak scan status.
- Include prohibited claim flags.

Verification:

- Receipt status `PASS`.
- Leak scan `PASS`.
- Tests/build `PASS`.
- Git diff check `PASS`.

Acceptance:

```text
final_receipt_status = PASS
matter_app_clients_resolved = 80
matter_app_matters_resolved = 123
vault_documents_linked = 22299
lookup_smoke = PASS
upload_preflight_smoke = PASS
replay_idempotency = PASS
leak_scan = PASS
```

### MATTER-BRIDGE-012: Projection Rollback / Containment

Objective:

Keep a bounded rollback surface for the bridge write that can remove Vault's
Matter app projection metadata without touching customer documents or deleting
Matter app canonical records.

Implementation:

- Require a passing `canonical-upsert-sync.sanitized.json` execute receipt.
- Require a rollback approval ref.
- Dry-run by default and report current projection ref counts.
- Execute only with `--execute`.
- Remove Matter app projection keys from Vault `clients.metadata_json` and
  `matters.metadata_json`.
- Record reference-only audit rows.
- Do not delete Matter app canonical registry rows.
- Do not mutate documents, document versions, file objects, search, or Gemma
  artifacts.

Verification:

- Dry-run receipt status `ready_for_execute`.
- Execute receipt status `PASS` when explicitly approved.
- `clients_with_projection_refs` and `matters_with_projection_refs` match the
  expected rollback scope before execute.
- Leak scan `PASS`.

Acceptance:

```text
rollback_surface_available = PASS
rollback_scope = Vault projection metadata only
matter_app_registry_delete = NOT_EXECUTED
document_mutation_count = 0
receipt_leak_scan = PASS
```

## Global Acceptance Gate

The whole package is complete only when all of the following are true:

```text
Vault clients = 80
Vault matters = 123
Vault matters_with_client = 123
Vault active_documents = 22299
Vault docs_with_matter = 22299
Matter app clients resolved = 80
Matter app matters resolved = 123
Vault projection synced matter app refs = 123
Matter app status sourceAvailable = true
Matter app status uploadAuthoritative = true
Matter app source stale = false
Matter code lookup PASS
Matter name lookup PASS
Client name lookup PASS
Upload preflight positive PASS
Permission negative PASS
Ethical wall negative PASS
Replay duplicate create count = 0
Receipt leak scan PASS
```

## Explicit Non-Claims

This package must not claim:

- OneDrive connected-state.
- Office open/save/sync.
- Production Matter app readiness unless live bridge auth/status and runtime
  smoke tests pass in that environment.
- Customer document re-import.
- New customer document storage writes.
- External sharing or source-of-truth ownership change beyond the Matter app
  identity bridge contract.

## Suggested Goal Text

Use this exact goal text when starting implementation:

```text
AMIC Vault Matter app migration DB linkage를 완료한다. 기준 문서는 docs/release/matter-app-migration-db-linkage-tuw-plan.md 이며, 현재 local Vault DB에 완료된 migrated corpus(clients=80, matters=123, active_documents=22,299, docs_with_matter=22,299, canonical/search/ai/Gemma closeout 완료)를 Matter app canonical client/matter identity와 연결한다. 목표는 Matter app bridge status/auth preflight, clients 80개 upsert/reuse, matters 123개 upsert/reuse, Vault projection에 Matter app canonical refs/source revision sync, matter_app_api runtime gate, authenticated lookup smoke, permission/ethical-wall negative tests, upload preflight smoke, migrated document read/search smoke, idempotency replay, final sanitized receipt까지 완료하는 것이다. raw path, customer document body, OCR/text excerpt, screenshot, object key, token/secret, tenant-private raw value를 repo/receipt/log에 저장하지 않는다. OneDrive connected-state 및 Office open/save/sync claim은 하지 않는다. customer document re-import 또는 new storage write는 하지 않는다. 모든 TUW는 generate -> execute -> verify -> challenge -> reconcile -> receipt 루프로 진행하며 final gate는 Matter app clients resolved=80, matters resolved=123, Vault projection synced=123, lookup/preflight/permission negative/replay/leak scan PASS다.
```
