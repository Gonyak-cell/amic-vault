# OneDrive Pilot Operations Register

Status: PILOT EXECUTION CLOSED OUT
Pilot write run ID: `onedrive-pilot-post-permission-setup-20260625`
Scope: one local pilot Matter, 13 documents

## Executed Pilot Candidate

Executed pilot candidate:

| Field | Value |
|---|---:|
| Candidate ID | `pilot-216c0425e3795c0f` |
| Scope | one local pilot Matter |
| Imported rows | `13` |
| Failed rows | `0` |
| Blocked rows | `0` |
| Skipped rows | `0` |

This candidate is recorded from sanitized pilot evidence only. The register
does not contain raw customer paths, file names, source object keys, document
contents, private tenant identifiers, provider console metadata, cookies,
tokens, or secrets.

## Pilot Closeout Evidence

- LC07 reconciliation: PASS, mismatch count 0.
- LC08 Gemma readiness: PASS, indexing not started.
- LC09 post-pilot wave plan: PASS, planning only.
- Idempotency replay: `already_imported=13`, duplicate create `0`.

Local detailed receipts remain under `.omo/evidence/` and are not committed.

## Execution Decision

Current decision: `DO_NOT_EXPAND_IMPORT_WITHOUT_NEXT_WAVE_APPROVAL`.

Reason: the pilot import is complete, but no customer-wide import,
source-of-truth cutover, Gemma indexing execution, OneDrive connected-state, or
Office open/save/sync has been approved. The next permissible work is bounded
wave approval/readiness and dry-run preparation.

## Next Command Shape

Use `docs/release/onedrive-next-wave-readiness-packet.md` as the current
operator packet. It is readiness-only and does not approve another import.

Validate only the next bounded wave plan:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode wave-plan \
  --wave-plan <next-wave-plan.local.json> \
  --reconciliation-report <pilot-reconciliation.sanitized.json> \
  --gemma-readiness <pilot-gemma-readiness.sanitized.json> \
  --sanitized-out <next-wave-plan.sanitized.json>
```

Then validate the exact dry-run-only approval refs:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode next-wave-approval \
  --approval <next-wave-approval.local.json> \
  --wave-gate <next-wave-plan.sanitized.json> \
  --sanitized-out <next-wave-approval.sanitized.json>
```

Then validate local-only dry-run inputs:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode next-wave-dryrun-inputs \
  --dryrun-inputs <next-wave-dryrun-inputs.local.json> \
  --approval-gate <next-wave-approval.sanitized.json> \
  --sanitized-out <next-wave-dryrun-inputs.sanitized.json>
```

Proceed to next-wave dry-run only if all three gates return `gate_status=pass`
with zero blockers and the operator separately approves the exact bounded
batch. This still does not authorize write/import/cutover/indexing.

After the dry-run-only run, validate its sanitized receipt before any write
decision packet:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode next-wave-dryrun-receipt \
  --dryrun-report <next-wave-dryrun.sanitized.json> \
  --dryrun-input-gate <next-wave-dryrun-inputs.sanitized.json> \
  --sanitized-out <next-wave-dryrun-receipt.sanitized.json>
```

This receipt gate does not run dry-run, import, write, cutover, or indexing. It
checks only the already-produced dry-run report against the local input gate.

If the receipt gate passes, validate the write decision packet before asking
for separate write approval:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode next-wave-write-decision \
  --write-decision <next-wave-write-decision.local.json> \
  --dryrun-receipt-gate <next-wave-dryrun-receipt.sanitized.json> \
  --sanitized-out <next-wave-write-decision.sanitized.json>
```

This gate prepares an operator approval request only. It does not authorize or
execute Vault write/import, customer-wide import, cutover, or indexing.

After separate bounded write approval exists, validate it before any execution
preflight:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode next-wave-write-approval \
  --write-approval <next-wave-write-approval.local.json> \
  --write-decision-gate <next-wave-write-decision.sanitized.json> \
  --sanitized-out <next-wave-write-approval.sanitized.json>
```

This gate validates approval scope only. It does not execute Vault write/import,
customer-wide import, cutover, indexing, OneDrive connected-state, or Office
open/save/sync.

After the approval gate passes, validate the bounded execution preflight before
running any operator write command:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode next-wave-write-execution-preflight \
  --execution-preflight <next-wave-write-execution-preflight.local.json> \
  --write-approval-gate <next-wave-write-approval.sanitized.json> \
  --sanitized-out <next-wave-write-execution-preflight.sanitized.json>
```

This gate validates final write-window, target-resolution, upload-preflight,
snapshot, containment, rollback, permission, and legal-data refs only. It does
not execute Vault write/import, DB write, storage write, customer-wide import,
cutover, indexing, OneDrive connected-state, or Office open/save/sync.

After a separately approved bounded operator write command actually runs,
validate only the sanitized write receipt:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode next-wave-write-receipt \
  --write-receipt <next-wave-write-receipt.sanitized.json> \
  --execution-preflight-gate <next-wave-write-execution-preflight.sanitized.json> \
  --sanitized-out <next-wave-write-receipt-gate.sanitized.json>
```

This gate checks post-write DB/storage/audit counts, rollback containment, and
idempotency evidence only. It does not run write/import, does not approve
customer-wide import or cutover, and does not enqueue or run Gemma indexing.

## Hard Stops

Stop if:

- the scope expands beyond the approved bounded Matter batch;
- any required ref is missing or ambiguous;
- permission, ethical wall, retention, or legal-hold mapping is unclear;
- rollback requires hard delete or audit mutation;
- a summary would expose raw customer labels or document content;
- any step would claim OneDrive connected-state, Office open/save/sync, Gemma
  indexing execution, or source-of-truth cutover.
