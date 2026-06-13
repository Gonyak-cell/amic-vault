# Launch Readiness Pack

Date: 2026-06-13
Status: PREPARED - NOT LAUNCHED

## Scope

This pack converts the post-R14 technical completion state into a launch-ready
operations package. It does not deploy AMIC Vault, connect to a cloud provider,
create secrets, use real customer data, call external services, or change the
product release boundary.

## Baseline

- Application RC candidate baseline: `a0c1e60`.
- Launch package baseline: `main` includes PR #68 release-completion prep.
- Technical gate baseline: R14 Scale & Learning technical pass with remaining
  blockers 0.
- Release-candidate PR baseline: PR #66 and PR #67 merged.
- Latest verified candidate CI baseline: PR #67 checks green before merge.
- Deployment baseline: staging and production are disabled until approval
  blockers are resolved.

## Deliverables

| Deliverable | Path | Status |
|---|---|---|
| Staging deployment contract | `infra/ci/staging-deploy.yml` | Prepared, disabled pending approvals |
| Staging deployment plan | `docs/release/staging-deployment-plan.md` | Prepared |
| Production gate contract | `infra/ci/prod-gate.yml` | Prepared, disabled pending approvals |
| Production gate policy | `infra/ci/PROD_GATE.md` | Updated |
| Production release runbook | `docs/release/production-release-runbook.md` | Prepared |
| Rollback runbook | `docs/release/rollback-runbook.md` | Prepared |
| UAT checklist | `docs/release/uat-checklist.md` | Prepared |
| Launch execution plan | `docs/release/launch-execution-plan.md` | Prepared |
| Operator decision sheet | `docs/release/operator-decision-sheet.md` | Prepared, decisions unresolved |
| UAT evidence template | `docs/release/uat-evidence-template.md` | Prepared, not executed |
| Staging smoke plan | `docs/release/staging-smoke-plan.md` | Prepared, awaits staging target |
| Security evidence index | `docs/release/security-evidence-index.md` | Prepared |
| Launch blocker ledger | `docs/release/launch-blocker-ledger.md` | Prepared |
| RC freeze decision pack | `docs/release/rc-freeze-decision-pack.md` | Prepared, awaits operator decision |
| RC release notes | `docs/release/release-notes-rc-a0c1e60.md` | Draft |
| Evidence register | `docs/release/evidence-register.md` | Prepared |
| Remaining launch TUW backlog | `docs/release/remaining-launch-tuw.md` | Prepared |
| Local synthetic UAT walkthrough | `docs/release/local-synthetic-uat-walkthrough.md` | Prepared |
| Staging smoke env template | `docs/release/env.staging-smoke.example` | Prepared, placeholders only |
| Staging input checklist | `docs/release/staging-input-checklist.md` | Prepared, awaits approved evidence refs |
| Synthetic UAT scenarios | `docs/release/synthetic-uat-scenarios.md` | Prepared, local/staging execution paths |
| Launch control sheet | `docs/release/launch-control-sheet.md` | Prepared |
| Staging smoke automation | `tools/release/staging-smoke.mjs` | Prepared |
| Readiness validator | `tools/release/check-launch-readiness.mjs` | CI wired |
| Execution validator | `tools/release/check-launch-execution.mjs` | CI wired |

## Launch Modes

| Mode | Purpose | Required before entry |
|---|---|---|
| Internal staging | Exercise deployment, smoke tests, and UAT with synthetic data only. | LRB-001 through LRB-004 and LRB-008 resolved |
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
- `pnpm docs:frozen` passes.
- `git diff --check` passes.
- No launch artifact contains real secrets, real customer data, or external
  endpoint credentials.
- Every human/company decision is listed as an `approval-required` blocker.
- Deployment skeletons remain disabled until those blockers are resolved.

## Current Launch Status

Machine-actionable launch preparation is complete for this pack. Product launch
itself is blocked by the approval-required items in
`docs/release/launch-blocker-ledger.md`.
