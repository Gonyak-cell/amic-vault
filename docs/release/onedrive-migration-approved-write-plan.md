# OneDrive Migration Approved Mapping Write Plan

Status: PRE-WRITE PLANNING ONLY
Date: 2026-06-24
Goal: Create the approved-mapping write package for client and Matter identity only.
Basis:
- `docs/release/onedrive-migration-validation-tuw-plan.md`
- `docs/release/onedrive-migration-mapping-package.md`
- `docs/release/onedrive-migration-workbook-schemas.json`
- `docs/integrations/matter-app-vault-contract.md`
- `docs/release/onedrive-migration-write-schemas.json`

## Scope

This package plans how approved mapping rows become canonical Matter app client
and matter records, then Vault local projection references. It does not import
customer documents or files, move OneDrive content, perform a source-of-truth
cutover, claim OneDrive connected state, or claim Office open/save/sync support.

The Matter app remains the canonical source for Matter Code, matter profile
identity, client identity, status, and lifecycle state. Vault must not create a
separate Matter Code namespace. Vault may keep a local projection only for
permission checks, document joins, search facets, audit references, and offline
display.

If the Matter app write API, approved event projection, authentication, tenant
scope, or runtime readiness cannot be verified, actual writes are blocked. A
dry-run may still produce reference-only receipts and blocked-row reports.

## Inputs

Only rows from the approved mapping workbook are eligible.

Required input fields:

| Field | Use |
|---|---|
| `approval_row_id` | Stable row reference for receipts and replay |
| `tenant_ref` | Approved tenant reference or hash; no private tenant value in repo |
| `migration_operator_ref` | Approved operator reference or hash |
| `client_name_candidate` | Approved display candidate for Matter app client matching |
| `client_short_name_candidate` | Approved short name for Matter Code generation |
| `matter_type_english` | Broad matter type; must match the approved Matter/Vault vocabulary |
| `matter_detail_type_korean` | Korean detail type derived from internal-document evidence |
| `matter_code_candidate` | Approved code in `[client]/[type]/[detail]` format |
| `matter_name_candidate` | Approved display label for the matter |
| `approval_ref` | Human approval receipt or workbook reference |
| `mapping_candidate_hash` | Idempotency and trace reference |
| `source_lane` | Must not be `legacy_archive_only` |

Excluded input states:

- `archive_only`
- `legacy_archive_only`, including `999_이전 자료들`
- `needs_review`
- `blocked`
- `deferred`
- any row missing internal-document evidence approval

## Approved Row Predicate

An input row may enter write dry-run only when all conditions hold:

```text
overall_approval_state = approved
AND source_lane != legacy_archive_only
AND archive_only = false
AND client_approval_state = approved
AND matter_type_approval_state = approved
AND matter_detail_approval_state = approved
AND matter_code_approval_state = approved
AND evidence_conflict_state = resolved
AND permission_wall_hold_review_complete = true
AND mapping_candidate_hash present
AND approval_ref present
```

Any failed condition produces `blocked`, `needs_review`, or `archive_only`; it
does not produce a Matter app or Vault write.

## Source-Of-Truth Write Order

1. Load approved mapping workbook rows into a local, redacted working dataset.
2. Validate row eligibility, code format, code length, type vocabulary, archive
   exclusion, and evidence references.
3. Check Matter app runtime/capability gate.
4. Resolve or create the canonical Matter app client.
5. Resolve or create the canonical Matter app matter under that client.
6. Sync or refresh the Vault local matter projection using the canonical Matter
   app matter id and source revision.
7. Write reference-only receipts for create, reuse, skip, block, and conflict
   outcomes.
8. Run idempotency replay against the same mapping hashes and prove no duplicate
   clients, matters, or Vault projection rows are created.

Vault-only client or matter creation is allowed only as a dry-run simulation or
explicit development fallback. It must not be represented as production Matter
app write completion.

## Matter App Client/Matter Upsert Contract

Current availability: `docs/integrations/matter-app-vault-contract.md` defines
a Law Firm OS Vault bridge API for Matter app-owned client and matter upserts.
Execution is still blocked unless the live Matter app API base URL, bearer auth,
tenant scope, health response, idempotency semantics, and source revision
response are verified at run time.

Allowed production write transports:

