# Post-R14 Recovery PACK Manifest v2

Status: AUTHORIZED_TECHNICAL_GATES_ONLY

- Manifest: POST-R14-RECOVERY-PACK-MANIFEST-V2
- Payload SHA-256: 1319ec64e8e9ede4b7795f4a78af50f12a274045cd5a97fa59350f01fb279be8
- Registration PACK: PACK-R14-03
- Registration branch: feat/pack-r14-03-recovery-manifest
- Amendment: PACK-R14-03-AMENDMENT-01
- Amendment branch: feat/pack-r14-03-recovery-manifest-v2
- Amendment preimage: 5c722f8a4b1f0a4c99b41089664c98ad151db2b8
- Authority: TASK6B-TECHNICAL-GATES-AUTHORITY-20260717
- Amendment authority: DIRECT-OPERATOR-AGGREGATE-EXECUTION-20260717
- Primary TUW coverage: 117/117
- Dirty-path coverage: 893/893
- Ownership-record coverage: 4801/4801
- Non-overlay Git sources: 20 commits / 9 paths
- Test-anchor source contract: bd6c1a74d4467b14bae8e9fe16e1963dc6ea763baad3ec4c624afa834f90b886
- Planned acceptance-test gaps: 7
- Quarantine after amendment: 28 hunks / 22 paths
- Migration coverage: 86/86; renumbered in dependency/PACK order: 84

This manifest is an execution authorization map only. It is not product implementation,
migration execution, deployment, external release, or go-live evidence.

## Amendment correction

The v1 overlay-only model could not execute Task 7: PACK-R14-04 had zero overlap
with the required five release-history paths and would have reapplied stale 110-row
historical-base material. Version 2 quarantines those 19 stale hunks and registers
the exact 19-commit release-history range plus the separate one-commit LawOS source.

Every PACK now distinguishes effective payload files, preserved-overlay files,
non-overlay source files, candidate bookkeeping, and one-row transition commits.
Every raw test anchor is retained with an explicit disposition. Only tests available
at the exact base, created by the current PACK, or supplied by a transitive predecessor
become focused commands; later-owned anchors are deferred and seven normative tests
that are explicitly planned but not yet created remain completion-blocking gaps and
exact planned-create plus focused-test obligations of their owning implementation PACK.
The receipt and exact EOF execution-ledger append precede transitions; transition
commits then change exactly the four sealed 117-row control-plane paths. Any later
non-control-plane push invalidates the candidate binding and all exact-head gates.

## Registered non-overlay Git sources

| Source | PACK | Commits | Paths | Mode |
|---|---|---:|---:|---|
| TASK7-RELEASE-HISTORY-19 | PACK-R14-04 | 19 | 5 | PRESERVE_COMMIT_SEQUENCE |
| TASK8-LAWOS-REFLECTION-0B39414 | PACK-R14-09 | 1 | 4 | PRESERVE_SINGLE_COMMIT_THEN_APPLY_OWNED_OVERLAY_HUNKS |

## PACK sequence

