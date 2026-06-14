# Remaining Launch TUW Backlog

Status: ACTIVE - APPROVAL DEPENDENT

This backlog decomposes the release-completion lane after R14 technical pass.
It does not replace the R0-R14 implementation ledger.

| TUW ID | Title | Owner | Depends On | Exit Evidence | Status |
|---|---|---|---|---|---|
| REL-RC-FREEZE-TUW-001 | Confirm RC SHA `9e346d9e48c962448bcccbbef9e30d9c3e468e4f`. | Operator | PR #66, PR #67, PR #68, PR #69 merged | EV-RC-001 / CHAT-2026-06-14-RC-FREEZE | done |
| REL-RC-NOTES-TUW-002 | Fill RC release notes with PR scope, migration, and security notes. | Codex | REL-RC-FREEZE-TUW-001 | `docs/release/release-notes-rc-9e346d9.md` | prepared |
| REL-LRB-STAGE-TUW-003 | Resolve staging-opening LRB-001/002/003/004/008. | Operator/Security/Ops | REL-RC-FREEZE-TUW-001 | STAGE-CLOUD-AWS-001, STAGE-DNS-AWS-001, STAGE-REGISTRY-ECR-001, STAGE-SECRETS-AWS-001, STAGE-MONITOR-AWS-001 | done |
| REL-AWS-STAGE-PROVISION-TUW-004C | Provision AWS staging resources and runtime refs without committing secrets or private endpoints. | Ops/Codex | REL-LRB-STAGE-TUW-003 | AWS resource refs, image digest refs, runtime secret value placement evidence | blocked |
| REL-SMOKE-AUTO-TUW-004 | Provide endpoint-configurable staging smoke automation. | Codex | none | `pnpm release:smoke -- --dry-run` and local smoke | prepared |
| REL-STAGE-INPUT-TUW-004A | Provide staging input checklist with safe evidence-ref recording rules. | Codex | none | `docs/release/staging-input-checklist.md` | prepared |
| REL-STAGE-LOCAL-PREFLIGHT-TUW-004B | Provide one-command local staging preflight before approved cloud staging exists. | Codex | REL-RC-FREEZE-TUW-001, REL-SMOKE-AUTO-TUW-004 | EV-SMOKE-002 / `pnpm release:local-preflight` | done |
| REL-SMOKE-EXEC-TUW-005 | Execute staging smoke against approved staging target. | Ops/Codex | REL-AWS-STAGE-PROVISION-TUW-004C | EV-SMOKE evidence ref | blocked |
| REL-UAT-SYNTH-TUW-006 | Prepare local synthetic UAT walkthrough. | Codex | none | `docs/release/local-synthetic-uat-walkthrough.md` | prepared |
| REL-UAT-SCENARIOS-TUW-006A | Expand UAT-001 through UAT-020 into step and negative-check matrix. | Codex | none | `docs/release/synthetic-uat-scenarios.md` | prepared |
| REL-UAT-EXEC-TUW-007 | Execute UAT-001 through UAT-020. | Product/QA/Codex | staging smoke pass | UAT evidence refs | blocked |
| REL-LAUNCH-CONTROL-TUW-007A | Provide one-page launch control sheet. | Codex | REL-SMOKE-AUTO-TUW-004 | `docs/release/launch-control-sheet.md` | prepared |
| REL-ACTUAL-RUNBOOK-TUW-007B | Provide step-by-step actual launch runbook with commands, owners, evidence, and stop conditions. | Codex | REL-LAUNCH-CONTROL-TUW-007A | `docs/release/actual-launch-runbook.md` | prepared |
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
