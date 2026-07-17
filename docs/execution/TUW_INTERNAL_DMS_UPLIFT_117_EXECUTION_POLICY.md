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

The active plan contains exactly 117 unique rows with these fixed historical
classifications:

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

Every row is currently `validationState: BOOTSTRAP_PREIMAGE`, with
`validatedCandidateSha: null`, `validationScope: null`, and an empty current
`evidenceRefs` array. The fixed status labels are an inert imported preimage,
not current completion. In particular, the 19 `COMPLETE_CANDIDATE` labels do
not mean that any row is currently validated. The current validation counts
are exactly 117 `BOOTSTRAP_PREIMAGE` and zero `CURRENT_VALIDATED`.

All legacy `{type, ref, note}` records are preserved value-for-value and
order-for-order in `historicalEvidenceRefs`. Historical evidence has zero
current-gate weight and must never be copied into current evidence.

## Task 5 technical contract

This intermediate implements the row, evidence, blocker, metadata, and check
mode portions of `PACK-R14-02-TASK5-SCHEMA-V1` without claiming the TUW-004
transition journal exists.

Each row carries `historicalEvidenceRefs`, current `evidenceRefs`,
`validationState`, candidate and validation-scope bindings, `blockerClass`,
sorted unique `blockingRefs`, `acceptedBlockers`, and
`dependencyConditions`. In the inert bootstrap:

- only `EXTERNAL_BLOCKED` rows use `EXTERNAL_EVIDENCE`, each with a non-empty
  deterministic source-plan reference;
- every other row uses `NONE` with no blocking references;
- accepted blockers and dependency conditions are empty;
- no blocker is accepted and no dependency is normalized by this TUW.

Current evidence is a separate exact schema. It requires a SHA-256 artifact
hash, UTC millisecond timestamp, exact candidate SHA, validation-scope digest,
environment, and provenance. Evidence is rejected when required fields or
enums are wrong, when it is more than 30 days old or later than the deterministic
`asOf`, when its approval is expired, when candidate or scope binding drifts,
or when test counts fail closed. Opaque refs are never dereferenced. `/tmp`,
`/private/tmp`, `file:` URIs, and repo-first-segment `.omo` or `tmp` refs are
classified lexically as non-durable. Generated or non-durable evidence alone
cannot support completion.

Accepted blockers are limited to registered `OWNER_DECISION`,
`EXTERNAL_EVIDENCE`, or `SOURCE_ACCESS` classes on an external dependency,
with exact candidate/scope binding and a maximum 90-day acceptance window.
Policy conflicts, dependency/tooling blockers, and hard or conditional
dependencies cannot be accepted. An accepted blocker never makes a row
complete, and `EXTERNAL_BLOCKED` is never a completion state.

## Operating rule

Do not rely on chat memory or this policy alone. Before each continuation, read
the active 117 ledger and its overrides. For each TUW, close the repo-local
gates required by its acceptance block: implementation, unit/integration/
security/audit tests, focused package checks, migration roundtrip where
applicable, changed-file diagnostics where available, `git diff --check`, and
current evidence references.

Do not promote rows because a file exists, a parser generated a row, a legacy
record names a passing test, or a test passed in isolation. Keep
`LOCAL_IMPLEMENTED_NEEDS_EVIDENCE` when manual, staging, owner-review, or
external evidence is still missing. Keep `EXTERNAL_BLOCKED` only for an opaque
external operational dependency. Keep `UNADJUDICATED` for rows without a
current adjudication; do not infer a status.

This bootstrap does not authorize a promotion or demotion. TUW-004 must first
create and validate the ordered one-row transition journal. A future
`CURRENT_VALIDATED` `COMPLETE_CANDIDATE` must have no remaining gaps, no
blocker or accepted blocker, at least one durable non-generated evidence item,
and exact candidate/scope binding. Product readiness and go-live are never
claimed by this ledger or by an accepted blocker.

## Deterministic generation

`tools/execution/build-tuw-status-ledger.mjs` reads the active overrides and
derives `generatedAt` and `generationMetadata.asOf` from the exact deterministic
`overrides.updatedAt` value. It records SHA-256 over the exact source-plan and
overrides UTF-8 bytes. The phase is `BOOTSTRAP_IMPORT`, and
`transitionJournalSha256` is honestly `null` because only TUW-004 creates that
journal. No wall-clock value is consulted.

Normal generation writes only the active 117 JSON and Markdown ledgers; policy
and overrides are inputs. `--check` parses, validates, and renders both surfaces
in memory before comparing exact bytes independently. It performs no mkdir,
write, rename, temporary-file creation, chmod, touch, or utimes operation on a
match, either-surface drift, missing output, or any validation failure. Repeated
normal generation from identical inputs must be byte-identical.

## Deliberate TUW-004 remainder

This TUW does not create a transition journal, normalize dependency aliases,
replay transitions, accept a blocker, promote or demote any row, or claim final
schema closeout. TUW-004 must create the journal, replace the null journal hash
with its exact file-byte SHA-256, normalize dependencies under the registered
alias table, and enforce journal/prefix replay before any state transition.
