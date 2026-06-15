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

Production patch `PROD-PATCH-D80FBB5-DEPLOY-2026-06-15` deployed current main
HEAD `d80fbb5d5bf339ed11ddd6bca27b9e937bd83811` after PR #87 merged. The patch
updated API, web, and ingestion image manifests, rolled production API/Web ECS
services to task revisions 4, required no schema migration, and passed
`PROD-PATCH-D80FBB5-FULL-SMOKE-2026-06-15` with SMOKE-001 through SMOKE-015
pass=15 fail=0 skip=0. Concrete endpoints, account IDs, ARNs, provider-console
metadata, cookies, tokens, secret values, and customer data remain outside this
repository.

Production patch `PROD-PATCH-42E7B29-DEPLOY-2026-06-15` deployed current main
HEAD `42e7b29665406dc1b6f110acf4a79e8453e2c8c5` after PR #94 merged. The patch
updated API, web, and ingestion image manifests, created an available
pre-patch RDS snapshot evidence ref, applied migrations `0064` through `0068`
through a one-off ECS migrator task, deregistered the migrator task definition,
and rolled production API/Web ECS services to task revisions 5 and 9. Local AI
runtime execution gates were left explicitly disabled in production task env
until a separate operator approval enables Gemma runtime. The patch passed
`PROD-PATCH-42E7B29-FULL-SMOKE-2026-06-15` with SMOKE-001 through SMOKE-015
pass=15 fail=0 skip=0. Target groups ended healthy-only and production
CloudWatch alarms were OK. Concrete endpoints, account IDs, ARNs,
provider-console metadata, cookies, tokens, secret values, and customer data
remain outside this repository.

Customer-launch evidence `APPROVAL-LRB-007-CUSTOMER-DATA-2026-06-15` approves
actual customer documents only through the Vault app-controlled
upload/versioning path. `APPROVAL-LRB-014-JWS-OWNER-2026-06-15` assigns support
triage, customer contact, incident handling, and rollback authority to `jws`.
Operational alarms were strengthened under `PROD-MONITOR-ALARMS-AWS-2026-06-15`;
SNS email delivery requires external email confirmation. Final smoke
`PROD-CUSTOMER-LAUNCH-FINAL-SMOKE-2026-06-15` passed SMOKE-001 through
SMOKE-015 with pass=15 fail=0 skip=0 at current main HEAD
`f4b69249c28ebf9e4465f36841af5d6c40fe7743`. The smoke run used synthetic
smoke identities and did not upload or expose customer documents.

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
- Alert delivery confirmation for the `jws` SNS subscription.

## Hold Conditions

Stop the release if any of these occur:

- Migration fails or cannot be safely rolled forward.
- Permission, tenant isolation, audit, or DLP smoke checks fail.
- Any secret, real customer data, or raw sensitive document content is exposed in
  logs or release artifacts.
- External model route opens unexpectedly.
- External sharing behavior differs from R11 gate evidence.
- Operator, security, legal, product, or data approval is missing.
