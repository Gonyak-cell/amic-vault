# AMIC Vault Outdated Document Update Plan

Date: 2026-07-06
Status: update plan only; no existing document body updated in this pass
Scope: all repo documentation outside the frozen `docs/package/**` tree
Related inventory: `docs/maintenance/document-inventory-2026-07-06.csv`
Related cleanup plan: `docs/maintenance/document-cleanup-plan-2026-07-06.md`

## Purpose

Bring outdated or misleading repository documents into alignment with the latest known progress without overstating production authority, go-live status, or evidence completion.

This plan is separate from deletion/archive cleanup. A document can be old and still valuable evidence. The update task is to make each document's status, replacement source, and evidence boundary obvious to a future operator or developer.

## Non-Negotiable Boundaries

- Do not edit `docs/package/**`; keep it as the normative frozen package.
- Do not rewrite `docs/ledger/**`; append only when a real decision/execution event occurs.
- Do not change ADR status from `Proposed` to `Accepted` unless operator/human approval and Decision Ledger evidence exist.
- Do not mark a TUW, launch lane, or release lane as complete from code presence alone.
- Do not claim OneDrive connected-state, Office open/save/sync, Gemma indexing execution, or customer-wide go-live unless the matching approval and receipt exist.
- Do not inline private receipts, raw customer data, tenant/user IDs, object keys, tokens, production URLs, screenshots with matter data, raw prompt/source/model output, or provider account identifiers.

## Current Progress Anchors

Use these as the update source of truth before editing any outdated document.

| Anchor | Current fact to preserve |
| --- | --- |
| Branch / HEAD | `codex/release-freeze-20260705-current` at `0b39414` |
| Production customer document import | `docs/release/production-customer-document-import-execute-closeout.md` records PASS through final wave-225 |
| Source-of-truth cutover | `docs/release/production-source-cutover-execute-closeout.md` records execute PASS |
| Post-cutover truth | `docs/release/production-post-cutover-next-gates.md` is the current next-gate package |
| Remaining production non-claims | OneDrive connected-state, Office open/save/sync, Gemma indexing execution, and customer-wide go-live remain unclaimed |
| 110-row DMS uplift ledger | `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.{json,md}` generated 2026-07-05: 19 `COMPLETE_CANDIDATE`, 80 `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`, 11 `EXTERNAL_BLOCKED` |
| DMS uplift canonical source plan | `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md` is canonical; handoff section `03_workplan-TUW-snapshot.md` is an exact duplicate and should become a pointer after approval |
| LCX evidence planning | `docs/lazycodex/lcx-tuw80-complete-candidate-*.md` are current for the 80 local-evidence rows |
| Current-code overlay | `docs/current-code-state.md` needs a 2026-07-06 refresh; its header still names the older `codex/dms-editing-lifecycle-candidate` checkout |

## Update Classes

| Class | Meaning | Action pattern |
| --- | --- | --- |
| `REFRESH_CURRENT` | Intended to describe current repo state, but stale | Update header/date/branch and body facts from current anchors |
| `ADD_HISTORICAL_NOTE` | Valid historical evidence but could be mistaken for current truth | Add a short current-state note near the top |
| `MARK_SUPERSEDED_BY` | Later approved closeout or gate package exists | Add explicit superseded/replaced-by pointer, leave evidence intact |
| `INDEX_ONLY` | Document is valid but hard to navigate | Add or update section index, no body rewrite |
| `DECISION_STATUS_REVIEW` | ADR or policy doc may be stale, but status is authority-bound | Do not flip status; add review-needed note if allowed |
| `NO_UPDATE_PROTECTED` | Normative/ledger/evidence path | Do not edit unless a separate approved process applies |

## Priority Update Queue

### P0 - Prevent Misleading Current-State Or Production Claims

| Document | Class | Outdated signal | New anchor | Planned update |
| --- | --- | --- | --- | --- |
| `docs/current-code-state.md` | `REFRESH_CURRENT` | Header says 2026-06-22 and old checkout; body only partially reflects July work | Branch `codex/release-freeze-20260705-current`, HEAD `0b39414`, production/post-cutover docs, 110-row ledger | Refresh header and add a compact `Current Truth As Of 2026-07-06` section |
| `docs/release/production-source-cutover-next-gate-plan.md` | `MARK_SUPERSEDED_BY` | Says preflight is ready for approval, but later preflight and execute closeouts exist | `production-source-cutover-preflight-closeout.md`, `production-source-cutover-execute-closeout.md`, `production-post-cutover-next-gates.md` | Add top note: historical approval packet, superseded by execute closeout; do not delete |
| `docs/release/production-source-cutover-preflight-closeout.md` | `REFRESH_CURRENT` | It is modified toward after-import PASS; must ensure internal sections do not still imply the old blocker is current | Execute closeout and post-cutover next gates | Normalize headings: historical blocker vs after-import PASS vs follow-on execute |
| `docs/release/production-customer-document-import-execute-closeout.md` | `REFRESH_CURRENT` / `INDEX_ONLY` | Top status now says final wave-225 PASS, but long per-wave body can bury the final truth | Final closeout receipts listed in file and post-cutover package | Add concise top summary and table of non-claims; preserve per-wave evidence below |
| `docs/release/production-post-cutover-next-gates.md` | `REFRESH_CURRENT` | Current canonical next-gate doc; must remain the place that prevents overclaiming | Same file plus execute closeout | Keep as current; add pointer from stale production docs to this file rather than duplicating |
| `docs/release/launch-readiness-pack.md`, `docs/release/launch-execution-plan.md`, `docs/release/actual-launch-runbook.md`, `docs/release/launch-control-sheet.md`, `docs/release/production-release-runbook.md` | `ADD_HISTORICAL_NOTE` | Headers say deployed/monitoring from older launch lane and can be confused with current customer-wide go-live | Post-cutover next gates and current non-claims | Add current-state note: historical launch evidence, not latest customer-wide go-live approval |

