# Launch Readiness Pack

Date: 2026-06-14
Status: PRODUCTION DEPLOYED - MONITORING ACTIVE

Current-state note, 2026-06-22: this pack records the launch package and older
production/staging evidence. It is not a latest-main production approval for
`origin/main@a2d3bb9`. Use
`docs/release/launch-closeout-execution-a2d3bb9.md` for the latest repo-local
closeout boundary, which is `TECHNICAL-READY /
EXTERNAL-EVIDENCE-REQUIRED-BEFORE-PROMOTION`.

## Scope

This pack converts the post-R14 technical completion state into a launch-ready
operations package and records the later AWS staging, UAT, production bootstrap,
post-deploy smoke, customer-data approval, strengthened production alarm, and
final customer-launch smoke evidence. Repository-tracked files do not include
secrets, private endpoints, provider-console metadata, account IDs, ARNs, real
customer data, raw document bodies, or raw smoke artifacts.

## Baseline

- Application RC candidate baseline under consideration:
  `9e346d9e48c962448bcccbbef9e30d9c3e468e4f`.
- Frozen release SHA is approved for staging image build, smoke, and UAT
  preparation via `CHAT-2026-06-14-RC-FREEZE`.
- Launch package baseline: `main` includes PR #68 release-completion prep and
  PR #69 pre-launch quality hardening.
- Technical gate baseline: R14 Scale & Learning technical pass with remaining
  blockers 0.
- Release-candidate PR baseline: PR #66, PR #67, PR #68, and PR #69 merged.
- Latest verified candidate CI baseline: PR #69 checks green before merge.
- Deployment baseline: AWS staging technical deployment, smoke, UAT technical
  evidence, approval refs, production bootstrap refs, production smoke refs,
  customer-document launch approval, strengthened production alarms, and final
  customer-launch smoke are recorded. Post-launch monitoring is active.

## Deliverables

| Deliverable                            | Path                                              | Status                                                                 |
| -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Staging deployment contract            | `infra/ci/staging-deploy.yml`                     | Prepared; staging technical evidence recorded separately               |
| Staging deployment plan                | `docs/release/staging-deployment-plan.md`         | AWS staging technical pass recorded                                    |
| Production gate contract               | `infra/ci/prod-gate.yml`                          | Prepared; approvals recorded, deploy disabled until explicit execution |
| Production gate policy                 | `infra/ci/PROD_GATE.md`                           | Updated                                                                |
| Production release runbook             | `docs/release/production-release-runbook.md`      | Deployed; post-launch monitoring active                                |
| Production execution preflight         | `docs/release/production-execution-preflight.md`  | Passed; customer-launch smoke recorded                                 |
| Rollback runbook                       | `docs/release/rollback-runbook.md`                | Prepared                                                               |
| UAT checklist                          | `docs/release/uat-checklist.md`                   | Accepted                                                               |
| Synthetic UAT technical evidence       | `docs/release/synthetic-uat-evidence.md`          | Accepted under LRB-011                                                 |
| Launch execution plan                  | `docs/release/launch-execution-plan.md`           | Prepared                                                               |
| Operator decision sheet                | `docs/release/operator-decision-sheet.md`         | Pilot/prod approvals recorded                                          |
| UAT evidence template                  | `docs/release/uat-evidence-template.md`           | Accepted                                                               |
| Staging smoke plan                     | `docs/release/staging-smoke-plan.md`              | Staging smoke evidence recorded                                        |
| Security evidence index                | `docs/release/security-evidence-index.md`         | Prepared                                                               |
| Launch blocker ledger                  | `docs/release/launch-blocker-ledger.md`           | Approvals recorded                                                     |
| RC freeze decision pack                | `docs/release/rc-freeze-decision-pack.md`         | Approved                                                               |
| RC release notes                       | `docs/release/release-notes-rc-9e346d9.md`        | Draft                                                                  |
| Evidence register                      | `docs/release/evidence-register.md`               | Prepared                                                               |
| Remaining launch TUW backlog           | `docs/release/remaining-launch-tuw.md`            | Prepared                                                               |
| Local synthetic UAT walkthrough        | `docs/release/local-synthetic-uat-walkthrough.md` | Prepared                                                               |
| Local staging preflight                | `docs/release/local-staging-preflight.md`         | Passed locally                                                         |
| Actual launch runbook                  | `docs/release/actual-launch-runbook.md`           | Production execution recorded                                          |
| Staging smoke env template             | `docs/release/env.staging-smoke.example`          | Prepared, placeholders only                                            |
| Staging input checklist                | `docs/release/staging-input-checklist.md`         | AWS staging decisions approved                                         |
| Synthetic UAT scenarios                | `docs/release/synthetic-uat-scenarios.md`         | Prepared, local/staging execution paths                                |
| Launch control sheet                   | `docs/release/launch-control-sheet.md`            | Production deployed; monitoring active                                 |
| Desktop app plan                       | `docs/desktop/desktop-app-plan.md`                | Phase 2 release evidence connected                                     |
| Desktop threat model                   | `docs/security/desktop-threat-model.md`           | Prepared                                                               |
| Desktop cache policy                   | `docs/security/desktop-cache-policy.md`           | Enforced by PWA smoke and integration tests                            |
| Desktop origin policy                  | `docs/release/desktop-origin-policy.md`           | Prepared; no private endpoint values                                   |
| Staging smoke automation               | `tools/release/staging-smoke.mjs`                 | Prepared                                                               |
| Synthetic UAT validator                | `tools/release/synthetic-uat-evidence.mjs`        | CI wired                                                               |
| Local staging preflight automation     | `tools/release/local-staging-preflight.mjs`       | Prepared and executed locally                                          |
| Production release preflight validator | `tools/release/production-release-preflight.mjs`  | CI wired                                                               |
| Readiness validator                    | `tools/release/check-launch-readiness.mjs`        | CI wired                                                               |
| Execution validator                    | `tools/release/check-launch-execution.mjs`        | CI wired                                                               |

