# AMIC Vault Document Cleanup Plan

Date: 2026-07-06
Status: inventory complete; no delete or move executed
Scope: document-like files in `/Users/jws/Projects/amic-vault`

## Operating Boundary

This cleanup lane is documentation maintenance only. It does not implement a PACK/TUW, does not change runtime behavior, and does not alter the frozen package.

Hard boundaries:

- `docs/package/**` is normative and read-only.
- `docs/ledger/**` is append-only / evidence-bearing and must not be rewritten for cleanup.
- ADRs, release closeouts, gate reports, and evidence references are review-only unless a newer approved document clearly supersedes them.
- No document is deleted only because it is old.
- Private or operational evidence must stay referenced by safe IDs/paths only; do not inline raw receipts, secrets, customer document text, tokens, private endpoints, or screenshots with confidential matter data.

Generated inventory:

- `docs/maintenance/document-inventory-2026-07-06.csv`

## Inventory Summary

The inventory scanned document-like files with these extensions: `.md`, `.mdx`, `.txt`, `.docx`, `.pdf`, `.xlsx`, `.csv`, `.html`.

| Area | Count | Cleanup stance |
| --- | ---: | --- |
| All scanned document-like files | 532 | Full inventory captured in CSV |
| `docs/**` document-like files | 264 | Primary cleanup surface |
| `docs/package/**` | 45 | Protected read-only normative package |
| `docs/**` outside `docs/package/**` | 219 | Reviewable cleanup surface |
| `docs/ledger/**` | 19 | Protected append-only/evidence-bearing |
| `docs/adr/**` | 22 | Decision-record review only |
| Evidence-like refs detected by path/name | 58 | Protected review only |

Largest reviewable clusters:

| Cluster | Count | Size signal | Note |
| --- | ---: | --- | --- |
| `docs/execution/` | 16 | 4.2M | Includes large DMS uplift plan and generated 110-row ledgers |
| `docs/release/` | 87 | 1.0M | Many closeouts/runbooks/plans; status chain needs indexing, not blind deletion |
| `docs/handoff/` | 10 | 888K | July DMS uplift handoff package; keep package shape stable |
| `docs/lazycodex/` | 6 | 680K | Large traceability plans; current 2026-07-05 candidate is active evidence-planning surface |
| `docs/desktop-next/` | 14 | 192K | Several files already marked historical after Tauri landed |
| `docs/ui/` | 10 | 224K | Enterprise DMS UX history and current route inventory |

## Cleanup Classes

Use these dispositions in review, then execute only after owner approval.

| Disposition | Meaning | Allowed action |
| --- | --- | --- |
| `KEEP_CANONICAL` | Current source of truth or live index | Leave in place |
| `KEEP_EVIDENCE` | Gate, closeout, receipt, audit, or release proof | Leave in place; optionally add index |
| `KEEP_HISTORICAL` | Older but useful traceability or decision context | Leave in place; optionally add historical note |
| `REPLACE_WITH_POINTER` | Duplicate or near-duplicate where path shape is useful | Replace body with a short pointer after approval |
| `ARCHIVE_SUPERSEDED` | Superseded by later approved closeout or current plan | Move under an archive folder after approval |
| `DELETE_AFTER_REVIEW` | Exact duplicate or generated disposable file with no refs | Delete only after explicit approval and ref check |

## Candidate Queue

| Candidate | Proposed disposition | Reason | Pre-execution check |
| --- | --- | --- | --- |
| `docs/handoff/dms-uplift-2026-07/03_workplan-TUW-snapshot.md` | `REPLACE_WITH_POINTER` | Exact SHA duplicate of `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md`; handoff package still expects section 03 | Keep handoff `00_README.md` navigation working; pointer to execution canonical |
| `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md` | `KEEP_CANONICAL` | Referenced by `tools/execution/build-tuw-status-ledger.mjs`, 110-status ledgers, and LazyCodex traceability | None; do not archive |
| `docs/current-code-state.md` | `KEEP_HISTORICAL` or refresh separately | Dated 2026-06-22 and tied to old checkout, but referenced by desktop/handoff/traceability docs | Create a new current-state refresh instead of deleting this file |
| `docs/release/production-source-cutover-next-gate-plan.md` | `KEEP_EVIDENCE` with predecessor label | Later preflight/execute/post-cutover docs exist, but the preflight closeout explicitly references this plan | Add index metadata before archive; do not delete |
| `docs/release/production-source-cutover-preflight-closeout.md` | `KEEP_EVIDENCE` | Contains approval refs and scope actually evaluated | Do not edit except typo/index metadata |
| `docs/release/production-source-cutover-execute-closeout.md` | `KEEP_EVIDENCE` | Contains execute approval ref and unclaimed-lane boundary | Do not archive while post-cutover gates reference it |
| `docs/release/production-post-cutover-next-gates.md` | `KEEP_CANONICAL` for current post-cutover gate package | Latest gate package in source-cutover chain | Update only when next gate is actually executed |
| `docs/desktop-next/*` historical plan files | `KEEP_HISTORICAL` then index | Many already include current-state notes saying Tauri landed; useful as implementation traceability | Build section index before moving anything |
| `docs/lazycodex/lcx-tuw80-complete-candidate-traceability-2026-07-05.md` | `KEEP_CANONICAL` for 80-row local evidence plan | Large but active row-level traceability; not a cleanup target | Keep paired with execution plan |
| `docs/handoff/dms-uplift-2026-07/reference/*.txt` | `KEEP_HISTORICAL` with source label | Reference materials for gap analysis; may be large but explain handoff derivation | Confirm they contain no raw confidential customer data before commit |

## Proposed Execution Order

1. Review this plan and the CSV inventory.
2. Add a small `docs/maintenance/README.md` index if this lane will continue.
3. Add a document index for `docs/release/`, `docs/execution/`, `docs/handoff/`, and `docs/lazycodex/` before moving anything.
4. Execute only the exact duplicate cleanup first: convert the handoff copy of `03_workplan-TUW-snapshot.md` to a pointer, leaving `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md` canonical.
5. Re-run reference checks with `rg` for every changed path.
6. Move superseded documents only after the replacement/canonical target is recorded.
7. Reserve physical deletion for a second approval pass.

## Verification Commands

Run these before any cleanup PR or commit:

```bash
git diff -- docs/package
git diff --check -- docs
rg -n "docs/handoff/dms-uplift-2026-07/03_workplan-TUW-snapshot|docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3|production-source-cutover-next-gate-plan|current-code-state" docs apps packages tools workers tests
```

Expected result:

- `git diff -- docs/package` is empty.
- No canonical reference points at a deleted or moved document.
- Cleanup diff contains only index/pointer/archive changes approved for this lane.

## Not Done In This Pass

- No files were deleted.
- No files were moved.
- No release, ledger, ADR, or package document was rewritten.
- No claim was made that stale evidence is current.