| Seq | PACK | Branch | Mode | TUWs | Primary | Risk |
|---:|---|---|---|---:|---:|---|
| 1 | PACK-R14-04 | feat/pack-r14-04-release-history | HISTORICAL_RECOVERY | 3 | 0 | M |
| 2 | PACK-R14-05 | feat/pack-r14-05-appendix-audit | STATUS_ADJUDICATION | 7 | 7 | M |
| 3 | PACK-R14-06 | feat/pack-r14-06-small-candidate-adjudication | READJUDICATION | 5 | 5 | C |
| 4 | PACK-R14-07 | feat/pack-r14-07-matter-candidate-adjudication | READJUDICATION | 6 | 6 | C |
| 5 | PACK-R14-08 | feat/pack-r14-08-dependency-candidate-adjudication | READJUDICATION | 8 | 8 | C |
| 6 | PACK-R14-09 | feat/pack-r14-09-lawos-reflection | CODE_RECOVERY | 4 | 0 | H |
| 7 | PACK-R14-10 | feat/pack-r14-10-evidence-factory | CONTROL_SUPPORT | 4 | 0 | M |
| 8 | PACK-R14-11 | feat/pack-r14-11-document-diagnostics | EVIDENCE_OR_IMPLEMENTATION | 4 | 4 | C |
| 9 | PACK-R14-12 | feat/pack-r14-12-email-outlook-fixtures | EVIDENCE_OR_IMPLEMENTATION | 5 | 4 | C |
| 10 | PACK-R14-13 | feat/pack-r14-13-document-search-fixtures | EVIDENCE_OR_IMPLEMENTATION | 3 | 3 | C |
| 11 | PACK-R14-14 | feat/pack-r14-14-workflow-operations | EVIDENCE_OR_IMPLEMENTATION | 5 | 5 | C |
| 12 | PACK-R14-15 | feat/pack-r14-15-search-graph-citations | EVIDENCE_OR_IMPLEMENTATION | 4 | 4 | C |
| 13 | PACK-R14-16 | feat/pack-r14-16-safe-local-ai | EVIDENCE_OR_IMPLEMENTATION | 4 | 4 | C |
| 14 | PACK-R14-17 | feat/pack-r14-17-identity-worker-platform | EVIDENCE_OR_IMPLEMENTATION | 5 | 5 | C |
| 15 | PACK-R14-18 | feat/pack-r14-18-performance-operations | EVIDENCE_OR_IMPLEMENTATION | 4 | 4 | C |
| 16 | PACK-R14-19 | feat/pack-r14-19-format-outlook-transport | EVIDENCE_OR_IMPLEMENTATION | 4 | 4 | C |
| 17 | PACK-R14-20 | feat/pack-r14-20-comparison-email-depth | EVIDENCE_OR_IMPLEMENTATION | 5 | 5 | C |
| 18 | PACK-R14-21 | feat/pack-r14-21-permission-local-ai | EVIDENCE_OR_IMPLEMENTATION | 7 | 7 | C |
| 19 | PACK-R14-22 | feat/pack-r14-22-document-editing-core | IMPLEMENTATION | 3 | 0 | M |
| 20 | PACK-R14-23 | feat/pack-r14-23-redline-source-gate | IMPLEMENTATION | 3 | 0 | M |
| 21 | PACK-R14-24 | feat/pack-r14-24-permission-conflict-decision | GOVERNANCE_DECISION | 3 | 0 | C |
| 22 | PACK-R14-25 | feat/pack-r14-25-matter-lifecycle | EVIDENCE_OR_IMPLEMENTATION | 5 | 4 | C |
| 23 | PACK-R14-26 | feat/pack-r14-26-matter-closure-work | EVIDENCE_OR_IMPLEMENTATION | 5 | 5 | C |
| 24 | PACK-R14-27 | feat/pack-r14-27-folder-ocr-search-scale | EVIDENCE_OR_IMPLEMENTATION | 6 | 6 | C |
| 25 | PACK-R14-28 | feat/pack-r14-28-graph-knowledge-review | EVIDENCE_OR_IMPLEMENTATION | 7 | 6 | C |
| 26 | PACK-R14-29 | feat/pack-r14-29-contract-knowledge-prereqs | EVIDENCE_OR_IMPLEMENTATION | 6 | 5 | C |
| 27 | PACK-R14-30 | feat/pack-r14-30-controlled-content-chain | GOVERNANCE_OR_IMPLEMENTATION | 5 | 3 | C |
| 28 | PACK-R14-31 | feat/pack-r14-31-m365-chain | EXTERNAL_GATED | 5 | 4 | C |
| 29 | PACK-R14-32 | feat/pack-r14-32-external-model-chain | EXTERNAL_GATED | 3 | 2 | C |
| 30 | PACK-R14-33 | feat/pack-r14-33-aws-dr-chain | EXTERNAL_GATED | 3 | 2 | C |
| 31 | PACK-R14-34 | feat/pack-r14-34-desktop-capability | EXTERNAL_GATED | 3 | 1 | C |
| 32 | PACK-R14-35 | feat/pack-r14-35-contract-knowledge-late | EVIDENCE_OR_IMPLEMENTATION | 4 | 4 | C |
| 33 | PACK-R14-36 | feat/pack-r14-36-shared-foundation | SHARED_HUNK_RECOVERY | 5 | 0 | C |
| 34 | PACK-R14-37 | feat/pack-r14-37-shared-api | SHARED_HUNK_RECOVERY | 3 | 0 | C |
| 35 | PACK-R14-38 | feat/pack-r14-38-shared-web | SHARED_HUNK_RECOVERY | 3 | 0 | C |
| 36 | PACK-R14-39 | feat/pack-r14-39-shared-integration | SHARED_HUNK_RECOVERY | 3 | 0 | C |
| 37 | PACK-R14-40 | feat/pack-r14-40-shared-worker | SHARED_HUNK_RECOVERY | 3 | 0 | C |
| 38 | PACK-R14-41 | feat/pack-r14-41-exact-sha-validation | VERIFICATION | 3 | 0 | M |
| 39 | PACK-R14-42 | feat/pack-r14-42-rendered-web-qa | MANUAL_QA | 3 | 0 | M |
| 40 | PACK-R14-43 | feat/pack-r14-43-desktop-artifact-qa | EXTERNAL_GATED_QA | 3 | 0 | C |
| 41 | PACK-R14-44 | feat/pack-r14-44-authorized-external-smoke | EXTERNAL_GATED_QA | 3 | 0 | C |
| 42 | PACK-R14-45 | feat/pack-r14-45-baseline8-final | FINAL_VALIDATION | 3 | 0 | C |
| 43 | PACK-R14-46 | feat/pack-r14-46-final-independent-reviews | FINAL_REVIEW | 4 | 0 | C |

## Migration decision

The dirty overlay migration filenames are not mergeable in their existing feature order:
source ordinal 0094 begins with H11 while its hard C11 dependency is later. The manifest
therefore preserves all 86 source files by hash/owner but assigns target ordinals 0094-0179
in dependency-valid PACK order. Each migration lands with its execution PACK, its down path,
reference updates, fresh database up/down/up proof, and full integration proof.

## Review and merge

Risk C/H PACKs require independent Codex review plus every exact-head automated and
deterministic gate. Claude and human approval waits are waived only by the recorded
aggregate-goal authority. Any post-review push invalidates review and gates.

## Global prohibitions

- no docs/package change
- no private evidence publication or dereference
- no unassigned path or hunk staging
- no migration execution by manifest registration
- no product completion inherited from bootstrap or historical evidence
- no conditional unit execution without active written trigger
- no external operation without separately scoped authority
- no skipped or reduced technical gate
- no deployment, release, or go-live claim from this manifest