| Transport | Requirement | If unavailable |
|---|---|---|
| `matter_app_api` | Matter app-owned client and matter upsert endpoints with owner-approved auth, tenant scope, idempotency, conflict response, and source revision. Vault expects `MATTER_APP_API_BASE_URL` and `MATTER_APP_API_TOKEN` and checks `/api/matters/vault-bridge/status` before execution. | Block actual write. |
| `matter_app_event_projection` | Matter app-owned approved event intake or projection feed that accepts client/matter upsert events and returns canonical ids/revision. | Block actual write. |

Forbidden production transports:

- `vault_projection_only`
- direct Vault database insert treated as canonical
- descriptor-only Matter app package
- any script that writes client/matter identity without Matter app owner approval

### Client Upsert Request

| Field | Required | Rule |
|---|---|---|
| `tenantRef` | yes | External-safe tenant reference or hash; no tenant-private value in repo receipts. |
| `idempotencyKeyHash` | yes | Derived from tenant ref, approved client candidate hash, approval ref, and run id. |
| `clientDisplayName` | yes | Approved bounded display value from the mapping workbook. |
| `clientShortName` | yes | Approved short name after suffix normalization review. |
| `approvalRef` | yes | Human approval reference. |
| `sourceRevision` or `migrationApprovalRef` | yes | Reference used for replay and audit; must not contain raw paths or document text. |
| `supportingEvidenceRefs` | yes | External-safe refs only. |

Client upsert response must include `clientId`, `clientDisplayName`,
`sourceRevision`, and action `created`, `reused`, or `blocked`. Multiple possible
client matches, ambiguous suffix removal, or client identity conflicts return
`blocked` or `needs_review`; they do not create a client.

### Matter Upsert Request

| Field | Required | Rule |
|---|---|---|
| `tenantRef` | yes | Same tenant scope as the client result. |
| `idempotencyKeyHash` | yes | Derived from tenant ref, approved Matter Code, approval ref, and mapping candidate hash. |
| `clientId` | yes | Canonical Matter app client id from the client upsert response. |
| `clientDisplayName` | yes | Must match the canonical client response or block. |
| `matterCode` | yes | Approved `[client_short_name]/[matter_type_english]/[matter_detail_type_korean]` value, unique in tenant scope, <= 120 chars. |
| `matterName` | yes | Approved bounded matter display label. |
| `matterTypeEnglish` | yes | Approved vocabulary value. |
| `matterDetailTypeKorean` | yes | Approved evidence-backed Korean detail label. |
| `practiceGroup` | optional | Write only when approved in the workbook or Matter app owner policy. |
| `responsibleLawyer` | optional | Ref/display value only when approved and resolvable by the Matter app. |
| `openedAt` / `closedAt` | optional | Write only when approved and date range is valid. |
| `sourceRevision` or `migrationApprovalRef` | yes | Replay/audit reference for this approved mapping row. |

Matter upsert response must include `matterAppMatterId`, `matterCode`,
`clientId`, and `sourceRevision`. If the response `matterCode`, `clientId`,
client display, matter type, or detail type disagrees with the approved row, the
row fails with `matter_app_vault_identity_mismatch` and Vault projection sync is
not allowed.

## Vault Projection Sync Contract

Vault projection sync runs only after the Matter app returns or projects a
canonical matter. Vault stores the Matter app identity as a projection/reference;
it does not mint a separate Matter Code namespace.

Required projection input:

| Matter app result field | Vault projection target | Required check |
|---|---|---|
| `matterAppMatterId` | Projection metadata/ref for canonical Matter app matter | Present and stable for replay. |
| `matterCode` | Vault `matter_code` projection copy | Equals approved code and Matter app response. |
| `matterName` | Vault `matter_name` projection copy | Equals approved bounded label or accepted Matter app canonical display. |
| `clientId` | Vault client projection/link | Equals Matter app client response and approved row. |
| `clientDisplayName` | Projection metadata/display | Reference-only display; no raw source path or tenant-private value. |
| `matterTypeEnglish` | Vault `matter_type` projection | Matches approved vocabulary and Matter app response. |
| `matterDetailTypeKorean` | Projection metadata | Evidence-backed label only; no document excerpt. |
| `status` | Vault status/lifecycle projection | Upload/import blocking states must fail closed. |
| `practiceGroup` | Vault `practice_group` projection when available | Optional, bounded. |
| `responsibleLawyer` | Vault lead/responsible lawyer projection when resolvable | Optional; unresolved values remain refs, not free-form identities. |
| `openedAt` / `closedAt` | Vault lifecycle projection when available | Optional; invalid range blocks. |
| `sourceRevision` | Projection metadata `matterAppSourceRevision` / `sourceRevision` | Required for replay and staleness/conflict detection. |
| `sourceUpdatedAt` | Projection freshness timestamp | Required for staleness gate. |