### P1 - Align DMS Uplift And Evidence-Gate Documents

| Document | Class | Outdated signal | New anchor | Planned update |
| --- | --- | --- | --- | --- |
| `docs/handoff/dms-uplift-2026-07/00_README.md` | `REFRESH_CURRENT` | Handoff package predates July 5 110-row strict ledger | 110-row status ledger and LCX-TUW80 plan | Add `Current execution ledger` section with counts and link to latest ledger |
| `docs/handoff/dms-uplift-2026-07/03_workplan-TUW-snapshot.md` | `MARK_SUPERSEDED_BY` / `REPLACE_WITH_POINTER` | Exact duplicate of canonical execution plan | `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md` | After approval, replace body with pointer while preserving handoff section shape |
| `docs/handoff/dms-uplift-2026-07/06_execution-guide.md` | `REFRESH_CURRENT` | Says workplan has 117 units while strict ledger operates on 110 | 110-row status ledger | Clarify original handoff vs strict-completion operating ledger |
| `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md` | `KEEP_CURRENT_WITH_NOTE` | Canonical plan, but execution status lives elsewhere | 110-row status ledger | Add short note pointing to latest generated status ledger, not row-by-row body edits |
| `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_EXECUTION_POLICY.md` | `REFRESH_CURRENT` | New durable policy; should point to latest generated ledger | 2026-07-05 ledger files | Confirm it names the right status promotion rules and evidence requirements |
| `docs/lazycodex/lcx-tuw80-complete-candidate-execution-plan-2026-07-05.md` | `KEEP_CURRENT` | Current evidence plan | 110-row ledger counts | No body update unless ledger is regenerated |
| `docs/lazycodex/lcx-tuw80-complete-candidate-traceability-2026-07-05.md` | `KEEP_CURRENT` | Current row-level traceability | 110-row ledger counts | No body update unless ledger is regenerated |

### P2 - Desktop, Office, ADR, And Integration Boundaries

| Document | Class | Outdated signal | New anchor | Planned update |
| --- | --- | --- | --- | --- |
| `docs/security/desktop-threat-model.md` | `REFRESH_CURRENT` | Still frames Tauri as future/blocked in places | `apps/desktop` exists; desktop closeout docs; `docs/current-code-state.md` refresh | Update threat wording to current Tauri thin-shell reality while preserving fail-closed rules |
| `docs/release/desktop-origin-policy.md` | `REFRESH_CURRENT` | Mentions future Tauri phase despite Tauri existing | Desktop release docs and `apps/desktop` | Distinguish current Tauri shell from production distribution authority |
| `docs/desktop-next/*` | `INDEX_ONLY` / `ADD_HISTORICAL_NOTE` | Many files are now historical, but not all are equally marked | Current desktop implementation and closeout docs | Add or update a `docs/desktop-next/README.md` index rather than editing every file first |
| `docs/desktop/desktop-app-plan.md` | `REFRESH_CURRENT` | Started as PWA-first and Tauri partial plan | Current desktop shell and release hold docs | Add current-state summary and link to desktop evidence worksheets |
| `docs/adr/ADR-014-desktop-client-strategy.md` | `DECISION_STATUS_REVIEW` | Still Proposed while implementation progressed | Decision ledger / operator approval required | Do not mark Accepted without approval; add review-needed note if appropriate |
| `docs/adr/ADR-015-outlook-addin-strategy.md` | `DECISION_STATUS_REVIEW` | Proposed; Outlook implementation/proof lanes have moved | Outlook operational gates and proof docs | Keep Proposed unless accepted; add current evidence pointers |
| `docs/adr/ADR-016-document-editing-and-office-flow.md` | `DECISION_STATUS_REVIEW` | Already being updated for B12/WOPI boundary | ADR-018 and 110-row B12 status | Verify it does not imply approved WOPI or production editing |
| `docs/adr/ADR-018-wopi-evaluation.md` | `DECISION_STATUS_REVIEW` | New proposed ADR | ADR-016, B12 external-blocked status | Keep Proposed until approval; add ledger link only after approval |

