# 117 TUW Strict Completion Execution Policy

Updated: 2026-07-17 KST

This is the active operating policy for the 117-unit strict-completion goal.
The authoritative plan is `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md`.
The active generated surfaces are:

- `docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json`
- `docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.md`
- `docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json`

The four 110-unit records are immutable historical artifacts, not active
outputs. They remain byte-identical at these paths:

- `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_EXECUTION_POLICY.md`
- `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.json`
- `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.md`
- `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json`

## Active snapshot

The active plan contains exactly 117 unique rows:

- Horizon 1: 38
- Horizon 2: 61
- Horizon 3: 18 (including conditional B20)
- `COMPLETE_CANDIDATE`: 19
- `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`: 80
- `EXTERNAL_BLOCKED`: 11
- `UNADJUDICATED`: 7

The seven newly registered rows are B15, B16, B17, C16, B18, B19, and B20.
Each remains `UNADJUDICATED` until its acceptance block is adjudicated and
current evidence is recorded. `UNADJUDICATED` is never a completion claim.

## Operating rule

Do not rely on chat memory or this policy alone. Before each continuation, read
the active 117 ledger and its overrides. For each TUW, close the repo-local
gates required by its acceptance block: implementation, unit/integration/
security/audit tests, focused package checks, migration roundtrip where
applicable, changed-file diagnostics where available, `git diff --check`, and
current evidence references.

Do not promote rows because a file exists, a parser generated a row, or a test
passed in isolation. Keep `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE` when manual,
staging, owner-review, or external evidence is still missing. Keep
`EXTERNAL_BLOCKED` only for an opaque external operational dependency. Keep
`UNADJUDICATED` for rows without a current adjudication; do not infer a status.

Promote to `COMPLETE_CANDIDATE` only when every required evidence class is
present and current. Product readiness and go-live are not claimed by this
ledger while any row is below `COMPLETE_CANDIDATE` or an accepted
`EXTERNAL_BLOCKED` state.

## Deterministic generation

`tools/execution/build-tuw-status-ledger.mjs` reads the active overrides and
derives `generatedAt` from their deterministic `updatedAt` metadata. Normal
generation writes only the active 117 JSON and Markdown ledgers; policy and
overrides are inputs. `--check` compares the in-memory expected bytes and does
not write when they match. Repeated generation from identical inputs must be
byte-identical.
