# Launch Readiness Pack

Date: 2026-06-13
Status: PREPARED - NOT LAUNCHED

## Scope

This pack converts the post-R14 technical completion state into a launch-ready
operations package. It does not deploy AMIC Vault, connect to a cloud provider,
create secrets, use real customer data, call external services, or change the
product release boundary.

## Baseline

- Code baseline: `main` at `a3d46d0`.
- Technical gate baseline: R14 Scale & Learning technical pass with remaining
  blockers 0.
- Latest verified main CI baseline before this pack:
  `https://github.com/Gonyak-cell/amic-vault/actions/runs/27446678134`.
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
| Security evidence index | `docs/release/security-evidence-index.md` | Prepared |
| Launch blocker ledger | `docs/release/launch-blocker-ledger.md` | Prepared |
| Readiness validator | `tools/release/check-launch-readiness.mjs` | CI wired |

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
