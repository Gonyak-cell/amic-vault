# Launch Blocker Ledger

Status: APPROVED - PRODUCTION DEPLOYED / MONITORING ACTIVE

Rows are resolved when an operator or responsible owner records an approved
value or evidence reference. Rows marked `approved` record only non-secret
decisions and evidence refs. Do not record secrets, real customer data, or
private endpoints in this repository.

| ID      | Area                             | Status   | Required Decision                                                                                                                                                                                                                                                                                            | Blocks                              | Evidence Ref                                                                  |
| ------- | -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------- |
| LRB-001 | Cloud provider and region        | approved | AWS Seoul `ap-northeast-2`; staging/prod network boundaries remain separate.                                                                                                                                                                                                                                 | Staging, production                 | STAGE-CLOUD-AWS-001                                                           |
| LRB-002 | DNS and TLS                      | approved | No custom staging domain. Use an AWS-managed temporary service or load-balancer target ref for staging smoke; concrete endpoint values stay outside repo. Production custom domain/TLS remains deferred to the production gate.                                                                              | Staging; production domain deferred | STAGE-TEMP-TARGET-AWS-001                                                     |
| LRB-003 | Container registry               | approved | Amazon ECR with frozen-SHA tags, digest pinning, and lifecycle retention policy.                                                                                                                                                                                                                             | Staging, production                 | STAGE-REGISTRY-ECR-001                                                        |
| LRB-004 | Secret management                | approved | AWS Secrets Manager plus KMS with runtime secret names only.                                                                                                                                                                                                                                                 | Staging, production                 | STAGE-SECRETS-AWS-001                                                         |
| LRB-005 | Legal terms                      | approved | Terms, privacy notice, DPA, external portal terms, retention/disposal language approved for current launch scope.                                                                                                                                                                                            | Pilot, GA                           | APPROVAL-LRB-005-2026-06-14                                                   |
| LRB-006 | Pricing and support              | approved | Pricing, support hours, SLA, escalation model, and billing owner approved for current launch scope.                                                                                                                                                                                                          | Pilot, GA                           | APPROVAL-LRB-006-2026-06-14                                                   |
| LRB-007 | Customer data approval           | approved | Actual customer documents are approved for production/pilot use only through the Vault app-controlled upload/versioning path; no raw customer document, document body, private endpoint, account identifier, ARN, secret, token, cookie, or private-data screenshot may be committed to repository evidence. | Pilot, GA                           | APPROVAL-LRB-007-CUSTOMER-DATA-2026-06-15                                     |
| LRB-008 | Monitoring and incident response | approved | CloudWatch Logs, CloudWatch Alarms, and SNS/email alert routing with staging incident evidence retention.                                                                                                                                                                                                    | Staging, production                 | STAGE-MONITOR-AWS-001                                                         |
| LRB-009 | Security review                  | approved | Operational security review over deployment, secrets, backup, logging, and network boundaries approved.                                                                                                                                                                                                      | Production                          | APPROVAL-LRB-009-2026-06-14                                                   |
| LRB-010 | Risk C review disposition        | approved | Historical Risk=C waiver operational treatment approved for this production release gate.                                                                                                                                                                                                                    | Production                          | APPROVAL-LRB-010-2026-06-14                                                   |
| LRB-011 | Staging UAT acceptance           | approved | UAT-001 through UAT-020 accepted using synthetic technical evidence.                                                                                                                                                                                                                                         | Production                          | APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 / SYNTH-UAT-TECH-2026-06-14-001         |
| LRB-012 | Backup and restore rehearsal     | approved | Non-production backup/restore rehearsal evidence accepted.                                                                                                                                                                                                                                                   | Production                          | APPROVAL-LRB-012-RESTORE-2026-06-14 / RESTORE-DRILL-AWS-001                   |
| LRB-013 | Production release approval      | approved | Operator release sign-off recorded for current release-control SHA `65e2db1b401f02c52c58b87bd7af755b24b68483`.                                                                                                                                                                                               | Production                          | APPROVAL-LRB-013-PROD-RELEASE-2026-06-14                                      |
| LRB-014 | Post-launch support owner        | approved | Support triage, customer contact, incident handling, and rollback authority owner is `jws`; console/operator execution identity may remain `jws-admin`.                                                                                                                                                      | Pilot, GA                           | APPROVAL-LRB-014-JWS-OWNER-2026-06-15 / APPROVAL-LRB-014-JWS-ADMIN-2026-06-14 |