Projection sync must fail when Matter app and Vault projection disagree on
`matterAppMatterId`, `matterCode`, `clientId`, `matterName`, matter type, detail
type, or `sourceRevision`. The failure is recorded as
`matter_app_vault_identity_mismatch` or `vault_projection_conflict`.

## Field Mapping

| Approved mapping field | Matter app client | Matter app matter | Vault projection | Receipt metadata |
|---|---|---|---|---|
| `tenant_ref` | tenant scope ref | tenant scope ref | `tenant_id` or approved tenant ref | tenant ref/hash only |
| `migration_operator_ref` | operator/audit actor ref | operator/audit actor ref | audit actor ref | operator ref/hash only |
| `client_name_candidate` | display name or match key | client display | display projection | bounded client ref/hash |
| `client_short_name_candidate` | optional normalized alias | Matter Code segment | projection short label | normalized hash/ref |
| `matter_type_english` | none | matter type | `matter_type` | enum value |
| `matter_detail_type_korean` | none | detail metadata if supported | metadata value | bounded detail ref |
| `matter_code_candidate` | none | canonical Matter Code | projection code copy | code hash/ref or approved bounded code ref |
| `matter_name_candidate` | none | display name | display projection | bounded matter ref/hash |
| `approval_ref` | approval metadata ref | approval metadata ref | approval metadata ref | approval ref |
| `mapping_candidate_hash` | idempotency key input | idempotency key input | projection replay key | replay key |
| `source_lane` | none | optional migration metadata | optional migration metadata | lane only |
| Matter app `clientId` result | canonical client id | client relation | client projection/link | client ref/hash |
| Matter app `matterAppMatterId` result | none | canonical matter id | Matter app reference metadata | matter ref/hash |
| Matter app `sourceRevision` result | source revision | source revision | `matterAppSourceRevision` / `sourceRevision` metadata | revision ref/hash |

Forbidden receipt and metadata values:

- document body
- OCR or text excerpts
- screenshots exposing source data
- unredacted local source locations
- secrets, tokens, cookies, credentials
- unbounded Matter app payloads
- tenant-private values

## Matter Code Rules

Matter code format:

```text
[client_short_name]/[matter_type_english]/[matter_detail_type_korean]
```

Rules:

- Korean is allowed in the detail segment.
- The current Vault DTO and database constraint require 1 to 120 characters.
- `client_short_name` may remove generic suffixes such as `주식회사`, `(주)`,
  `회계법인`, `법무법인`, `유한회사`, `유한책임회사`, `사단법인`, and
  `재단법인` only when the result is still unambiguous.
- Duplicates inside the tenant block the row. Do not append an automatic suffix.
- If the Matter app canonical vocabulary differs from the Vault enum, block and
  reconcile before write.
- Archive rows never receive Matter Code.

## Validation Loop

Every row and every aggregate receipt must pass:

```text
generate -> verify -> challenge -> reconcile -> approved / needs_review / blocked / archive_only
```

Loop requirements:

- Generate: derive the intended client, matter, and projection action from the
  approved row.
- Verify: check schema, format, runtime readiness, code uniqueness, approved
  evidence refs, and idempotency key.
- Challenge: independently test archive leakage, ambiguous client normalization,
  duplicate Matter Code, stale Matter app source, missing tenant/operator refs,
  and unsupported matter type.
- Reconcile: convert any discrepancy into an explicit blocked-row reason.
- Approve: allow only rows with no unresolved discrepancy to enter actual write.

## Execution Gates

The actual write gate requires all of the following:

