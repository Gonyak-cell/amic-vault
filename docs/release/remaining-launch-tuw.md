# Remaining Launch TUW Backlog

Status: ACTIVE - APPROVAL DEPENDENT

This backlog decomposes the release-completion lane after R14 technical pass.
It does not replace the R0-R14 implementation ledger.

| TUW ID | Title | Owner | Depends On | Exit Evidence | Status |
|---|---|---|---|---|---|
| REL-RC-FREEZE-TUW-001 | Confirm RC SHA `a0c1e60`. | Operator | PR #66, PR #67 merged | EV-RC-001 | blocked |
| REL-RC-NOTES-TUW-002 | Fill RC release notes with PR scope, migration, and security notes. | Codex | REL-RC-FREEZE-TUW-001 | `docs/release/release-notes-rc-a0c1e60.md` | prepared |
| REL-LRB-STAGE-TUW-003 | Resolve staging-opening LRB-001/002/003/004/008. | Operator/Security/Ops | REL-RC-FREEZE-TUW-001 | LRB evidence refs | blocked |
| REL-SMOKE-AUTO-TUW-004 | Provide endpoint-configurable staging smoke automation. | Codex | none | `pnpm release:smoke -- --dry-run` and local smoke | prepared |
| REL-STAGE-INPUT-TUW-004A | Provide staging input checklist with safe evidence-ref recording rules. | Codex | none | `docs/release/staging-input-checklist.md` | prepared |
| REL-SMOKE-EXEC-TUW-005 | Execute staging smoke against approved staging target. | Ops/Codex | REL-LRB-STAGE-TUW-003 | EV-SMOKE evidence ref | blocked |
| REL-UAT-SYNTH-TUW-006 | Prepare local synthetic UAT walkthrough. | Codex | none | `docs/release/local-synthetic-uat-walkthrough.md` | prepared |
| REL-UAT-SCENARIOS-TUW-006A | Expand UAT-001 through UAT-020 into step and negative-check matrix. | Codex | none | `docs/release/synthetic-uat-scenarios.md` | prepared |
| REL-UAT-EXEC-TUW-007 | Execute UAT-001 through UAT-020. | Product/QA/Codex | staging smoke pass | UAT evidence refs | blocked |
| REL-LAUNCH-CONTROL-TUW-007A | Provide one-page launch control sheet. | Codex | REL-SMOKE-AUTO-TUW-004 | `docs/release/launch-control-sheet.md` | prepared |
| REL-PILOT-GATE-TUW-008 | Resolve pilot LRB-005/006/007/014. | Legal/Product/Ops | UAT pass | pilot evidence refs | blocked |
| REL-PROD-GATE-TUW-009 | Resolve production LRB-009/010/011/012/013. | Security/Ops/Operator | pilot gate | production gate evidence refs | blocked |
| REL-PROD-REL-TUW-010 | Execute production release runbook. | Ops/Codex | production gate approved | production release evidence ref | blocked |
| REL-MONITOR-TUW-011 | Start post-launch monitoring window. | Ops/Security | production release | monitoring window evidence ref | blocked |

## Stop Conditions

- Any approval-required LRB lacks an evidence ref at its gate.
- Any secret, private endpoint, token, cookie, or real customer document would
  need to be committed to the repository.
- Any permission, tenant isolation, audit, DLP, records, external portal, or AI
  smoke check fails.
- Any external model route opens without a future explicit gate.
