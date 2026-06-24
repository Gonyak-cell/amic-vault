# OneDrive Pilot Real Run Plan

Status: REAL PILOT WRITE NOT STARTED
Run ID: `onedrive-staging-20260623-155501`
Selected candidate: `ad0e04b500f42b28`
Scope: one post-launch pilot Matter only
Depends on:

- `docs/release/onedrive-lazycodex-execution-package.md`
- `docs/release/onedrive-pilot-ops-register.md`
- `docs/release/onedrive-pilot-import-runbook.md`
- `docs/release/onedrive-pilot-real-refs.example.json`

## Current Decision

Current decision: `DO_NOT_RUN_REAL_PILOT_WRITE`.

Reason: real external refs have not been supplied and the placeholder refs are
expected to block LC-ONEDRIVE-06. The next allowed work is refs intake,
real dry-run preparation, and write preflight. This plan does not approve
customer-wide import, OneDrive connected state, Office open/save/sync, Gemma
indexing execution, or source-of-truth cutover.

## Remaining Testable Units

| Unit | Purpose | PASS Evidence | Stop Condition |
|---|---|---|---|
| OP-00 | Confirm branch and package baseline | clean worktree, package audit PASS | package audit blocked |
| OP-01 | Create local-only refs intake file | protected local mapping file | raw path, secret, or document label appears |
| OP-02 | Validate dry-run refs intake | `refs-intake --phase dryrun` PASS | any missing or placeholder dry-run prerequisite ref |
| OP-03 | Prepare real LC04 dry-run inputs | local-only scope manifest and owner refs | scope broader than one Matter |
| OP-04 | Run real LC04 dry-run | sanitized dry-run PASS | blocked or retryable item without approved handling |
| OP-05 | Confirm synthetic LC05 baseline | synthetic receipt PASS | fixture write gate blocked |
| OP-06 | Run LC06 write preflight | write-phase refs intake PASS and `write-preflight` PASS | any prewrite blocker |
| OP-07 | Schedule pilot write window | approval, lock, snapshot, containment refs | missing rollback owner or write window |
| OP-08 | Execute one pilot Matter write | sanitized import receipt and local detailed receipt | customer-wide scope or missing audit evidence |
| OP-09 | Reconcile LC07 | reconciliation PASS | count, status, storage, or audit mismatch |
| OP-10 | Check LC08 Gemma readiness | readiness PASS or policy-blocked PASS | permission-before-AI ambiguity |
| OP-11 | Prepare LC09 wave plan | bounded Matter-batch plan PASS | customer-wide or source-of-truth cutover request |
| OP-12 | Cutover decision packet | separate approval refs only | cutover bundled with import |

## OP-00 Baseline

Run before touching any real refs:

```bash
git status --short --branch
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode package-audit \
  --run-id onedrive-lazycodex-package \
  --evidence-root .omo/evidence \
  --sanitized-out .omo/evidence/LC-ONEDRIVE-09/artifacts/package-audit.sanitized.json
```

Expected result:

```text
gate_status=pass
customer_wide_import=not_executed
pilot_write=not_executed_by_package_audit
gemma_indexing=not_started
source_of_truth_cutover=not_approved
```

## OP-01 Local Refs Intake

Copy `docs/release/onedrive-pilot-real-refs.example.json` to a local-only path
outside git, then replace every placeholder with an opaque external ref.

Suggested local path:

```text
.omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/real-refs.mapping.local.json
```

Required refs:

| Ref field | Owner | Required for |
|---|---|---|
| `tenant_ref` | Operator / Infrastructure | mapping / LC04 |
| `client_ref` | Customer-scope owner | mapping / LC04 |
| `matter_ref` | Customer-scope owner | mapping / LC04 |
| `approval_ref` | Customer-scope owner | LC06 |
| `dryrun_pass_ref` | Operator | LC06 |
| `write_window_ref` | Operator | LC06 |
| `db_snapshot_ref` | Operator / Infrastructure | LC06 |
| `storage_containment_ref` | Operator / Infrastructure | LC06 |
| `rollback_owner_ref` | Rollback owner | LC04 / LC06 |
| `import_lock_ref` | Operator | LC06 |
| `sanitized_receipt_destination_ref` | Operator | LC06 |
| `local_receipt_handling_ref` | Operator / Security owner | LC06 |
| `operator_ref` | Operator | LC04 / LC06 |
| `security_ref` | Security owner | LC04 / LC06 |
| `legal_data_ref` | Legal-data owner | LC04 / LC06 |
| `customer_scope_ref` | Customer-scope owner | LC04 / LC06 |