```text
approved_rows_only = true
archive_rows_excluded = true
matter_app_runtime_ready = true
matter_app_write_contract_current = true
matter_app_auth_scope_verified = true
matter_code_format_valid = true
matter_code_length_valid = true
matter_code_unique_in_tenant = true
client_ambiguity_count = 0
matter_type_vocabulary_current = true
vault_projection_not_canonical = true
dry_run_pass = true
dry_run_receipt_reviewed = true
idempotency_replay_pass = true
audit_receipt_ready = true
sensitive_values_committed = false
```

If `matter_app_runtime_ready = false`, the only permitted terminal state is
`write_blocked`, with dry-run receipts and blocked reasons.

## Testable Units Of Work

### MIG-WRITE-000: Boundary And Source-Of-Truth Guard

Purpose: Make the write lane explicitly Matter-app-first and Vault-projection
second.

Tasks:
- Record that Matter app owns canonical Matter Code and identity.
- Block production writes when Matter app runtime readiness is unverified.
- Ensure the plan never creates a Vault-only Matter Code namespace.

Verification:
- Contract reference present.
- Gate contains `matter_app_runtime_ready`.
- Stop condition covers missing Matter app API/event projection.

### MIG-WRITE-001: Approved Mapping Loader

Purpose: Load only approved mapping rows into a local redacted working dataset.

Tasks:
- Read `human_approval_workbook` rows.
- Include only `overall_approval_state=approved`.
- Exclude `archive_only`, `legacy_archive_only`, `needs_review`, `blocked`, and
  `deferred`.
- Persist only row ids, hashes, refs, approved labels, and approved enum values.

Verification:
- Fixture with mixed states loads approved rows only.
- Fixture containing `999_이전 자료들` writes zero eligible rows.
- Loader output contains no document contents or unredacted source locations.

### MIG-WRITE-002: Mapping Row Validation

Purpose: Prove each approved row has the minimum write-safe data.

Tasks:
- Validate tenant/operator refs, client candidate, short name, type, detail,
  Matter Code, display name, approval ref, and candidate hash.
- Validate evidence conflict state is resolved.
- Validate permission/wall/hold review completion.

Verification:
- Missing required field blocks the row.
- Unresolved conflict blocks the row.
- Missing evidence approval blocks the row.

### MIG-WRITE-003: Client Short-Name Normalization And Ambiguity Preflight

Purpose: Re-check suffix removal and client identity ambiguity before write.

Tasks:
- Apply the approved suffix-removal rules.
- Detect same short name across different client candidates.
- Detect names that become ambiguous after suffix removal.
- Keep ambiguous rows in `needs_review` even if other fields are valid.

Verification:
- Same normalized short name with different candidate hashes blocks.
- Suffix removal that preserves identity passes.
- Suffix removal that loses identity is `needs_review`.

### MIG-WRITE-004: Matter Code Validation And Tenant Uniqueness

Purpose: Validate code shape, length, tenant uniqueness, and archive exclusion.

Tasks:
- Check `[client_short_name]/[matter_type_english]/[matter_detail_type_korean]`.
- Check current 120-character Vault limit.
- Collapse repeated approved groups with the same Matter code into one write
  candidate before tenant-level uniqueness checks.
- Check tenant-level duplicate candidates before write.
- Check existing Matter app/Vault projection codes for conflicts.
- Fail if any archive row appears in the write candidate set.

Verification:
- Overlength code blocks.
- Duplicate code blocks only when two distinct write candidates would create
  different Matters with the same tenant-level Matter code.
- Archive row in write set fails the whole batch.
- Unsupported matter type blocks.

### MIG-WRITE-005: Matter App Capability And Runtime Gate

Purpose: Confirm that the canonical write path is available before any actual
write.

Tasks:
- Verify Matter app API or approved event projection mode.
- Verify authentication and tenant scope are configured.
- Verify freshness/staleness policy.
- Verify supported create/reuse semantics for client and matter.

Verification:
- Descriptor-only contract returns `write_blocked`.
- Stale or unavailable source returns `write_blocked`.
- Dry-run may continue with clear non-write state.

### MIG-WRITE-006: Matter App Client Upsert Dry-Run

Purpose: Plan canonical client reuse or creation without mutating data.