### P3 - Older Migration, UI, Evalset, And Runbook Docs

| Document family | Class | Outdated signal | New anchor | Planned update |
| --- | --- | --- | --- | --- |
| `docs/release/onedrive-*` older planning docs | `ADD_HISTORICAL_NOTE` / `MARK_SUPERSEDED_BY` | Many local/pilot/next-wave docs predate production final wave-225 and cutover execute | Final production import closeout, source cutover execute, post-cutover next gates | Add status line to distinguish local/pilot planning from production-final truth |
| `docs/release/gemma-*` | `REFRESH_CURRENT` | Some docs discuss post-import local Gemma or pre-execute options | Post-cutover next gates: Gemma outputs complete, indexing execution unclaimed | Align wording to separate generated Gemma outputs from indexing claim |
| `docs/ui/enterprise-dms-*` | `INDEX_ONLY` / `ADD_HISTORICAL_NOTE` | Some are baseline snapshots, some evidence, some current inventory | LCX evidence docs and production UI inventory | Add a route/status index before body updates |
| `docs/lazycodex/lcx-kr-saas-ui-*.md` and `lcx-knowledge-vault-ui-*.md` | `ADD_HISTORICAL_NOTE` | July 2 UI implementation planning predates July 5 strict-completion evidence plan | LCX-TUW80 files and current UI route state | Mark as UI baseline, not latest evidence-completion ledger |
| `docs/evalset/Evaluation_Set_v0_Collection_Procedure.md` | `REFRESH_CURRENT` | Scope expanded from search-only to local AI golden labels | Current local AI eval and golden-label fields | Keep raw-data exclusions; document 30-case manual gate and 100-case target |
| `docs/release/enterprise-dms-monitor-map.md` | `REFRESH_CURRENT` | Current edits add H5/H6 monitor/worker binding | H5/H6 TUW evidence requirements | Confirm safe aggregate-only metrics wording and external-ref boundary |

## Execution Plan

1. Create a small document truth map.
   - Suggested path: `docs/maintenance/current-document-truth-map-2026-07-06.md`.
   - Include only current anchors, replacement targets, and non-claim boundaries.

2. Patch P0 documents first.
   - Update only headers/current-state notes and top summaries.
   - Preserve all evidence and historical body sections.
   - Do not move files in this phase.

3. Patch P1 DMS uplift docs.
   - Point the handoff package at the 110-row strict ledger.
   - Convert only the exact duplicate handoff snapshot to a pointer after approval.
   - Keep `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md` canonical.

4. Patch P2 desktop/Office/ADR boundaries.
   - Prefer indexes and current-state notes.
   - Do not accept ADRs or imply WOPI/browser coauthoring without approval.

5. Patch P3 historical planning families.
   - Add `Historical note` or `Superseded by` lines to old migration/UI/runbook docs.
   - Avoid large body rewrites unless a specific contradiction remains.

6. Run reference checks after each phase.
   - Check for stale phrases that imply current authority.
   - Check for broken links or moved references.

## Suggested Verification

Run these after each phase:

```bash
git diff -- docs/package
git diff --check -- docs
rg -n "customer-wide go-live|Gemma indexing executed|OneDrive connected-state claim|Office open/save/sync claim|ready for separate approval|Tauri is blocked|current checkout|TECHNICAL-READY|EXTERNAL-EVIDENCE" docs --glob '!package/**'
rg -n "docs/release/production-source-cutover-next-gate-plan|docs/current-code-state|docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3|docs/handoff/dms-uplift-2026-07/03_workplan-TUW-snapshot" docs apps packages tools workers tests
```

Expected result:

- `git diff -- docs/package` remains empty.
- Older documents either clearly say `historical`, `superseded by`, or `not current approval`.
- Current documents preserve the four non-claims: OneDrive connected-state, Office open/save/sync, Gemma indexing execution, customer-wide go-live.
- The 110-row DMS uplift state remains 19 `COMPLETE_CANDIDATE`, 80 `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`, 11 `EXTERNAL_BLOCKED` unless the ledger is regenerated from fresh evidence.

## Stop Conditions

Stop and request operator/owner decision if:

- A doc update would require changing `docs/package/**`.
- A proposed update would flip an ADR status to accepted.
- A document claims external provider, Office, OneDrive, Gemma indexing, production go-live, or customer-wide readiness without matching approval and receipt.
- A release closeout and ledger disagree on whether a lane is executed.
- A doc contains suspected private evidence or raw customer data that should not be committed.

## Not Done In This Pass

- No existing outdated document was updated.
- No status was promoted.
- No ADR was accepted.
- No release, go-live, Office, OneDrive, or Gemma indexing claim was made.
