# Launch Control Sheet

Status: PRODUCTION DEPLOYED - MONITORING ACTIVE
Date: 2026-06-16

This is the one-page control sheet for the release-completion lane. It shows the
current technical state, the commands Codex can run, and the approval refs that
have been recorded.

Previous baseline label `PREPARED - NOT LAUNCHED` is superseded for the current
release-control SHA. AWS staging passed, approvals were recorded, production
bootstrap executed under non-secret evidence refs, operational alarms were
strengthened, final smoke passed, the latest production patch
`PROD-PATCH-46C6B14-DEPLOY-2026-06-16` passed full smoke, and actual customer
documents are approved only through the app-controlled upload/versioning path.

## Current Technical State

| Item                             | State                            | Evidence                                                                                                                                                                                                                                            |
| -------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R14 technical completion         | technical-pass                   | `docs/ledger/gates/R14_gate.md`                                                                                                                                                                                                                     |
| Launch readiness artifacts       | prepared                         | `pnpm launch:readiness`                                                                                                                                                                                                                             |
| Launch execution artifacts       | prepared                         | `pnpm launch:execution`                                                                                                                                                                                                                             |
| Staging smoke automation         | prepared                         | `pnpm release:smoke -- --dry-run` and `pnpm release:smoke -- --local`                                                                                                                                                                               |
| Local staging preflight          | passed locally                   | `pnpm release:local-preflight` / EV-SMOKE-002                                                                                                                                                                                                       |
| AWS staging main alignment       | passed                           | STAGE-MAIN-MERGE-AWS-001 / EV-STAGE-009 / EV-SMOKE-005                                                                                                                                                                                              |
| Synthetic UAT technical evidence | accepted                         | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 / `pnpm release:uat`                                                                                                                                                          |
| Pilot approvals                  | approved                         | APPROVAL-LRB-005-2026-06-14 / APPROVAL-LRB-006-2026-06-14 / APPROVAL-LRB-007-CUSTOMER-DATA-2026-06-15 / APPROVAL-LRB-014-JWS-OWNER-2026-06-15                                                                                                       |
| Production gate approvals        | approved                         | APPROVAL-LRB-009-2026-06-14 / APPROVAL-LRB-010-2026-06-14 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 / APPROVAL-LRB-012-RESTORE-2026-06-14 / APPROVAL-LRB-013-PROD-RELEASE-2026-06-14                                                                  |
| Production execution preflight   | production-smoke-passed          | PROD-REL-PREFLIGHT-AWS-2026-06-14-001 / PROD-SMOKE-AWS-001 / `pnpm release:prod-preflight`                                                                                                                                                          |
| Production patch release         | production-smoke-passed          | PROD-PATCH-D80FBB5-DEPLOY-2026-06-15 / PROD-PATCH-D80FBB5-FULL-SMOKE-2026-06-15 / PROD-PATCH-42E7B29-DEPLOY-2026-06-15 / PROD-PATCH-42E7B29-FULL-SMOKE-2026-06-15 / PROD-PATCH-46C6B14-DEPLOY-2026-06-16 / PROD-PATCH-46C6B14-FULL-SMOKE-2026-06-16 |
| Production monitoring            | active-monitoring                | PROD-MONITOR-AWS-001 / PROD-MONITOR-ALARMS-AWS-2026-06-15                                                                                                                                                                                           |
| Customer launch final smoke      | passed                           | PROD-CUSTOMER-LAUNCH-FINAL-SMOKE-2026-06-15 / EV-PROD-011                                                                                                                                                                                           |
| Local Gemma runtime canary       | active-runtime-canary            | EV-LAI-PROD-002 / EV-LAI-PROD-004 / PROD-LAI-CANARY-RUNTIME-2026-06-16                                                                                                                                                                              |
| Local AI upload-prep queue       | blocked-pending-allowlist-deploy | EV-LAI-PROD-005 / `AI_PREP_ENABLED=false` / `AI_PREP_QUEUE_WORKER_ENABLED=false`                                                                                                                                                                    |
| docs/package freeze              | enforced                         | `pnpm docs:frozen`                                                                                                                                                                                                                                  |
| Local UI routes                  | prepared                         | `/login`, `/dashboard`, `/launch`                                                                                                                                                                                                                   |

## Control Commands

```bash
pnpm launch:readiness
pnpm launch:execution
pnpm release:uat
pnpm release:prod-preflight
pnpm release:smoke -- --dry-run
pnpm release:smoke -- --local
pnpm release:local-preflight
pnpm docs:frozen
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Resolved Decisions

Resolved staging evidence: LRB-001, LRB-002, LRB-003, LRB-004, and LRB-008 are
approved for the AWS temporary-target staging path.

| Gate             | Required Evidence                                    |
| ---------------- | ---------------------------------------------------- |
| Pilot entry      | LRB-005, LRB-006, LRB-007, LRB-014 approved          |
| Production entry | LRB-009, LRB-010, LRB-011, LRB-012, LRB-013 approved |

## Operator-Provided Values

The operator must provide only evidence refs in repo-tracked files. Actual cloud
targets, private endpoints, passwords, tokens, cookies, registry credentials,
secret values, legal terms, pricing, customer approvals, and production
approvals stay outside the repository.

## Codex Can Still Do

- Keep validators and CI aligned with release artifacts.
- Run local synthetic smoke and UI QA.
- Append execution ledger entries for technical preparation work.
- Maintain production release evidence refs without recording private provider
  metadata.
- Prepare PRs for operator merge after green CI.
- Continue post-launch monitoring checks and rollback-readiness documentation.
- Keep customer-document launch evidence reference-only while users upload
  approved customer documents through the app-controlled path.

## Codex Must Stop

- Any request requires committing a secret, private endpoint, real customer data,
  or raw provider evidence.
- Any permission, tenant isolation, audit, DLP, records, external portal, or AI
  invariant fails.
- The release SHA or deployment target changes without an evidence ref.