Tasks:
- Match existing Matter app client candidates by approved identity rules.
- Mark matched clients as `reused`.
- Mark unmatched clients as `planned_create`.
- Block ambiguous matches.
- Record idempotency inputs.
- Use `tools/migration/onedrive-target-resolution-dry-run.mjs` to verify tenant,
  operator, existing client, and planned-create states without writing.

Verification:
- Existing client reuses canonical client id/ref.
- No match produces one planned create.
- Multiple plausible matches block.

### MIG-WRITE-007: Matter App Matter Upsert Dry-Run

Purpose: Plan canonical matter reuse or creation without mutating data.

Tasks:
- Resolve client dependency from MIG-WRITE-006.
- Match by tenant and Matter Code.
- Compare matter name/type/detail against approved mapping.
- Mark existing matching matters as `reused`.
- Mark absent matters as `planned_create`.
- Block mismatched existing codes.
- Collapse repeated approved groups with the same Matter Code into one target
  Matter row before the matter dry-run.

Verification:
- Existing matching Matter Code reuses.
- Existing conflicting Matter Code blocks.
- Absent Matter Code plans one create.

### MIG-WRITE-008: Vault Projection Sync Dry-Run

Purpose: Plan Vault projection link/update after canonical Matter app resolution.

Tasks:
- Map canonical Matter app matter id to Vault projection.
- Plan projection create/update/reuse.
- Preserve source revision and source updated timestamp.
- Confirm projection metadata remains reference-only.

Verification:
- Existing projection with same source revision reuses.
- Missing projection plans create.
- Conflicting projection blocks.

### MIG-WRITE-009: Dry-Run Receipt And Blocked Rows

Purpose: Produce a reviewable write forecast before mutation.

Tasks:
- Count planned client creates/reuses.
- Count planned matter creates/reuses.
- Count projection creates/updates/reuses.
- Report skipped, blocked, archive-only, and needs-review rows.
- Produce aggregate gate booleans.
- Include sanitized target-resolution receipt counts; keep approved codes and
  client names only in local-only `*.local.ndjson.gz` artifacts.

Verification:
- Receipt totals equal input row totals.
- Blocked rows have one or more reason codes.
- Receipt contains no forbidden values.

### MIG-WRITE-010: Approved Client Write/Reuse

Purpose: Execute canonical Matter app client upsert only after dry-run approval.

Tasks:
- Use Matter app API/service path, not direct database insert.
- Reuse existing client when matched.
- Create client when unmatched and approved.
- Store only bounded migration metadata supported by the Matter app.
- Emit reference-only write receipt.

Verification:
- Re-running the same approved batch creates no duplicate client.
- Ambiguous client still blocks.
- Client receipt includes canonical client ref and action.

### MIG-WRITE-011: Approved Matter Write/Reuse

Purpose: Execute canonical Matter app matter upsert under the approved client.

Tasks:
- Use Matter app API/service path, not direct database insert.
- Set Matter Code from approved candidate.
- Set Matter type and display name from approved mapping.
- Store Korean detail type as approved metadata if supported.
- Use `proposed` or the owner-approved initial status.
- Emit reference-only write receipt.

Verification:
- Re-running the same approved batch creates no duplicate matter.
- Code/type/detail mismatch blocks.
- Receipt includes canonical Matter app matter ref and action.

### MIG-WRITE-012: Vault Projection Link/Update

Purpose: Reflect canonical Matter app matter identity into Vault local projection.

Tasks:
- Create or update Vault projection after canonical matter exists.
- Store canonical Matter app matter ref, code projection, status, source revision,
  and source updated timestamp.
- Do not claim Vault projection is canonical.
- Do not attach customer documents or files.

Verification:
- Projection references canonical Matter app id/ref.
- Projection is stale/conflict aware.
- No document rows or file objects are created.

### MIG-WRITE-013: Idempotency And Replay

Purpose: Prove safe re-execution of the same approved mapping.

Tasks:
- Define idempotency key from tenant ref, approved Matter Code, approval ref,
  and mapping candidate hash.
- Replay dry-run and actual-write receipt comparison.
- Detect partial write recovery state.
- Convert inconsistent replay to blocked/quarantine state.

Verification:
- Second execution is all `reused` or `skipped_idempotent`.
- Partial previous write is detected and reconciled.
- Different row with same code blocks.

### MIG-WRITE-014: Audit And Receipt Policy