The dry-run phase validates only the refs needed before LC04. The write phase
validates the full LC06 ref set, including `dryrun_pass_ref`, write window,
snapshot, storage containment, import lock, and approval refs.

The refs file must not contain raw OneDrive paths, customer file names, document
body text, source object keys, private tenant identifiers, provider console
metadata, cookies, tokens, or secrets.

## OP-02 Refs Intake Gate

Run:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode refs-intake \
  --phase dryrun \
  --run-id onedrive-staging-20260623-155501 \
  --candidate-id ad0e04b500f42b28 \
  --mapping .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/real-refs.mapping.local.json \
  --sanitized-out .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/refs-intake.dryrun.sanitized.json
```

Expected PASS:

- `gate_status=pass`;
- zero blockers;
- owner summary has no blocked fields;
- output contains field statuses only, not ref values.

This PASS allows LC04 dry-run preparation only. It does not approve LC06 write
preflight, pilot import, customer-wide import, Gemma indexing execution, or
source-of-truth cutover. If this gate blocks, do not run LC04 dry-run.

## OP-03 Real Dry-Run Inputs

Prepare the local-only scope manifest for candidate `ad0e04b500f42b28`.
The manifest must be derived from the staged control evidence and must remain
outside git. It may contain local operational IDs, but operator-facing summaries
must stay sanitized.

Required input refs:

- mapping ref;
- permission ref;
- retention ref;
- rollback ref;
- selected candidate id;
- one pilot Matter ref.

Stop if the manifest includes more than the selected pilot Matter.

## OP-04 LC04 Real Dry-Run

Run:

```bash
node tools/migration/onedrive-pilot-dryrun.mjs \
  --mode dry-run \
  --run-id onedrive-staging-20260623-155501 \
  --candidate-id ad0e04b500f42b28 \
  --scope-manifest <local-only-scope-manifest> \
  --mapping-ref <ONEDRIVE-MAPPING-REF> \
  --permission-ref <ONEDRIVE-PERMISSION-REF> \
  --retention-ref <ONEDRIVE-RETENTION-REF> \
  --rollback-ref <ONEDRIVE-ROLLBACK-REF> \
  --sanitized-out .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/pilot-dryrun-report.sanitized.json
```

PASS requires:

- no placeholder mapping refs;
- no Vault DB write;
- no Vault storage write;
- no blocked items;
- no retryable items unless an approved handling ref is recorded;
- deterministic ready, skipped, and expected write counts.

## OP-05 Synthetic Baseline

Confirm the existing LC05 synthetic import receipt still passes. Synthetic
write PASS proves only fixture behavior; it does not prove real pilot import.
The LC05 write mapping must not contain placeholder mapping or write refs.

Required output:

```text
.omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/synthetic-import-receipt.sanitized.json
```

## OP-06 LC06 Write Preflight

Run only after OP-02, OP-04, and OP-05 PASS. First confirm the full write-phase
refs intake gate:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode refs-intake \
  --phase write \
  --run-id onedrive-staging-20260623-155501 \
  --candidate-id ad0e04b500f42b28 \
  --mapping .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/real-refs.mapping.local.json \
  --sanitized-out .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/refs-intake.write.sanitized.json
```

Then run:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode write-preflight \
  --run-id onedrive-staging-20260623-155501 \
  --candidate-id ad0e04b500f42b28 \
  --mapping .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/real-refs.mapping.local.json \
  --dryrun-report .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/pilot-dryrun-report.sanitized.json \
  --synthetic-receipt .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/synthetic-import-receipt.sanitized.json \
  --sanitized-out .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/pilot-write-preflight.sanitized.json
