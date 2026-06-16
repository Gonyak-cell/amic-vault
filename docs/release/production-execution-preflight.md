# Production Execution Preflight

Status: PASSED - PRODUCTION CUSTOMER LAUNCH SMOKE VERIFIED / PRODUCTION PATCH 46C6B14 SMOKE VERIFIED
Date: 2026-06-16
Evidence Ref: PROD-REL-PREFLIGHT-AWS-2026-06-14-001 / PROD-SMOKE-AWS-001 / PROD-CUSTOMER-LAUNCH-FINAL-SMOKE-2026-06-15 / PROD-PATCH-42E7B29-DEPLOY-2026-06-15 / PROD-PATCH-42E7B29-FULL-SMOKE-2026-06-15 / PROD-PATCH-46C6B14-DEPLOY-2026-06-16 / PROD-PATCH-46C6B14-FULL-SMOKE-2026-06-16
Machine Status: customer-launch-smoke-passed / prod-patch-46c6b14-smoke-passed

This preflight records the post-approval production release execution path after
PR #82 merged. The earlier preflight ref
`PROD-REL-PREFLIGHT-AWS-2026-06-14-001` found no production-specific
infrastructure and blocked release execution. The follow-up bootstrap created a
separate production boundary, deployed the approved release-control SHA, and ran
synthetic-only smoke evidence without committing provider-console evidence.

## Release State Checked

| Item | Result |
|---|---|
| Current `main` merge SHA | `46c6b14c4d0fd143b478e3184018635c9f96568a` (supersedes patch baseline `42e7b29665406dc1b6f110acf4a79e8453e2c8c5` and final-smoke baseline `f4b69249c28ebf9e4465f36841af5d6c40fe7743`) |
| Production release-control SHA | `65e2db1b401f02c52c58b87bd7af755b24b68483` |
| Launch blocker approvals | LRB-005 through LRB-014 approved |
| Main CI after PR #82 and PR #94 merges | green |
| AWS CLI access | available outside the repository through SSO profile |
| AWS region checked | `ap-northeast-2` |
| Customer data scope | approved customer documents through app-controlled upload/versioning only |

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

`PROD-PATCH-42E7B29-DEPLOY-2026-06-15` records the production patch deployment
for current main HEAD `42e7b29665406dc1b6f110acf4a79e8453e2c8c5`.

- deployment target: existing separate production ECS/ECR/RDS/Secrets/Object
  Storage/ALB/temporary HTTPS boundary;
- image set: API, web, and ingestion linux/amd64 manifests built from
  `42e7b29665406dc1b6f110acf4a79e8453e2c8c5`;
- backup: a pre-patch production RDS snapshot reached available status under a
  non-secret evidence ref;
- migration: `0064_create_ai_prep_artifacts` through
  `0068_harden_ai_prep_completed_payload` applied through a one-off ECS
  migrator task; the migrator task definition was deregistered after exitCode 0;
- runtime: production API and web ECS services reached desired=1/running=1/pending=0
  on task revisions 5 and 9;
- AI runtime gate at patch time: Local Gemma execution env flags were explicitly
  false in the production API task pending separate operator approval;
- smoke: `PROD-PATCH-42E7B29-FULL-SMOKE-2026-06-15` passed SMOKE-001 through
  SMOKE-015 with pass=15 fail=0 skip=0;
- monitoring: API/Web target groups ended healthy-only and production alarms
  were OK after deployment.

`PROD-PATCH-46C6B14-DEPLOY-2026-06-16` records the production patch deployment
for current main HEAD `46c6b14c4d0fd143b478e3184018635c9f96568a`.

- deployment target: existing separate production ECS/ECR/RDS/Secrets/Object
  Storage/ALB/temporary HTTPS boundary;
- image set: API, web, ingestion, and one-off migrator linux/amd64 manifests
  built from `46c6b14c4d0fd143b478e3184018635c9f96568a`;
- backup: a pre-patch production RDS snapshot reached available status under a
  non-secret evidence ref;
- migration: the first migrator task used the app runtime DB role and exited
  before schema mutation on permission denial; the migration-role rerun applied
  `0069_add_ai_prep_rejected_status` through
  `0076_extend_ai_prep_feedback_reasons`, exited 0, and recorded
  `Migrations complete!`; migrator task definitions were deregistered;
- runtime: production API and web ECS services reached desired=1/running=1/pending=0
  on task revisions 6 and 10;
- AI runtime gate at patch time: Local Gemma execution env flags were explicitly
  false in the production API task pending separate operator approval;
- smoke: `PROD-PATCH-46C6B14-FULL-SMOKE-2026-06-16` passed SMOKE-001 through
  SMOKE-015 with pass=15 fail=0 skip=0;
- monitoring: API/Web target groups ended healthy-only and production alarms
  were OK after deployment.

`PROD-LAI-UPLOAD-PREP-CANARY-ENABLE-2026-06-16` records the later Local AI
canary enablement for current main HEAD `62b35cd497e1482e5e0fb5bd898e09ffa88270b`.

- scope: file organization prep only; legal analysis, external model routes,
  tenant expansion, and automatic reprocessing remain excluded;