Purpose: Keep write evidence sufficient but reference-only.

Tasks:
- Define allowed metadata keys.
- Emit client, matter, projection, skipped, blocked, and replay receipts.
- Store only refs/hashes/counts and approved bounded values.
- Record forbidden metadata checks.

Verification:
- Receipt schema has no field for document text or source excerpts.
- Sensitive-value scan passes.
- Audit failure fails the write action.

### MIG-WRITE-015: Rollback And Quarantine

Purpose: Provide a controlled response for mistakes without deleting evidence.

Tasks:
- Define quarantine state for disputed writes.
- Prefer status/metadata correction through Matter app owner path.
- Define rollback request receipt rather than hard delete.
- Link rollback to approval and write receipt refs.

Verification:
- Rollback plan does not hard-delete canonical matters.
- Quarantine can mark projection non-upload-eligible.
- Operator remediation path is explicit.

### MIG-WRITE-016: Acceptance Gate

Purpose: Decide whether the write package is ready for pilot execution.

Tasks:
- Review all dry-run receipts.
- Confirm all execution gates.
- Confirm Matter app owner approval.
- Confirm Vault projection owner approval.
- Confirm no customer document import is included.

Verification:
- Acceptance checklist has all required booleans true.
- Any false gate blocks actual write.
- Pilot approval is separate from bulk import approval.

## Conflict And Blocked-Row Reasons

Allowed reason codes:

| Code | Meaning |
|---|---|
| `not_approved` | Row is not human-approved |
| `archive_only` | Row belongs to archive-only lane |
| `missing_required_field` | Required approved value is absent |
| `missing_evidence_approval` | Internal evidence approval is absent |
| `client_ambiguous` | Client normalization or matching is ambiguous |
| `matter_code_invalid` | Matter Code format or length failed |
| `matter_code_duplicate` | Duplicate code would create distinct Matters in batch or conflict with existing canonical set |
| `matter_type_unsupported` | Type vocabulary mismatch |
| `matter_app_unavailable` | Canonical write path is unavailable |
| `matter_app_stale` | Source/projection freshness is beyond policy |
| `existing_record_conflict` | Existing client or matter conflicts with approved row |
| `vault_projection_conflict` | Projection does not match canonical Matter app ref |
| `idempotency_conflict` | Replay key conflicts with a different intended write |
| `receipt_policy_violation` | Receipt contains or would contain forbidden metadata |
| `write_contract_missing` | Matter app write API/event projection is not available |
| `vault_projection_only_not_canonical` | A Vault projection-only source is being treated as production canonical |
| `matter_app_vault_identity_mismatch` | Matter app result and Vault projection disagree on client/matter/code identity |
| `source_revision_missing` | Matter app result lacks replay/staleness revision |
| `customer_document_import_attempted` | A write package attempts document/file import |

## Rollback And Quarantine

Rollback is not hard delete. If a write is disputed:

1. Mark the affected receipt as disputed.
2. Block document upload/import against the affected Vault projection.
3. Ask the Matter app owner to correct, merge, archive, or supersede the
   canonical client/matter record through its approved process.
4. Refresh or quarantine the Vault projection after canonical remediation.
5. Preserve the original receipt and add a correction receipt.

## Acceptance Checklist

| Check | Required result |
|---|---|
| Scope | Clients and matters only; no customer document/file import |
| Source of truth | Matter app canonical; Vault projection only |
| Approved rows | Only `overall_approval_state=approved` rows |
| Archive exclusion | No `legacy_archive_only` or `999_이전 자료들` write rows |
| Matter app readiness | API/event projection, auth, tenant scope, and freshness verified |
| Code validity | Format valid, 1 to 120 chars, tenant unique |
| Identity match | Matter app and Vault projection agree on `matterAppMatterId`, `matterCode`, `clientId`, type, detail, and `sourceRevision` |
| Client ambiguity | Zero unresolved ambiguity |
| Dry-run | Receipt reviewed and pass gate true |
| Idempotency | Replay creates no duplicate client/matter/projection |
| Audit | Reference-only receipt and audit policy ready |
| Sensitive data | No document body, source text, unredacted source location, token, or private tenant value committed |
| Approval | Matter app owner and Vault projection owner approve pilot write |