## Launch Modes

| Mode             | Purpose                                                             | Required before entry                                                                  |
| ---------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Internal staging | Exercise deployment, smoke tests, and UAT with synthetic data only. | AWS resources provisioned, runtime secrets placed outside repo, image digests recorded |
| Controlled pilot | Limited operator-approved users and approved customer/test data.    | Staging green, security review, legal/customer data approval and governed upload path   |
| GA               | Production availability for the approved market scope.              | All launch blockers resolved and production gate signed                                |

## Invariants

- Permission-before-search and permission-before-AI remain non-negotiable.
- Audit-by-default remains part of the action, not a trailing best-effort log.
- Fail-closed behavior remains the default for unavailable permissions, policy,
  deployment values, secrets, and approvals.
- Original document immutability, records disposal controls, tenant RLS, and
  reference-only audit metadata remain unchanged.
- External model routes remain closed unless a future explicit gate changes the
  schema, service contract, and evidence set.
- Launch readiness artifacts must not modify `docs/package/`.

## Completion Criteria For This Pack

- `pnpm launch:readiness` passes.
- `pnpm launch:execution` passes.
- `pnpm release:uat` passes.
- `pnpm release:prod-preflight` passes and reports
  `customer-launch-smoke-passed` with
  `PROD-CUSTOMER-LAUNCH-FINAL-SMOKE-2026-06-15`.
- CI `verify` runs both `pnpm launch:readiness` and `pnpm launch:execution`.
- `pnpm release:smoke -- --dry-run` passes.
- `pnpm release:smoke -- --dry-run` includes SMOKE-012 through SMOKE-015
  desktop PWA checks.
- `pnpm release:smoke -- --local` passes when local Web/API/dev infra are
  running with seeded development data, including desktop manifest, service
  worker, offline shell, and installability checks.
- `pnpm release:local-preflight` passes before approved staging credentials are
  requested.
- `pnpm docs:frozen` passes.
- `git diff --check` passes.
- No launch artifact contains real secrets, raw customer documents, document
  bodies, external endpoint credentials, account identifiers, ARNs, cookies, or
  tokens.
- Every launch decision is recorded with a non-secret evidence ref.
- Automatic deployment skeletons remain disabled unless a future approved
  release path intentionally opens them.

## Current Launch Status

Machine-actionable launch preparation is complete for this pack. AWS staging
decisions, pilot decisions, UAT acceptance, restore acceptance, security review,
Risk=C disposition, production release approval, production bootstrap, smoke,
customer-document launch approval, strengthened production alarms, final
customer-launch smoke, and support ownership are recorded in
`docs/release/launch-blocker-ledger.md`. Production release evidence is governed
by `docs/release/production-execution-preflight.md` and
`docs/release/production-release-runbook.md`; post-launch monitoring remains
active under `PROD-MONITOR-AWS-001` and
`PROD-MONITOR-ALARMS-AWS-2026-06-15`. Desktop/PWA release evidence is tracked
in `EV-DESKTOP-001` through `EV-DESKTOP-004`; installed app behavior remains a
server-authoritative access layer, not a local vault runtime.
