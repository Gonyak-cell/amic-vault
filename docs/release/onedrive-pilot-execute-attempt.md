# OneDrive Pilot Import Execute Attempt

Date: 2026-06-25

This note records the first post-target-resolution pilot execute attempt for the local AMIC Vault migration lane. It is intentionally repo-safe: it does not include raw source paths, object keys, filenames, OCR/text excerpts, screenshots, secrets, tenant-private values, or customer document content.

## Scope

- Candidate id: `pilot-216c0425e3795c0f`
- Run id: `onedrive-pilot-post-target-resolution-20260625`
- Scope size: 13 pilot rows
- Source type: local raw source manifest plus source object fetch
- Operation requested: pilot document import execute
- Actual imported rows: 0

The preceding dry-run receipt was committed in `dd5b1b3` and reported all 13 pilot rows ready after target resolution.

## Result

The execute command started successfully and the API build completed, but the pilot write stopped after the source object fetch failed for the first 3 attempted rows.

Sanitized failure summary:

- mode: `pilot-write`
- total attempted before stop: 3
- failed: 3
- imported: 0
- failure reason: `AWS_SOURCE_GET_OBJECT_FAILED`
- expected created documents: 0
- expected created file objects: 0
- expected created initial versions: 0
- expected created audit events: 0

No customer-wide import, source-of-truth cutover, OneDrive connected-state claim, production write, or Gemma indexing was performed.

## Post-Approval Execute Attempt

After operator approval for the exact `pilot-216c0425e3795c0f` 13-row pilot scope, the execute command was retried with the staging AWS profile explicitly selected.

Result:

- run id: `onedrive-pilot-post-approval-20260625`
- scope size: 13
- total attempted before stop: 3
- failed: 3
- imported: 0
- failure reason: `AWS_SOURCE_GET_OBJECT_FAILED`
- gate status: `blocked`

The staging AWS SSO token was expired at retry time. All configured local AWS profiles returned the same SSO token expiration condition during STS preflight. No broader import, cutover, indexing, connected-state, or Office sync action was performed.

## Successful Post-SSO Pilot Execute

The staging AWS SSO session was refreshed and the same 13-row candidate was retried.

Additional blockers found and resolved before the successful execute:

- Source object preflight passed for the first 3 pilot rows: manifest match, `head-object`, `get-object`, and size checks all passed.
- The runner no longer passes stale external upload preflight refs into `DocumentUploadService`; upload policy now issues process-local preflight receipts during the runner process.
- Local `vault_projection_only` mode remained lookup-only and not upload-authoritative. The pilot execute used local-only `matter_app_event_projection` source flags for the runner process only.
- The pilot target initially used a `firm_admin` actor, which is not permitted to edit/upload matter documents by the role matrix. A local audited pilot permission setup added one active `matter_owner` user as `member/edit` for the pilot matter and updated the local target artifact.

Successful execute result:

- run id: `onedrive-pilot-post-permission-setup-20260625`
- scope size: 13
- imported: 13
- failed: 0
- blocked: 0
- skipped: 0
- local receipt rows: 13
- idempotency replay: `already_imported=13`, duplicate created `0`

No customer-wide import, source-of-truth cutover, Gemma indexing, OneDrive connected-state claim, or Office open/save/sync action was performed.

## Local DB Check

Post-attempt local DB counts:

| Table               | Count |
| ------------------- | ----: |
| `documents`         |     0 |
| `document_versions` |     0 |
| `file_objects`      |     0 |
| `audit_events`      | 34050 |

These counts confirm that the failed execute attempt left no partial document/file writes in the local dev database.

The post-approval retry produced the same local DB counts:

| Table               | Count |
| ------------------- | ----: |
| `documents`         |     0 |
| `document_versions` |     0 |
| `file_objects`      |     0 |
| `audit_events`      | 34050 |

Rollback/containment receipt: `.omo/evidence/BULK-SCOPE-APPROVAL/provisional-approve-complete/pilot-import-dry-run/post-target-resolution/pilot-write-rollback-containment-approved.sanitized.json`.

Rollback status: `noop`, because no document, version, file object, or audit rows were created. Containment status: `pass`, because the runner failed closed before any local Vault write occurred.

After the successful execute and idempotency replay, local DB counts are:

| Table               | Count |
| ------------------- | ----: |
| `documents`         |    13 |
| `document_versions` |    13 |
| `file_objects`      |    13 |
| `audit_events`      | 34069 |
| `matter_members`    |   124 |

Successful containment receipt:
`.omo/evidence/BULK-SCOPE-APPROVAL/provisional-approve-complete/pilot-import-dry-run/post-target-resolution/pilot-write-success-containment.sanitized.json`.

Rollback status after success: `prepared_not_executed`. No hard delete, audit mutation, customer-wide import, cutover, indexing, connected-state claim, or Office sync action was performed.

## Access Diagnosis

The local AWS CLI context was checked after the failed execute attempt:

- profile: not set
- access key: not set
- secret key: not set
- region: not set
- `AWS_*` environment variables: none present

The pilot scope rows matched the local raw source manifest before execute, so the immediate blocker is source object access rather than target resolution or manifest mismatch.

## Next Gate

Before retrying execute:

1. Configure or refresh the intended AWS source access in the local shell, preferably with an explicit profile or SSO session.
2. Re-run the same pilot execute with that profile/env visible to the command.
3. Confirm the post-run DB counts and sanitized receipt immediately after execution.
4. Keep the pilot scope limited to the same 13 rows until a clean execute receipt exists.

Acceptance for the next attempt:

- source object fetch succeeds for all 13 pilot rows
- imported rows equals 13
- no blocked rows
- `documents`, `document_versions`, and `file_objects` counts increase only by the expected pilot amounts
- audit events are created only for the pilot write actions
- sanitized receipt remains free of raw paths, filenames, document body, OCR excerpts, screenshots, secrets, and tenant-private values
