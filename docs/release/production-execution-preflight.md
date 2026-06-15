# Production Execution Preflight

Status: PASSED - PRODUCTION BOOTSTRAP AND SMOKE VERIFIED
Date: 2026-06-14
Evidence Ref: PROD-REL-PREFLIGHT-AWS-2026-06-14-001 / PROD-SMOKE-AWS-001
Machine Status: production-smoke-passed

This preflight records the post-approval production release execution path after
PR #82 merged. The earlier preflight ref
`PROD-REL-PREFLIGHT-AWS-2026-06-14-001` found no production-specific
infrastructure and blocked release execution. The follow-up bootstrap created a
separate production boundary, deployed the approved release-control SHA, and ran
synthetic-only smoke evidence without committing provider-console evidence.

## Release State Checked

| Item | Result |
|---|---|
| Current `main` merge SHA | `5ff600f60d86d7eb1122c882b265e9686ee02dc7` |
| Production release-control SHA | `65e2db1b401f02c52c58b87bd7af755b24b68483` |
| Launch blocker approvals | LRB-005 through LRB-014 approved |
| Main CI after PR #82 merge | green |
| AWS CLI access | available outside the repository through SSO profile |
| AWS region checked | `ap-northeast-2` |
| Customer data scope | synthetic-data-only |

## Non-Secret AWS Execution Summary

The AWS account contains the previously prepared staging environment classes and
now also contains production-specific runtime classes. Staging and production
are kept as separate environment boundaries.

The production release bootstrap recorded the following non-secret evidence
refs:

| Required Production Class | Execution Result |
|---|---|
| Production environment boundary and networking | `PROD-INFRA-AWS-001` |
| Production ECR repositories and linux/amd64 image manifests | `PROD-REGISTRY-AWS-001` |
| Production PostgreSQL/RDS instance, migration, and runtime DB role rotation | `PROD-BACKUP-AWS-001` |
| Production Secrets Manager runtime refs | `PROD-SECRETS-AWS-001` |
| Production object storage with public block, encryption, and versioning | `PROD-INFRA-AWS-001` |
| Production load balancer and temporary HTTPS distribution | `PROD-HTTPS-TEMP-AWS-001` |
| Production logs, alarms, and monitoring start | `PROD-MONITOR-AWS-001` |
| Production migration/deploy workflow execution | `PROD-DEPLOY-WORKFLOW-AWS-001` |
| Production post-deploy synthetic smoke | `PROD-SMOKE-AWS-001` |

Concrete account IDs, ARNs, private endpoints, secret names beyond already
approved public-safe refs, screenshots, cookies, tokens, and provider-console
metadata are intentionally not recorded in this repository.

## Decision

`REL-PROD-REL-TUW-010` executed for the approved release-control SHA
`65e2db1b401f02c52c58b87bd7af755b24b68483`. Production infrastructure exists
under production-specific refs, database migration completed, API and web ECS
services reached desired=1/running=1/pending=0, and CloudFront temporary HTTPS
status was deployed.

Do not reuse the AWS staging target as production. That would collapse the
staging/production boundary and would make the production release evidence
ambiguous.

## Smoke Evidence

`PROD-SMOKE-AWS-001` records:

- target ref: `PROD-SMOKE-AWS-001`;
- release SHA: `65e2db1b401f02c52c58b87bd7af755b24b68483`;
- smoke checks: `SMOKE-001` through `SMOKE-011`;
- result: pass=11, fail=0, skip=0;
- data scope: synthetic smoke identities only;
- negative permission check returned safe `PERMISSION_DENIED`;
- audit metadata check remained reference-only.

## Patch Evidence: 2026-06-15

`PROD-PATCH-D80FBB5-DEPLOY-2026-06-15` records the production patch deployment
for current main HEAD `d80fbb5d5bf339ed11ddd6bca27b9e937bd83811`.

- deployment target: existing separate production ECS/ECR/RDS/Secrets/Object
  Storage/ALB/temporary HTTPS boundary;
- image set: API, web, and ingestion linux/amd64 manifests built from
  `d80fbb5d5bf339ed11ddd6bca27b9e937bd83811`;
- migration: no `db/migrations` or `tools/db` changes in the patch diff;
- runtime: production API and web ECS services reached desired=1/running=1/pending=0
  on task revisions 4;
- smoke seed: minimum synthetic-only smoke tenants/users inserted through a
  one-off ECS maintenance task, then the maintenance task definition was
  deregistered;
- smoke: `PROD-PATCH-D80FBB5-FULL-SMOKE-2026-06-15` passed SMOKE-001 through
  SMOKE-015 with pass=15 fail=0 skip=0.

Concrete account IDs, ARNs, private endpoints, secret names beyond already
approved public-safe refs, screenshots, cookies, tokens, and provider-console
metadata remain outside this repository.

## Current Evidence Refs

- `PROD-INFRA-AWS-001`
- `PROD-REGISTRY-AWS-001`
- `PROD-SECRETS-AWS-001`
- `PROD-BACKUP-AWS-001`
- `PROD-DEPLOY-WORKFLOW-AWS-001`
- `PROD-MONITOR-AWS-001`
- `PROD-HTTPS-TEMP-AWS-001`
- `PROD-SMOKE-AWS-001`
- `PROD-PATCH-D80FBB5-DEPLOY-2026-06-15`
- `PROD-PATCH-D80FBB5-FULL-SMOKE-2026-06-15`

## Stop Conditions

- A production step would require committing or printing a secret, token,
  private endpoint, account ID, provider-console screenshot, or customer data.
- Production would reuse the staging database, staging secrets, staging object
  storage, or staging load balancer as if they were production.
- Permission, tenant isolation, audit, DLP, records, external portal, or AI
  policy smoke checks cannot be run after deployment.
- A production resource would be created without a non-secret evidence ref and
  rollback path.
