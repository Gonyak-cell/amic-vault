# OneDrive Customer-Wide Import Runbook

This runbook covers the customer-wide Vault write/import rail after target
resolution has already mapped approved OneDrive source rows to Vault client and
matter IDs.

It does not approve or execute source-of-truth cutover, OneDrive connected-state
claims, Office open/save/sync claims, Gemma indexing, external sharing, hard
delete, or customer document content logging.

## Inputs

- Approved import scope: `approved-import-scope.local.ndjson.gz`
- Resolved import manifest: `resolved-import-manifest.local.ndjson.gz`
- Target resolution receipt: `document-import-target-resolution.sanitized.json`
- Operator approval ref: repo-safe approval receipt reference
- Manifest approval ref: repo-safe approval ref embedded in the resolved
  manifest, if different from the current operator approval ref
- Actor user ID: migration operator user ID
- Tenant slug: AMIC tenant slug

The approved scope may contain raw provider bucket/key values and must remain a
local artifact. Do not commit it, paste it into docs, or include raw source
labels in sanitized receipts.

## Dry-Run

```bash
pnpm onedrive:customer-wide-import -- \
  --dry-run \
  --run-id <run-id> \
  --manifest <resolved-import-manifest.local.ndjson.gz> \
  --scope <approved-import-scope.local.ndjson.gz> \
  --tenant-slug <tenant-slug> \
  --actor-user-id <operator-user-id> \
  --import-approval-ref <approval-ref> \
  --manifest-approval-ref <manifest-approval-ref> \
  --sanitized-out <customer-wide-import-dry-run.sanitized.json> \
  --local-receipt-out <customer-wide-import.local.ndjson>
```

Omit `--manifest-approval-ref` when it is the same as `--import-approval-ref`.
Use it when a later execution approval authorizes import while the resolved
manifest still carries an earlier mapping or ingest approval ref.

Expected dry-run behavior:

- no source object download
- no Vault DB write
- no Vault storage write
- no audit event creation
- no source-of-truth cutover

The dry-run passes only when every processed manifest row can be joined to the
approved scope by `source_row_hash`, has a valid tenant/client/matter target, has
the expected approval ref, and uses `planned_action=create_document_version_file_object_audit`.

## Supported Extension Policy

Customer-wide import follows the same Vault upload validators used by normal
document upload. The default supported migration extensions are:

```text
.csv, .doc, .docx, .eml, .hwp, .hwpx, .jpeg, .jpg, .json, .markdown, .md,
.msg, .pdf, .png, .ppt, .pptx, .txt, .xls, .xlsx
```

Files outside this list are reported as `unsupported_extension_<ext>` and must
not be forced into Vault by bypassing `DocumentUploadService`.

## Execute

Execute only after dry-run passes and the local API dependencies are available:

```bash
pnpm onedrive:customer-wide-import -- \
  --execute \
  --run-id <run-id> \
  --manifest <resolved-import-manifest.local.ndjson.gz> \
  --scope <approved-import-scope.local.ndjson.gz> \
  --tenant-slug <tenant-slug> \
  --actor-user-id <operator-user-id> \
  --import-approval-ref <approval-ref> \
  --manifest-approval-ref <manifest-approval-ref> \
  --sanitized-out <customer-wide-import-execute.sanitized.json> \
  --local-receipt-out <customer-wide-import.local.ndjson> \
  --state <customer-wide-import-state.local.json>
```

Omit `--manifest-approval-ref` when it is the same as `--import-approval-ref`.

Execute writes through `DocumentUploadService` only. That path creates the
document, file object, initial version, storage object, and upload audit through
the normal Vault service and audit transaction boundaries. For customer-wide
multi-matter execution, do not pass one shared upload preflight reference unless
it is known to be valid for the exact matter scope. When omitted, the normal
Matter source policy issues per-upload preflight receipts inside the service.

Use `--limit` and `--offset` for wave execution. Replays use the local state file
and the manifest `idempotency_key`; already imported rows are reported as
`already_imported` and are not uploaded again.

## Cutover Preflight

Customer-wide import completion is not source-of-truth cutover. A separate
cutover preflight must be run against the executed customer-wide import receipt:

```bash
pnpm onedrive:source-cutover-preflight -- \
  --import-receipt <customer-wide-import-execute.sanitized.json> \
  --target-resolution <document-import-target-resolution.sanitized.json> \
  --cutover-approval-ref <cutover-approval-ref> \
  --source-of-truth-control-ref <source-control-ref> \
  --sanitized-out <source-cutover-preflight.sanitized.json>
```

The preflight does not mutate source-of-truth state. It reaches
`ready_for_manual_cutover_decision` only when the customer-wide execute receipt
passed, imported or reused rows equal the resolved manifest count, failed and
blocked rows are zero, and separate cutover approval/control references are
present.

## Cutover Execute

After cutover preflight reaches `ready_for_manual_cutover_decision`, run the
local Vault cutover execute surface in two steps:

```bash
pnpm onedrive:source-cutover-execute -- \
  --dry-run \
  --run-id <run-id> \
  --import-receipt <customer-wide-import-closeout.sanitized.json> \
  --preflight-receipt <source-cutover-preflight.approved.sanitized.json> \
  --tenant-slug <tenant-slug> \
  --actor-email <operator-email> \
  --cutover-approval-ref <cutover-approval-ref> \
  --source-of-truth-control-ref <source-control-ref> \
  --sanitized-out <source-cutover-execute-dry-run.sanitized.json>
```

```bash
pnpm onedrive:source-cutover-execute -- \
  --execute \
  --run-id <run-id> \
  --import-receipt <customer-wide-import-closeout.sanitized.json> \
  --preflight-receipt <source-cutover-preflight.approved.sanitized.json> \
  --tenant-slug <tenant-slug> \
  --actor-email <operator-email> \
  --cutover-approval-ref <cutover-approval-ref> \
  --source-of-truth-control-ref <source-control-ref> \
  --sanitized-out <source-cutover-execute.sanitized.json>
```

Execute inserts one tenant-scoped cutover control row and one audit event in the
local Vault DB. It does not claim OneDrive connected-state, Office open/save/sync,
or Gemma indexing.

## Acceptance Gate

- customer-wide dry-run PASS
- customer-wide execute receipt PASS
- failed rows = 0
- blocked rows = 0
- imported + already imported rows = resolved manifest rows
- local receipt and state files retained outside git
- sanitized receipt contains no raw source path, object key, document name,
  document body, OCR excerpt, secret, token, account ID, or ARN
- source-of-truth cutover preflight and execute are separate from import execution