- queue prep: `PROD-LAI-PGBOSS-QUEUE-PREP-2026-06-16` prepared `ai.prep` and
  `ai.prep.dead` with runtime grants through a migration-role one-off task;
- runtime: production API/Web services reached desired=1/running=1/pending=0,
  the Gemma sidecar was RUNNING/HEALTHY, and upload-prep worker flags were
  active only with the canary tenant allowlist and tenant concurrency 1;
- smoke: `PROD-LAI-UPLOAD-PREP-CANARY-PUBLIC-SMOKE-2026-06-16` passed with
  pass=8 fail=0 skip=7;
- monitoring: recent `AI_PREP_QUEUE_ERROR` count was 0 during the post-enable
  sanity check.

`PROD-LAI-FILE-ORG-FULL-ENABLE-2026-06-16` records the Gemma A option full
production release for current main HEAD `c9dc922d50fe7b39b52f023d1942d8b7c5ad4cac`.

- approval: `APPROVAL-LAI-PROD-FILE-ORG-FULL-2026-06-16` authorizes full
  production tenant scope for file organization prep only;
- scope: summary generation, legal analysis, external model routes, raw
  prompt/source/model-response storage, and automatic reprocessing remain
  excluded;
- runtime: production API runs with `LOCAL_GEMMA_ENABLED=true`,
  `AI_PREP_ENABLED=true`, `AI_PREP_QUEUE_WORKER_ENABLED=true`,
  `AI_PREP_REQUIRE_TENANT_ALLOWLIST=false`, empty canary tenant refs, tenant
  concurrency 1, runtime pg-boss migrations disabled, and
  `AI_SUMMARY_GEMMA_ENABLED=false`;
- monitoring: alert delivery is confirmed under
  `PROD-LAI-ALERT-DELIVERY-2026-06-16`;
- smoke: `PROD-LAI-FILE-ORG-FULL-SMOKE-2026-06-16` passed with pass=8 fail=0
  skip=7.

Concrete account IDs, ARNs, private endpoints, secret names beyond already
approved public-safe refs, screenshots, cookies, tokens, and provider-console
metadata remain outside this repository.

## Customer Launch Evidence: 2026-06-15

`APPROVAL-LRB-007-CUSTOMER-DATA-2026-06-15` records that actual customer
documents may be used for production/pilot launch only through the Vault
app-controlled upload/versioning path. Customer documents, document bodies,
private endpoint values, account identifiers, ARNs, screenshots containing
private data, cookies, tokens, and secret values must not be committed to this
repository or release evidence.

`APPROVAL-LRB-014-JWS-OWNER-2026-06-15` records `jws` as support triage,
customer contact, incident handling, and rollback authority owner.

`PROD-MONITOR-ALARMS-AWS-2026-06-15` records strengthened production alarms:
ALB 5xx, API/Web unhealthy targets, API/Web ECS CPU and memory, RDS CPU, RDS
free storage, RDS connection count, and ECS stopped-task EventBridge routing to
the production alert topic. The SNS email subscription for `jws` was requested
and requires external email confirmation before notifications are delivered.

`PROD-CUSTOMER-LAUNCH-FINAL-SMOKE-2026-06-15` records final production
temporary HTTPS target smoke for current main HEAD
`f4b69249c28ebf9e4465f36841af5d6c40fe7743`: SMOKE-001 through SMOKE-015
passed with pass=15 fail=0 skip=0. The smoke run used synthetic smoke
identities and did not upload or expose customer documents; actual customer
documents are approved separately and must enter only through the app-controlled
upload/versioning path.

## Current Evidence Refs

- `PROD-INFRA-AWS-001`
- `PROD-REGISTRY-AWS-001`
- `PROD-SECRETS-AWS-001`
- `PROD-BACKUP-AWS-001`
- `PROD-DEPLOY-WORKFLOW-AWS-001`
- `PROD-MONITOR-AWS-001`
- `PROD-MONITOR-ALARMS-AWS-2026-06-15`
- `PROD-HTTPS-TEMP-AWS-001`
- `PROD-SMOKE-AWS-001`
- `PROD-PATCH-D80FBB5-DEPLOY-2026-06-15`
- `PROD-PATCH-D80FBB5-FULL-SMOKE-2026-06-15`
- `PROD-PATCH-42E7B29-DEPLOY-2026-06-15`
- `PROD-PATCH-42E7B29-FULL-SMOKE-2026-06-15`
- `PROD-PATCH-46C6B14-DEPLOY-2026-06-16`
- `PROD-PATCH-46C6B14-FULL-SMOKE-2026-06-16`
- `APPROVAL-LRB-007-CUSTOMER-DATA-2026-06-15`
- `APPROVAL-LRB-014-JWS-OWNER-2026-06-15`
- `PROD-CUSTOMER-LAUNCH-FINAL-SMOKE-2026-06-15`

## Stop Conditions

- A production step would require committing or printing a secret, token,
  private endpoint, account ID, provider-console screenshot, or customer data.
- Production would reuse the staging database, staging secrets, staging object
  storage, or staging load balancer as if they were production.
- Permission, tenant isolation, audit, DLP, records, external portal, or AI
  policy smoke checks cannot be run after deployment.
- A production resource would be created without a non-secret evidence ref and
  rollback path.
