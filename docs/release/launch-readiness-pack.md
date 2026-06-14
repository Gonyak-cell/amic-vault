# Launch Readiness Pack

Date: 2026-06-13
Status: PREPARED - NOT LAUNCHED

## Scope

This pack converts the post-R14 technical completion state into a launch-ready
operations package. It does not deploy AMIC Vault, connect to a cloud provider,
create secrets, use real customer data, call external services, or change the
product release boundary.

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
- Deployment baseline: AWS staging-opening decisions are approved, but staging
  and production deployments remain disabled until resource provisioning,
  runtime secret placement, image push, smoke, UAT, and later gates complete.

## Deliverables

| Deliverable | Path | Status |
|---|---|---|
| Staging deployment contract | `infra/ci/staging-deploy.yml` | Prepared, disabled pending AWS provisioning |
| Staging deployment plan | `docs/release/staging-deployment-plan.md` | AWS staging decisions approved, deploy not executed |
| Production gate contract | `infra/ci/prod-gate.yml` | Prepared, disabled pending approvals |
| Production gate policy | `infra/ci/PROD_GATE.md` | Updated |
| Production release runbook | `docs/release/production-release-runbook.md` | Prepared |
| Rollback runbook | `docs/release/rollback-runbook.md` | Prepared |
| UAT checklist | `docs/release/uat-checklist.md` | Prepared |
| Launch execution plan | `docs/release/launch-execution-plan.md` | Prepared |
| Operator decision sheet | `docs/release/operator-decision-sheet.md` | AWS staging decisions approved; pilot/prod unresolved |
| UAT evidence template | `docs/release/uat-evidence-template.md` | Prepared, not executed |
| Staging smoke plan | `docs/release/staging-smoke-plan.md` | Prepared, awaits staging target |
| Security evidence index | `docs/release/security-evidence-index.md` | Prepared |
| Launch blocker ledger | `docs/release/launch-blocker-ledger.md` | AWS staging decisions approved; pilot/prod unresolved |
| RC freeze decision pack | `docs/release/rc-freeze-decision-pack.md` | Prepared, awaits operator decision |
| RC release notes | `docs/release/release-notes-rc-9e346d9.md` | Draft |
| Evidence register | `docs/release/evidence-register.md` | Prepared |
| Remaining launch TUW backlog | `docs/release/remaining-launch-tuw.md` | Prepared |
| Local synthetic UAT walkthrough | `docs/release/local-synthetic-uat-walkthrough.md` | Prepared |
| Local staging preflight | `docs/release/local-staging-preflight.md` | Passed locally |
| Actual launch runbook | `docs/release/actual-launch-runbook.md` | Prepared, awaits operator inputs |
| Staging smoke env template | `docs/release/env.staging-smoke.example` | Prepared, placeholders only |
| Staging input checklist | `docs/release/staging-input-checklist.md` | AWS staging decisions approved, provisioning pending |
| Synthetic UAT scenarios | `docs/release/synthetic-uat-scenarios.md` | Prepared, local/staging execution paths |
| Launch control sheet | `docs/release/launch-control-sheet.md` | Prepared |
| Staging smoke automation | `tools/release/staging-smoke.mjs` | Prepared |
| Local staging preflight automation | `tools/release/local-staging-preflight.mjs` | Prepared and executed locally |
| Readiness validator | `tools/release/check-launch-readiness.mjs` | CI wired |
| Execution validator | `tools/release/check-launch-execution.mjs` | CI wired |

## Launch Modes

| Mode | Purpose | Required before entry |
|---|---|---|
| Internal staging | Exercise deployment, smoke tests, and UAT with synthetic data only. | AWS resources provisioned, runtime secrets placed outside repo, image digests recorded |
| Controlled pilot | Limited operator-approved users and approved customer/test data. | Staging green, security review, legal/customer data approval |
| GA | Production availability for the approved market scope. | All launch blockers resolved and production gate signed |

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
- CI `verify` runs both `pnpm launch:readiness` and `pnpm launch:execution`.
- `pnpm release:smoke -- --dry-run` passes.
- `pnpm release:smoke -- --local` passes when local Web/API/dev infra are
  running with seeded development data.
- `pnpm release:local-preflight` passes before approved staging credentials are
  requested.
- `pnpm docs:frozen` passes.
- `git diff --check` passes.
- No launch artifact contains real secrets, real customer data, or external
  endpoint credentials.
- Every remaining human/company decision is listed as an `approval-required`
  blocker, while approved AWS staging decisions retain non-secret evidence refs.
- Deployment skeletons remain disabled until those blockers are resolved.

## Current Launch Status

Machine-actionable launch preparation is complete for this pack. AWS staging
decisions are approved, but product launch itself is blocked by AWS resource
provisioning, staging smoke/UAT execution, and the remaining approval-required
items in `docs/release/launch-blocker-ledger.md`.
