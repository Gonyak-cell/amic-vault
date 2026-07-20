# AMIC Vault Current Document Truth Map

Date: 2026-07-06
Status: current documentation routing map
Scope: repo documentation outside frozen `docs/package/**`

## Current Repo Anchor

- Branch: `codex/release-freeze-20260705-current`
- HEAD: `0b39414`
- Frozen normative package: `docs/package/**`
- Maintenance inventory: `docs/maintenance/document-inventory-2026-07-06.csv`
- Cleanup plan: `docs/maintenance/document-cleanup-plan-2026-07-06.md`
- Update plan: `docs/maintenance/document-update-plan-2026-07-06.md`

## Current Release Truth

| Lane | Current document | Current truth |
| --- | --- | --- |
| Production customer document import | `docs/release/production-customer-document-import-execute-closeout.md` | PASS through final wave-225 |
| Production source-of-truth cutover | `docs/release/production-source-cutover-execute-closeout.md` | Executed under separate approval |
| Post-cutover next gates | `docs/release/production-post-cutover-next-gates.md` | Current next-gate package |
| Gemma production indexing claim | `docs/release/production-post-cutover-next-gates.md` | Not executed / not claimed |
| OneDrive connected-state claim | `docs/release/production-post-cutover-next-gates.md` | Not claimed |
| Office open/save/sync claim | `docs/release/production-post-cutover-next-gates.md` | Not claimed |
| Customer-wide go-live claim | `docs/release/production-post-cutover-next-gates.md` | Not claimed |

## Current DMS Uplift Truth

| Lane | Current document | Current truth |
| --- | --- | --- |
| DMS uplift source plan | `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md` | Canonical 110-unit source plan |
| Strict-completion ledger | `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.md` and `.json` | Generated 2026-07-05 |
| Strict-completion status counts | `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.md` | 19 `COMPLETE_CANDIDATE`, 80 `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`, 11 `EXTERNAL_BLOCKED` |
| 80-row local evidence plan | `docs/lazycodex/lcx-tuw80-complete-candidate-execution-plan-2026-07-05.md` | Current plan for local-evidence rows |
| 80-row traceability | `docs/lazycodex/lcx-tuw80-complete-candidate-traceability-2026-07-05.md` | Current row-level traceability |
| Handoff section 03 | `docs/handoff/dms-uplift-2026-07/03_workplan-TUW-snapshot.md` | Exact duplicate of canonical source plan; keep as package pointer after cleanup approval |

## Historical Evidence Rule

Older launch, OneDrive, desktop, UI, staging, pilot, and release documents may still contain valid evidence for their original SHA or approval lane. Treat them as historical evidence unless their header explicitly says they are the current source for a lane.

When a historical document conflicts with this map:

1. Do not delete it only because it is old.
2. Add a short historical or superseded note near the top.
3. Link to the current document above.
4. Preserve sanitized evidence references and approval refs.

## Non-Claims To Preserve

Do not write or imply these as complete without a matching approval and receipt:

- OneDrive connected-state claim
- Office open/save/sync claim
- Gemma indexing execution claim
- Customer-wide go-live claim
- WOPI/browser coauthoring runtime approval
- External model route approval

## Verification

Before committing any document update based on this map:

```bash
git diff -- docs/package
git diff --check -- docs
rg -n "customer-wide go-live|Gemma indexing executed|OneDrive connected-state claim|Office open/save/sync claim|ready for separate approval|Tauri is blocked|current checkout|TECHNICAL-READY|EXTERNAL-EVIDENCE" docs --glob '!package/**'
```
