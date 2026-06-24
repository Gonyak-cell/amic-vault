# OneDrive Pilot Mapping Template

Status: POST-LAUNCH PILOT PLANNING ONLY
Owner: Operator / Customer-scope owner / Security owner / Legal-data owner / Rollback owner
Related plan: `docs/release/onedrive-migration-post-launch-plan.md`
Related ADR: `docs/adr/ADR-017-office-onedrive-flow.md`

## Purpose

This template defines the mapping fields required before a OneDrive staging
candidate can become one approved pilot Matter import. It does not select a
real pilot Matter, import any document into Vault, claim OneDrive connected
state, claim Office open/save/sync, or approve a source-of-truth cutover.

## Input Evidence

Use reference-only evidence. Do not paste customer document names, customer
folder labels, source object keys, document contents, screenshots, provider
console metadata, private tenant identifiers, secrets, cookies, or tokens into
this repository.

Required refs:

| Ref | Description | Storage |
|---|---|---|
| `ONEDRIVE-STAGING-RUN-REF` | Staging run identity and sanitized control evidence. | External or sanitized control key |
| `ONEDRIVE-PILOT-CANDIDATE-REF` | Hashed candidate id from sanitized candidate summary. | Sanitized evidence |
| `ONEDRIVE-SOURCE-OWNER-REF` | Source-side business owner or custodian. | External ref |
| `ONEDRIVE-MATTER-MAPPING-REF` | Approved target Matter mapping. | External ref |
| `ONEDRIVE-PERMISSION-MAPPING-REF` | Source permission and wall mapping. | External ref |
| `ONEDRIVE-RETENTION-MAPPING-REF` | Retention and legal-hold mapping. | External ref |
| `ONEDRIVE-ROLLBACK-PLAN-REF` | Rollback and containment plan. | External ref |

## Mapping Row Schema

Each pilot candidate row must satisfy this schema before dry-run validation:

| Field | Required | Allowed Value Shape | Validation |
|---|---:|---|---|
| `candidate_id` | yes | Hash id from sanitized candidate summary | Must match `LC-ONEDRIVE-01` output |
| `candidate_risk_class` | yes | `low_risk`, `medium_risk`, or `blocked` | `blocked` cannot proceed without waiver |
| `tenant_ref` | yes | External ref, not tenant UUID text | Must resolve to one active Vault tenant |
| `client_ref` | yes | External ref or approved Client Code | Must map to one Vault Client |
| `matter_ref` | yes | External ref or approved Matter Code | Must map to one Vault Matter |
| `matter_owner_ref` | yes | External person or team ref | Must approve pilot scope |
| `source_owner_ref` | yes | External person or team ref | Must approve source-side read |
| `folder_class` | yes | `matter_record`, `working_file`, `email_export`, `admin`, `unknown` | `unknown` blocks write mode |
| `retention_class` | yes | Approved retention policy ref | Missing value blocks write mode |
| `legal_hold_flag` | yes | `yes`, `no`, or `unknown` | `unknown` blocks write mode |
| `permission_source_ref` | yes | External permission evidence ref | Must be reviewed by security owner |
| `ethical_wall_implication` | yes | `none`, `applies`, or `unknown` | `unknown` blocks write mode |
| `ai_allowed_default` | yes | `false`, `true_with_policy_ref`, or `unknown` | Default should be `false` unless approved |
| `duplicate_policy` | yes | `new_document`, `new_version_review`, or `block_pending_review` | Must be deterministic |
| `unsupported_type_policy` | yes | `skip_with_receipt`, `convert_after_approval`, or `block` | Conversion needs separate approval |
| `zero_byte_policy` | yes | `skip_with_receipt`, `import_marker`, or `block` | Must be explicit |
| `large_object_policy` | yes | `worker_stream_only`, `skip_with_receipt`, or `block` | Browser upload is not allowed |
| `rollback_owner_ref` | yes | External person or team ref | Must accept rollback duty |
| `cutover_policy` | yes | `not_requested`, `pilot_after_validation`, or `blocked` | Cannot be automatic |
| `status` | yes | `draft`, `ready_for_dryrun`, `blocked`, or `waived` | Only `ready_for_dryrun` can enter LC-ONEDRIVE-04 |

## CSV Header

```csv
candidate_id,candidate_risk_class,tenant_ref,client_ref,matter_ref,matter_owner_ref,source_owner_ref,folder_class,retention_class,legal_hold_flag,permission_source_ref,ethical_wall_implication,ai_allowed_default,duplicate_policy,unsupported_type_policy,zero_byte_policy,large_object_policy,rollback_owner_ref,cutover_policy,status,notes_ref
```

## Default Policies

Use these defaults unless an approval ref says otherwise:

| Policy | Default |
|---|---|
| `ai_allowed_default` | `false` |
| `duplicate_policy` | `block_pending_review` |
| `unsupported_type_policy` | `skip_with_receipt` |
| `zero_byte_policy` | `skip_with_receipt` |
| `large_object_policy` | `worker_stream_only` |
| `cutover_policy` | `not_requested` |

## Required Validation

A mapping row may move to `ready_for_dryrun` only when all of the following are
true:

- exactly one active tenant ref is resolved;
- exactly one active Client and Matter mapping is resolved;
- source owner and Matter owner refs are recorded;
- security owner has reviewed permission and wall implications;
- legal-data owner has reviewed retention and legal-hold implications;
- rollback owner has accepted rollback duty;
- the candidate is not `blocked`, or a waiver ref exists;
- no customer document names, source labels, source object keys, document
  contents, screenshots, provider metadata, private tenant identifiers, secrets,
  cookies, or tokens are stored in the repository;
- the mapping does not claim OneDrive connected state, Office open/save/sync,
  or source-of-truth cutover.

## Stop Conditions

Stop and record a blocked result if any of the following occurs:

- more than one Matter is included in a pilot row;
- permission or wall mapping is ambiguous;
- legal hold or retention mapping is `unknown`;
- write-mode import is requested before dry-run PASS;
- source-of-truth cutover is requested as part of import approval;
- the evidence needed for approval would expose customer-sensitive labels or
  document contents in the repository.

