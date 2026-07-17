# 110 TUW Strict Completion Execution Policy

Updated: 2026-07-06 KST

This file is the durable operating note for the 110 TUW strict-completion goal.
Use it with:

- `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md`
- `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.json`
- `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.md`
- `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json`

## Current Ledger Snapshot

As of 2026-07-06, the current generated strict-completion ledger is timestamped
`2026-07-05T09:03:31.603Z`.

- `COMPLETE_CANDIDATE`: 19
- `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`: 80
- `EXTERNAL_BLOCKED`: 11

Do not promote rows from `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE` to `COMPLETE_CANDIDATE`
without the missing manual, staging, owner-review, LSP, or external operational
receipt named by that row.

## Operating Rule

Do not rely on chat memory. Before each continuation, read the current ledger and this policy.

For each TUW, close repo-local gates first:

- code and migration implementation
- unit/integration/security/audit negative tests required by the TUW
- focused package lint/typecheck/build checks
- migration migrate/rollback/migrate/seed where applicable
- LSP diagnostics attempt
- `git diff --check`
- ledger regeneration and JSON validation

Do not spend a long turn chasing manual, staging, owner-review, or external operational receipts.
When only those receipts remain, freeze the row as `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE` with exact
remaining gaps and move to the next dependency-valid repo-local TUW.

Promote to `COMPLETE_CANDIDATE` only when every required evidence class is present and current,
including manual/staging receipts or a documented external blocker accepted by the row.

## Current Speed Policy

The strict evidence standard stays high, but row execution should be faster:

1. Pick the smallest dependency-valid TUW with repo-local work available.
2. Implement or verify only that TUW.
3. If a local gate can be closed, close it now.
4. If the remaining gate is manual/staging/external or an unavailable tool such as LSP transport,
   record it precisely and advance instead of looping.
5. Never claim product readiness while any row is below `COMPLETE_CANDIDATE` or
   accepted `EXTERNAL_BLOCKED`.

## Recently Fixed Boundary

G5 is locally implemented and remains below `COMPLETE_CANDIDATE` until:

- `/notifications` click-through receipt from `기한 초과 RFI` to the Matter DD tab RFI row is captured.
- Direct changed-file LSP diagnostics succeed instead of `Transport closed`.
