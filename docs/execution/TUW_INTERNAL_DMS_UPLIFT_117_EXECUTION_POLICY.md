# 117 TUW Strict Completion Execution Policy

Updated: 2026-07-17 KST

This is the active operating policy for the 117-unit strict-completion goal.
The authoritative plan is `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md`.
The active control-plane surfaces are:

- `docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_TRANSITION_JOURNAL.json`
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
Each remains `UNADJUDICATED` until a journal entry records its current
adjudication. `UNADJUDICATED` is never a completion claim.

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

The active surfaces implement the row, dependency, evidence, blocker,
transition-journal, replay, phase, metadata, and check-mode portions of
`PACK-R14-02-TASK5-SCHEMA-V1`. The journal is the sole ordered authority for
changes after the inert bootstrap; materialized overrides and both generated
ledgers must equal its full replay.

Each row carries `historicalEvidenceRefs`, current `evidenceRefs`,
`validationState`, candidate and validation-scope bindings, `blockerClass`,
sorted unique `blockingRefs`, `acceptedBlockers`, and
`dependencyConditions`. In the inert bootstrap:

- only `EXTERNAL_BLOCKED` rows use `EXTERNAL_EVIDENCE`, each with a non-empty
  deterministic source-plan reference;
- every other row uses `NONE` with no blocking references;
- accepted blockers and dependency conditions are empty;
- no blocker is accepted.

Dependencies are normalized into ordered `{id, kind}` records. The parser
recognizes only explicit TUW markers and the exact 17-entry alias registry,
which emits 18 records in source order. It splits commas and arrows only at
parenthesis depth zero. Bare, malformed, duplicate, self, unknown, cyclic, or
unresolved `CAP-*` dependencies fail closed. `hard` dependencies always gate;
`conditional` dependencies gate only when their registered condition is
active; unknown conditions reject. Current completion also requires every
active gating TUW dependency to be current complete. This includes A10 after
A9 and A7 only after both A3 and A6 are current complete.

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
the active 117 journal, overrides, and both ledgers. For each TUW, close the
repo-local gates required by its acceptance block: implementation, unit/integration/
security/audit tests, focused package checks, migration roundtrip where
applicable, changed-file diagnostics where available, `git diff --check`, and
current evidence references.

Do not promote rows because a file exists, a parser generated a row, a legacy
record names a passing test, or a test passed in isolation. Keep
`LOCAL_IMPLEMENTED_NEEDS_EVIDENCE` when manual, staging, owner-review, or
external evidence is still missing. Keep `EXTERNAL_BLOCKED` only for an opaque
external operational dependency. Keep `UNADJUDICATED` for rows without a
current adjudication; do not infer a status.

Every future state change must replace exactly one whole row in one ordered
journal entry. Replay starts from the embedded sealed `baseOverrides`, verifies
the before and after hashes, advances `updatedAt` to the entry's `recordedAt`,
and validates all 117 rows at every prefix using that prefix timestamp. A pack
may contain 3-8 unique TUWs; only the trailing in-progress TRANSITION pack may
temporarily contain 1-8. Packs are contiguous and cannot reopen, and completion
changes must respect dependency order. `historicalEvidenceRefs` is immutable
across every transition: deletion, insertion, reordering, or text mutation
rejects before the row can be replayed.

Transition kinds are exclusive descriptions of the row delta. Any exit from
`UNADJUDICATED` is `ADJUDICATE`. Outside adjudication, a blockedness change is
`BLOCK` or `UNBLOCK`, a completion-boundary change is `PROMOTE` or `DEMOTE`, and
an unchanged status and blockedness is `REVALIDATE`. A completion-boundary and
blockedness change cannot be combined in one entry, and `REVALIDATE` cannot
change either status or blockedness.

Each transition entry is authorized by the Git commit that first introduced
its immutable transition identity. Later snapshots may recompute only
`previousEntryHash` and `entryHash` as `asOf`, genesis, and the chain advance.
The introducing commit timestamp must equal `recordedAt` and must change
exactly the journal, overrides, and two generated ledgers. It is accepted only
when the exact committed plan, journal, overrides, generated JSON, and generated
Markdown replay and render as one mutually consistent prefix, and the committed
override delta changes only the declared row plus `updatedAt`. Dummy, stale, or
drifted generated ledgers are never accepted. The
`previousAcceptedJournalHead` must equal the immediate prior accepted Git
snapshot's closeout seal hash, final entry hash, or genesis hash. An
uncommitted snapshot uses the latest journal commit; a snapshot already at
HEAD uses the preceding journal commit. Invalid latest or prior snapshots fail
closed instead of authorizing later entries. A closeout commit must preserve
the exact override bytes, change exactly the journal and two generated ledgers,
and pass the same full committed replay and render validation. The final
execution-ledger receipt is
separately limited to its exact approved EOF append; an existing-byte change,
mid-file insertion, or deletion rejects.

The current journal is an empty `BOOTSTRAP_IMPORT`; it authorizes no promotion,
demotion, blocker acceptance, or current validation. A future
`CURRENT_VALIDATED` `COMPLETE_CANDIDATE` must have no remaining gaps, no blocker
or accepted blocker, at least one durable non-generated evidence item, and
exact candidate/scope binding. Product readiness, Task 6B completion, external
release, and go-live are never claimed by this ledger or by an accepted
blocker.

## Deterministic generation

`tools/execution/build-tuw-status-ledger.mjs` reads the exact source-plan,
overrides, and journal UTF-8 bytes. It replays the journal, derives the phase,
and derives `generatedAt` and `generationMetadata.asOf` from `journal.asOf`.
It records SHA-256 over all three exact input byte streams. The current phase is
`BOOTSTRAP_IMPORT`, and `transitionJournalSha256` is the exact journal file hash
`c1ac2b89d7e553968aef8918bab5945431c9257855dddd2da9428d4a355767c7`.
No wall-clock value is consulted. Non-empty entries derive `TRANSITION`; only a
valid closeout seal derives `FINAL_CLOSEOUT`.

Normal generation writes only the active 117 JSON and Markdown ledgers; policy
is documentation, while overrides and the journal are inputs. `--check` parses,
validates, and renders both surfaces
in memory before comparing exact bytes independently. It performs no mkdir,
write, rename, temporary-file creation, chmod, touch, or utimes operation on a
match, either-surface drift, missing output, or any validation failure. Repeated
normal generation from identical inputs must be byte-identical.

## Current claim boundary

TUW-004 creates and validates the journal, typed dependency graph, Git-backed
snapshot lineage, prefix replay, aggregate bounds, phase rules, and exact
journal hash. Its bootstrap contains zero entries and no closeout seal. Status
counts therefore remain 19/80/11/7, validation counts remain 117/0, and no row
has been promoted, demoted, blocked, unblocked, revalidated, or adjudicated by
this change. `FINAL_CLOSEOUT`, Task 6B, product readiness, external release,
and go-live remain unclaimed.
