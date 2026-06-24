# OneDrive Pilot Import Worker Design

Status: POST-LAUNCH PILOT DESIGN ONLY
Owner: Operator / Security owner / Legal-data owner / Rollback owner
Depends on: `docs/release/onedrive-pilot-mapping-template.md`
Related ADR: `docs/adr/ADR-017-office-onedrive-flow.md`

## Purpose

This design defines a migration worker for exactly one approved post-launch
pilot Matter. It is not a customer-wide import tool, not a OneDrive runtime
integration, not an Office open/save/sync feature, and not a source-of-truth
cutover mechanism.

## Modes

| Mode | Writes Vault DB | Writes Vault Storage | Required Approval |
|---|---:|---:|---|
| `profile` | no | no | staging evidence only |
| `dry-run` | no | no | mapping refs complete |
| `synthetic-write` | yes, fixture only | yes, fixture only | test fixture approval |
| `pilot-write` | yes | yes | all pre-write refs |

`pilot-write` must refuse to run unless the scope is exactly one approved pilot
Matter and all required approval refs are present.

## Inputs

| Input | Description | Sensitive Handling |
|---|---|---|
| `run_id` | Staging run id. | Sanitized value may be logged. |
| `candidate_id` | Hashed candidate id from LC-ONEDRIVE-01. | Sanitized value may be logged. |
| `pilot_scope_manifest` | Local-only manifest for the approved candidate. | Detailed labels stay local-only. |
| `mapping_ref` | External mapping approval ref. | Store ref only. |
| `permission_ref` | External permission review ref. | Store ref only. |
| `retention_ref` | External retention/legal-hold ref. | Store ref only. |
| `rollback_ref` | External rollback owner/ref. | Store ref only. |
| `write_window_ref` | Approved write window. | Store ref only. |

## Required Gates

The worker must fail closed if any gate is missing:

1. candidate id exists in sanitized candidate summary;
2. scope resolves to exactly one pilot Matter;
3. mapping status is `ready_for_dryrun` for dry-run;
4. mapping status is `ready_for_write_mode` for pilot-write;
5. tenant, Client, Matter, source owner, Matter owner, security, legal-data,
   and rollback owner refs are present;
6. permission and ethical wall mapping are not ambiguous;
7. retention and legal-hold mapping are not ambiguous;
8. default AI allowance is explicit;
9. import lock is acquired for pilot-write;
10. pre-import DB and storage containment refs are recorded for pilot-write.

## Processing Model

For each manifest item in `dry-run`:

1. validate scope belongs to the approved candidate id;
2. validate target tenant, Client, and Matter refs;
3. check file metadata from staging object metadata and local manifest row;
4. classify extension and MIME policy;
5. classify zero-byte, large object, duplicate candidate, and unsupported type
   policies;
6. compute expected Vault records and audit event counts;
7. emit sanitized result row with no detailed source labels.

For each manifest item in `pilot-write`:

1. validate approval refs and import lock;
2. read object bytes from the migration staging bucket;
3. stream bytes into Vault storage using immutable object semantics;
4. compute SHA-256 during or before storage write;
5. validate MIME and extension policy;
6. create `documents`, `file_objects`, and `document_versions`;
7. set `file_objects.source_system = 'migration'`;
8. record audit event in the same transaction or fail the item;
9. emit sanitized receipt row;
10. retain local-only detailed receipt for operator reconciliation.

## Idempotency

Idempotency key:

```text
sha256(run_id + candidate_id + target_tenant_ref + target_matter_ref + source_object_hash + policy_version)
```

The worker must support safe rerun:

- already succeeded item: skip and report `already_imported`;
- same idempotency key with different target mapping: fail closed;
- same source object hash with different duplicate policy: require review;
- partial storage write before DB transaction: compensate storage when possible
  and report `storage_compensated`;
- DB transaction success followed by later failure: do not hard-delete; mark for
  reconciliation.

## Audit Contract

Every write-mode success must produce a reference-only audit event with:

- tenant ref;
- actor/operator ref;
- target document id;
- target Matter ref;
- file object id;
- version id;
- SHA-256;
- migration run id;
- candidate id;
- idempotency key;
- approval refs.

Audit metadata must not include document body, customer document names, source
labels, provider console metadata, cookies, tokens, or secrets.

## Storage Contract

- Read source bytes from the migration staging bucket only.
- Write imported bytes to approved Vault storage only.
- Preserve immutable original semantics.
- Do not overwrite an existing original.
- Do not use browser upload for migration.
- Do not move staging objects into production prefixes as a shortcut.
- Do not delete staging objects as part of pilot import.

## Database Contract

Write-mode must create or reference these Vault records:

| Record | Requirement |
|---|---|
| `documents` | One draft/imported document record per imported item unless duplicate policy says otherwise. |
| `file_objects` | One immutable file object per imported file, with `source_system = 'migration'`. |
| `document_versions` | Initial version for each new imported document. |
| `audit_events` | Mandatory reference-only audit event for each write-mode success or denial. |

Any new table or schema change requires a separate approved TUW before
implementation. This design does not authorize schema changes by itself.

## Output Artifacts

| Artifact | Contains Detailed Source Labels | Destination |
|---|---:|---|
| `pilot-dryrun-report.sanitized.json` | no | S3 control and local control |
| `pilot-import-receipt.sanitized.json` | no | S3 control and local control |
| `pilot-failed-items.sanitized.json` | no | S3 control and local control |
| `pilot-import-receipt.local.ndjson.gz` | yes | local-only, mode `0600` |
| `pilot-reconciliation-input.local.ndjson.gz` | yes | local-only, mode `0600` |

## Stop Conditions

Stop immediately if:

- scope includes more than one pilot Matter;
- any required approval ref is missing;
- permission, ethical wall, retention, or legal-hold mapping is ambiguous;
- audit recording cannot be mandatory;
- storage compensation cannot be reasoned about;
- a rollback path would require hard delete of documents, versions, audit events,
  or storage objects;
- any output intended for repo or S3 control would include detailed customer
  labels or document contents.