```

PASS authorizes scheduling one pilot Matter write window. It does not execute
the pilot write.

## OP-07 Write Window

Before pilot write-mode:

- import lock is acquired;
- DB snapshot ref is recorded;
- storage containment ref is recorded;
- rollback owner is available;
- sanitized receipt destination is confirmed;
- detailed local receipt handling is confirmed;
- user-facing pilot team is ready to validate the Matter in Vault.

Stop if rollback would require hard delete or audit mutation.

## OP-08 Pilot Write

Run only after OP-07 is complete and the operator explicitly authorizes the
window:

```bash
node tools/migration/onedrive-pilot-import.mjs \
  --mode pilot-write \
  --run-id onedrive-staging-20260623-155501 \
  --candidate-id ad0e04b500f42b28 \
  --scope-manifest <local-only-scope-manifest> \
  --mapping-ref <ONEDRIVE-MAPPING-REF> \
  --permission-ref <ONEDRIVE-PERMISSION-REF> \
  --retention-ref <ONEDRIVE-RETENTION-REF> \
  --rollback-ref <ONEDRIVE-ROLLBACK-REF> \
  --write-window-ref <ONEDRIVE-WRITE-WINDOW-REF> \
  --sanitized-out .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/pilot-import-receipt.sanitized.json \
  --local-receipt-out .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/pilot-import-receipt.local.ndjson.gz
```

The detailed local receipt must remain protected and must not be committed.

## OP-09 LC07 Reconciliation

Run:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode reconcile \
  --run-id onedrive-staging-20260623-155501 \
  --candidate-id ad0e04b500f42b28 \
  --mapping .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/real-refs.mapping.local.json \
  --dryrun-report .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/pilot-dryrun-report.sanitized.json \
  --import-receipt .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/pilot-import-receipt.sanitized.json \
  --sanitized-out .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/pilot-reconciliation.sanitized.json
```

PASS requires dry-run ready count, import receipt count, storage count, document
count, version count, and audit count to reconcile.

## OP-10 LC08 Gemma Readiness

Run:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode gemma-readiness \
  --run-id onedrive-staging-20260623-155501 \
  --mapping .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/real-refs.mapping.local.json \
  --reconciliation-report .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/pilot-reconciliation.sanitized.json \
  --sanitized-out .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/pilot-gemma-readiness.sanitized.json
```

Gemma indexing may be queued only after permission-before-AI review confirms the
eligible documents. If `ai_allowed_default=false`, readiness can PASS while
queue eligibility remains policy-blocked.

## OP-11 LC09 Bulk Wave Plan

Run only after OP-09 PASS and OP-10 PASS:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode wave-plan \
  --run-id onedrive-staging-20260623-155501 \
  --wave-plan <post-pilot-wave-plan.local.json> \
  --reconciliation-report .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/pilot-reconciliation.sanitized.json \
  --gemma-readiness .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/pilot-gemma-readiness.sanitized.json \
  --sanitized-out .omo/evidence/OP-ONEDRIVE-PILOT-REAL-RUN/bulk-wave-plan.sanitized.json
```

Each wave must be a bounded Matter batch. The default maximum is five Matters
per wave. Customer-wide, full-corpus, and all-Matters scopes are blocked.

## OP-12 Cutover Packet

Cutover is separate from import. Vault can become source of truth only after:

- pilot validation PASS;
- reconciliation PASS;
- rollback rehearsal PASS;
- explicit source-of-truth approval ref for the same scope;
- OneDrive read-only retention period is defined;
- support owner accepts the transition.

No step in this plan grants cutover by itself.

## Operator Summary Template

Use this template after each OP unit:

```text
unit=<OP-ID>
run_id=onedrive-staging-20260623-155501
candidate_id=ad0e04b500f42b28
gate_status=<pass|blocked>
blockers=<count>
next_allowed_action=<action>
not_claimed=customer-wide import, OneDrive connected state, Office open/save/sync, Gemma indexing execution, source-of-truth cutover
```