Machine-actionable preparation status: production release executed and
post-launch monitoring active for this pack.

## Current Technical Preparation

- Candidate application SHA originally approved for staging preparation:
  `9e346d9e48c962448bcccbbef9e30d9c3e468e4f`.
- AWS staging technical candidate deployed for temporary-target smoke after the
  web Docker same-origin staging fix: `1b3b1580be29cdaa83b9d627c3bd1c76d9b3059d`.
- AWS staging runtime-RLS hardening candidate deployed after removing the
  runtime DB owner workaround: `f0eb94457659b30e36e7ca9f5d0eb451bc1e936f`.
- Frozen release SHA approved for staging image build, smoke, and UAT
  preparation via `CHAT-2026-06-14-RC-FREEZE`.
- Included release-prep PRs: `#66`, `#67`, `#68`, `#69`; post-merge
  staging hardening/alignment PR: `#78`.
- RC freeze is complete and staging-opening decisions LRB-001/002/003/004/008
  are approved for the AWS path via `CHAT-2026-06-14-AWS-STAGING-APPROVAL`.
  Staging uses an AWS-managed temporary target ref instead of a custom domain
  via `CHAT-2026-06-14-AWS-TEMP-STAGING-TARGET`.
- AWS staging resources, ECR images, runtime secret values in AWS Secrets
  Manager, ECS services, ALB target health, and staging smoke have been
  completed under evidence refs `STAGE-PROVISION-AWS-001`,
  `STAGE-DEPLOY-AWS-001`, `STAGE-SMOKE-AWS-001`, and
  `STAGE-RUNTIME-RLS-AWS-001`.
- Current AWS staging deployment is aligned to main merge SHA
  `9ed101081484e0f1d0f417652549d4dea762c6de` under evidence ref
  `STAGE-MAIN-MERGE-AWS-001`: API/Web/ingestion digest refs were pushed, ECS
  API/Web rollouts completed, and SMOKE-001 through SMOKE-011 passed.
- Runtime DB owner workaround is resolved in staging: API runtime now uses the
  `vault_app` role, runtime auth helper functions are present, RLS FORCE and
  audit append-only invariants were verified, and RDS ingress was returned to
  ECS-only access.
- Non-production AWS staging backup/restore technical rehearsal passed under
  `RESTORE-DRILL-AWS-001`; LRB-012 acceptance is recorded under
  `APPROVAL-LRB-012-RESTORE-2026-06-14`.
- Synthetic technical UAT evidence for UAT-001 through UAT-020 is recorded under
  `SYNTH-UAT-TECH-2026-06-14-001`; LRB-011 acceptance is recorded under
  `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`.
- Concrete endpoint values, account identifiers, private URLs, screenshots,
  cookies, tokens, secret values, and provider-console metadata remain outside
  this repository.
- Pilot and production gate approvals LRB-005 through LRB-014 are recorded.
  Production deployment is recorded only through non-secret refs and remains
  governed by `docs/release/production-release-runbook.md` and
  `infra/ci/prod-gate.yml`.
- Production release execution preflight is recorded under
  `PROD-REL-PREFLIGHT-AWS-2026-06-14-001`: it initially found no
  production-specific infrastructure, so staging resources were not reused as
  production.
- Production bootstrap then created a separate production boundary under
  evidence refs `PROD-INFRA-AWS-001`, `PROD-REGISTRY-AWS-001`,
  `PROD-SECRETS-AWS-001`, `PROD-BACKUP-AWS-001`,
  `PROD-DEPLOY-WORKFLOW-AWS-001`, `PROD-HTTPS-TEMP-AWS-001`, and
  `PROD-MONITOR-AWS-001`.
- Production release-control SHA
  `65e2db1b401f02c52c58b87bd7af755b24b68483` was deployed with synthetic-only
  data. Database migration completed, runtime DB role credentials were rotated
  away from development credentials, API and web services reached
  desired=1/running=1/pending=0, temporary HTTPS status was deployed, and
  temporary local RDS ingress was revoked after verification.
- Production smoke evidence `PROD-SMOKE-AWS-001` passed SMOKE-001 through
  SMOKE-011 with pass=11 fail=0 skip=0. Negative permission behavior returned
  safe `PERMISSION_DENIED`; audit metadata remained reference-only.
