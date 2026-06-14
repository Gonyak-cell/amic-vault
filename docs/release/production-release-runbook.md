# Production Release Runbook

Status: DEPLOYED - POST-LAUNCH MONITORING

## Entry Criteria

- `infra/ci/prod-gate.yml` required-before-continue items are satisfied.
- Every launch blocker row in `docs/release/launch-blocker-ledger.md` is
  approved with an evidence reference.
- Staging deployment and UAT are green.
- Security evidence index is reviewed.
- Rollback runbook is rehearsed.
- Production data handling, legal terms, pricing, support, and operator
  sign-off are recorded outside the repository or by an approved ledger entry.
- Current release approval ref is
  `APPROVAL-LRB-013-PROD-RELEASE-2026-06-14`.
- Production execution preflight ref
  `PROD-REL-PREFLIGHT-AWS-2026-06-14-001` is closed by production bootstrap
  refs `PROD-INFRA-AWS-001`, `PROD-REGISTRY-AWS-001`,
  `PROD-SECRETS-AWS-001`, `PROD-BACKUP-AWS-001`,
  `PROD-DEPLOY-WORKFLOW-AWS-001`, `PROD-HTTPS-TEMP-AWS-001`,
  `PROD-MONITOR-AWS-001`, and `PROD-SMOKE-AWS-001`.

## Current Execution State

Do not execute this runbook against the AWS staging target. The current
execution used production-specific ECS/ECR/RDS/Secrets/Object Storage/ALB,
temporary HTTPS, logging, monitoring, and deployment workflow evidence refs.

Production smoke passed for release-control SHA
`65e2db1b401f02c52c58b87bd7af755b24b68483` under `PROD-SMOKE-AWS-001` with
SMOKE-001 through SMOKE-011 pass=11 fail=0 skip=0. Concrete endpoints, account
IDs, ARNs, provider-console metadata, cookies, tokens, secret values, and
customer data remain outside this repository.

## Release Steps

1. Freeze release SHA.
2. Confirm no pending high or critical security issues.
3. Confirm production environment variables and secret references through the
   approved secret manager.
4. Confirm pre-release backup snapshot and restore drill evidence.
5. Build images from the release SHA.
6. Push images to the approved registry.
7. Put production into release window status.
8. Acquire migration lock.
9. Run database migrations.
10. Deploy api, web, and ingestion worker.
11. Run post-deploy smoke tests.
12. Run permission, tenant isolation, audit, and external portal smoke checks.
13. Record release evidence in the execution ledger.
14. Move release window to monitoring status.

## Post-Deploy Monitoring

- API health and error rate.
- Login/session failures.
- Permission denied and tenant isolation violation rates.
- Audit write failures.
- Search permission leakage tests.
- Ingestion worker queue lag.
- External portal token failures.
- Records disposal denial and approval paths.
- AI policy blocked/allowed evidence counts.

## Hold Conditions

Stop the release if any of these occur:

- Migration fails or cannot be safely rolled forward.
- Permission, tenant isolation, audit, or DLP smoke checks fail.
- Any secret, real customer data, or raw sensitive document content is exposed in
  logs or release artifacts.
- External model route opens unexpectedly.
- External sharing behavior differs from R11 gate evidence.
- Operator, security, legal, product, or data approval is missing.
