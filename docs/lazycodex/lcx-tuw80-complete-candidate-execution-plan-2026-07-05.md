# LCX-TUW80 Complete Candidate Execution Plan

Date: 2026-07-05
Status: LazyCodex implementation and evidence plan
Scope: all current `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE` rows in the 110 TUW strict-completion ledger

## Source Of Truth

- Source ledger: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.json` generated at `2026-07-05T07:12:51.511Z`
- Source plan: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md`
- Execution policy: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_EXECUTION_POLICY.md`
- Override ledger: `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json`

Current counts:

- COMPLETE_CANDIDATE: 19
- LOCAL_IMPLEMENTED_NEEDS_EVIDENCE: 80
- EXTERNAL_BLOCKED: 11

This plan covers exactly 80 rows: `B1`, `B2`, `B4`, `B6`, `C1`, `C2`, `C4`, `C5`, `C6`, `D4`, `E1`, `E3`, `E4`, `F4`, `G1`, `H1`, `H2`, `H5`, `H6`, `A8`, `A9`, `A11`, `A12`, `B7`, `B8`, `B9`, `B10`, `B11`, `C8`, `C9`, `C10`, `C11`, `C12`, `C13`, `D6`, `D7`, `D8`, `D10`, `E5`, `E6`, `E7`, `E9`, `E10`, `E11`, `E12`, `F1`, `F2`, `F3`, `F6`, `F7`, `F8`, `F9`, `F10`, `F11`, `G3`, `G5`, `G6`, `G7`, `G8`, `G10`, `G12`, `G13`, `H7`, `H9`, `H11`, `A13`, `B14`, `C14`, `D9`, `D11`, `D12`, `E14`, `F12`, `F13`, `F14`, `G4`, `G14`, `H12`, `H13`, `H14`.

## Completion Standard

A row can become `COMPLETE_CANDIDATE` only after all row-specific gaps are closed and the full fresh evidence gate is recorded. Existing code, generated ledger rows, and old test passes do not prove completion.

Every promoted row must have current evidence for:

- rerun focused TUW unit/integration/security/audit tests
- rerun affected package lint/typecheck/build checks
- rerun migration migrate/rollback/migrate/seed where the TUW touches DB schema or data gates
- attempt changed-file LSP diagnostics and record clean output or exact unavailable-tool evidence
- run scoped git diff hygiene checks
- update `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` with fresh evidenceRefs and remainingGaps
- regenerate `TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` and validate 110-row coverage
- required manual/staging/operator receipt, or an explicit accepted external blocker when the row permits that status

## LazyCodex Execution Modes

| Mode | Purpose | Output |
| --- | --- | --- |
| `repo-close` | Implement or repair repo-local code, tests, migrations, scripts, fixtures, or benchmark harnesses. | Passing focused checks plus updated evidenceRefs. |
| `receipt-intake` | Convert a user/operator manual receipt into sanitized evidence without secrets. | Evidence note and row override update. |
| `manual-run` | Drive a browser/staging/local UI path when credentials and target are available. | Timestamped route/action receipt. |
| `external-smoke` | Run official external API or M365/Office smoke with approved credentials. | Sanitized operational receipt. |
| `promotion-rerun` | Re-run final focused gates after all gaps are closed. | Row moved to `COMPLETE_CANDIDATE` only if all evidence classes are fresh. |

## Work Bundles

Rows can appear in multiple bundles. Bundles are scheduling aids only; the execution unit remains exactly one TUW row.

### LCX-TUW80-P0 공통 증거 인프라와 blocker 제거

Rows (80): `B1`, `B2`, `B4`, `B6`, `C1`, `C2`, `C4`, `C5`, `C6`, `D4`, `E1`, `E3`, `E4`, `F4`, `G1`, `H1`, `H2`, `H5`, `H6`, `A8`, `A9`, `A11`, `A12`, `B7`, `B8`, `B9`, `B10`, `B11`, `C8`, `C9`, `C10`, `C11`, `C12`, `C13`, `D6`, `D7`, `D8`, `D10`, `E5`, `E6`, `E7`, `E9`, `E10`, `E11`, `E12`, `F1`, `F2`, `F3`, `F6`, `F7`, `F8`, `F9`, `F10`, `F11`, `G3`, `G5`, `G6`, `G7`, `G8`, `G10`, `G12`, `G13`, `H7`, `H9`, `H11`, `A13`, `B14`, `C14`, `D9`, `D11`, `D12`, `E14`, `F12`, `F13`, `F14`, `G4`, `G14`, `H12`, `H13`, `H14`

Execution rule: process one TUW at a time. Do not collapse rows inside the bundle; the bundle only groups shared setup and receipt collection.

### LCX-TUW80-P1 manual/staging receipt만 남은 우선 행

Rows (37): `B2`, `B4`, `B6`, `E1`, `E3`, `E4`, `F4`, `G1`, `H6`, `A8`, `A9`, `A11`, `A12`, `B8`, `C9`, `D10`, `E5`, `E6`, `E7`, `E9`, `E10`, `E11`, `F1`, `F2`, `F6`, `F8`, `F9`, `F11`, `G3`, `G6`, `G7`, `G8`, `G13`, `A13`, `D11`, `E14`, `F13`

Execution rule: process one TUW at a time. Do not collapse rows inside the bundle; the bundle only groups shared setup and receipt collection.

### LCX-TUW80-P2 M365/Outlook/Office/Entra receipt 공장

Rows (24): `B1`, `C1`, `C4`, `C5`, `C6`, `D4`, `H2`, `B9`, `B10`, `B11`, `C8`, `C11`, `C12`, `C13`, `D6`, `D7`, `D8`, `F3`, `B14`, `C14`, `D9`, `D12`, `G14`, `H14`

Execution rule: process one TUW at a time. Do not collapse rows inside the bundle; the bundle only groups shared setup and receipt collection.

### LCX-TUW80-P3 실제 fixture/import receipt 공장

Rows (16): `B1`, `C1`, `C2`, `C6`, `H1`, `B9`, `B10`, `B11`, `C8`, `C11`, `C12`, `D6`, `D8`, `H11`, `D12`, `H12`

Execution rule: process one TUW at a time. Do not collapse rows inside the bundle; the bundle only groups shared setup and receipt collection.

### LCX-TUW80-P4 성능/대량/AI-runtime benchmark 공장

Rows (9): `B1`, `H5`, `B7`, `F7`, `H7`, `D9`, `F12`, `G4`, `H13`

Execution rule: process one TUW at a time. Do not collapse rows inside the bundle; the bundle only groups shared setup and receipt collection.

### LCX-TUW80-P5 남은 repo 구현이 필요한 행

Rows (4): `C14`, `F14`, `G14`, `H12`

Execution rule: process one TUW at a time. Do not collapse rows inside the bundle; the bundle only groups shared setup and receipt collection.

### LCX-TUW80-P6 외부 운영/API/S3/SNS 증거 행

Rows (19): `B1`, `C1`, `C4`, `C5`, `C6`, `H5`, `B10`, `E12`, `F7`, `F10`, `G10`, `G12`, `H9`, `B14`, `C14`, `D12`, `G14`, `H12`, `H14`

Execution rule: process one TUW at a time. Do not collapse rows inside the bundle; the bundle only groups shared setup and receipt collection.

### LCX-TUW80-P7 의존 TUW 완료 후에만 승격 가능한 행

Rows (12): `C5`, `A12`, `B11`, `C11`, `C12`, `C13`, `E10`, `H11`, `A13`, `C14`, `E14`, `F12`

Execution rule: process one TUW at a time. Do not collapse rows inside the bundle; the bundle only groups shared setup and receipt collection.

## Recommended Order

- Run `LCX-TUW80-P0`: clear common broad blockers, restore or disposition LSP diagnostics, and prepare receipt templates.
- Run `LCX-TUW80-P5`: close rows with actual repo implementation gaps before asking for manual proof.
- Run `LCX-TUW80-P1`: collect the easiest manual/staging receipts and rerun promotion gates one row at a time.
- Run `LCX-TUW80-P2` and `P3` together when M365/fixture assets are available, because several Outlook/email rows depend on the same environment and samples.
- Run `LCX-TUW80-P4` after local services and data factories are stable enough for large benchmark runs.
- Run `LCX-TUW80-P6` only with approved external credentials or owner-reviewed operational receipts.
- Revisit `LCX-TUW80-P7` after prerequisite rows have either become `COMPLETE_CANDIDATE` or are explicitly accepted as external blockers.

## Operator Receipt Shape

- TUW ID and exact acceptance path exercised
- environment name and timestamp
- actor role, not personal email or account id
- safe Matter/document/work/audit references or hashes only
- screenshot or command output when required, with secrets and raw confidential content redacted
- pass/fail result and any blocker statement

## Codex Promotion Loop

1. Read the row in the generated ledger and the source TUW block.
2. Close repo-local gaps first if the row still has code/test/migration/performance work.
3. If only manual/staging/external/LSP evidence remains, record the exact gap and wait for the receipt rather than broadening the row.
4. When the receipt arrives, rerun the focused gate and update overrides with concrete evidenceRefs.
5. Regenerate the ledger and check that the row alone can be promoted without weakening the global taxonomy.

Detailed row-by-row traceability is in `docs/lazycodex/lcx-tuw80-complete-candidate-traceability-2026-07-05.md`.