- Production patch `PROD-PATCH-D80FBB5-DEPLOY-2026-06-15` deployed current main
  HEAD `d80fbb5d5bf339ed11ddd6bca27b9e937bd83811` after PR #87 merged. API,
  web, and ingestion image manifests were pushed from that SHA, production
  API/Web ECS services reached desired=1/running=1/pending=0 on task revisions
  4, no schema migration was required, and
  `PROD-PATCH-D80FBB5-FULL-SMOKE-2026-06-15` passed SMOKE-001 through SMOKE-015
  with pass=15 fail=0 skip=0. The smoke run used synthetic-only identities; no
  real customer data was introduced.
- Customer-document launch approval supersedes the earlier synthetic-only pilot
  scope under `APPROVAL-LRB-007-CUSTOMER-DATA-2026-06-15`. Actual customer
  documents may enter production only through the Vault app-controlled
  upload/versioning path. Release artifacts must still omit raw customer
  documents, document bodies, screenshots with private data, private endpoints,
  account identifiers, ARNs, secrets, cookies, and tokens.
- Production operational alarms were strengthened under
  `PROD-MONITOR-ALARMS-AWS-2026-06-15`: CloudWatch alarms now cover ALB 5xx,
  API/Web target health, API/Web ECS CPU and memory, RDS CPU, RDS free storage,
  and RDS connection count; an EventBridge ECS stopped-task rule routes to the
  production alert topic. The SNS email subscription was requested for `jws`
  and remains effective after email confirmation outside the repository.
- Final customer-launch smoke
  `PROD-CUSTOMER-LAUNCH-FINAL-SMOKE-2026-06-15` passed SMOKE-001 through
  SMOKE-015 with pass=15 fail=0 skip=0 at current main HEAD
  `f4b69249c28ebf9e4465f36841af5d6c40fe7743` against the production temporary
  HTTPS target ref. The smoke run used synthetic smoke identities and did not
  upload or expose customer documents.
- Production patch `PROD-PATCH-42E7B29-DEPLOY-2026-06-15` deployed current
  main HEAD `42e7b29665406dc1b6f110acf4a79e8453e2c8c5` after PR #94 merged.
  API, web, and ingestion image manifests were pushed; a pre-patch RDS snapshot
  reached available status; migrations `0064` through `0068` were applied by a
  one-off ECS migrator task with exitCode 0 and the migrator task definition was
  deregistered; production API/Web ECS services reached
  desired=1/running=1/pending=0 on task revisions 5 and 9; Local Gemma execution
  flags remain explicitly disabled in production task env pending separate
  operator approval; `PROD-PATCH-42E7B29-FULL-SMOKE-2026-06-15` passed
  SMOKE-001 through SMOKE-015 with pass=15 fail=0 skip=0; target groups ended
  healthy-only and production alarms were OK.
- Production patch `PROD-PATCH-46C6B14-DEPLOY-2026-06-16` deployed current
  main HEAD `46c6b14c4d0fd143b478e3184018635c9f96568a`. API, web, ingestion,
  and one-off migrator image manifests were pushed; a pre-patch RDS snapshot
  reached available status; the first migrator task exited before schema
  mutation on app-role permission denial; the migration-role rerun applied
  migrations `0069` through `0076` with exitCode 0 and migrator task
  definitions were deregistered; production API/Web ECS services reached
  desired=1/running=1/pending=0 on task revisions 6 and 10; Local Gemma
  execution flags were explicitly disabled in that production patch pending
  separate operator approval; `PROD-PATCH-46C6B14-FULL-SMOKE-2026-06-16`
  passed SMOKE-001 through SMOKE-015 with pass=15 fail=0 skip=0; target groups
  ended healthy-only and production alarms were OK.
- Local Gemma runtime canary is active under
  `PROD-LAI-CANARY-RUNTIME-2026-06-16` after
  `APPROVAL-LAI-PROD-OPERATOR-2026-06-16`,
  `APPROVAL-LAI-PROD-SECURITY-2026-06-16`,
  `APPROVAL-LAI-PROD-LEGAL-DATA-2026-06-16`, and
  `APPROVAL-LAI-PROD-CUSTOMER-SCOPE-2026-06-16`. Scope is file organization
  prep only, legal analysis excluded, rollback owner `jws`. Upload-prep queue
  execution remains blocked because `AI_PREP_ENABLED=false` and
  `AI_PREP_QUEUE_WORKER_ENABLED=false` until pg-boss queue preparation is run
  by a migration-role one-off task and audited with one approved
  synthetic/canary tenant ref outside the repository.
- Concrete endpoint values, account identifiers, ARNs, private URLs,
  screenshots, cookies, tokens, secret values, provider-console metadata, and
  customer data remain outside this repository.
