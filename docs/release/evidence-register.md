# Launch Evidence Register

Status: OPEN - NO PRIVATE EVIDENCE COMMITTED

Evidence refs may point to external systems. Do not commit raw evidence when it
contains private endpoints, provider metadata, secrets, screenshots with private
URLs, real customer documents, cookies, or tokens.

| Evidence ID | Gate | Status | Owner Role | External Ref | Notes |
|---|---|---|---|---|---|
| EV-RC-001 | RC freeze | approved | Operator | CHAT-2026-06-14-RC-FREEZE | Frozen release SHA `9e346d9e48c962448bcccbbef9e30d9c3e468e4f` approved for staging image build, smoke, and UAT preparation; production still requires LRB-013. |
| EV-RC-002 | RC validation | ready | Codex | PR #66, PR #67, PR #68, PR #69, PR #78, CI refs | Candidate code and post-merge staging hardening have merged to `main`; current staging-aligned main SHA is `9ed101081484e0f1d0f417652549d4dea762c6de`. |
| EV-STAGE-001 | Staging open | approved | Operator | STAGE-CLOUD-AWS-001 | AWS Seoul `ap-northeast-2` staging-first cloud path approved; no resource provisioning or deploy executed. |
| EV-STAGE-002 | Staging open | approved | Operator | STAGE-TEMP-TARGET-AWS-001 | No custom staging domain. Staging will use an AWS-managed temporary target ref; concrete endpoint values remain outside repo. Production custom domain/TLS remains deferred. |
| EV-STAGE-003 | Staging open | approved | Operator | STAGE-REGISTRY-ECR-001 | Amazon ECR approved for frozen-SHA tags, digest pinning, and lifecycle retention policy. |
| EV-STAGE-004 | Staging open | approved | Security | STAGE-SECRETS-AWS-001 | AWS Secrets Manager plus KMS approved; repository records secret names only, never values. |
| EV-STAGE-005 | Staging open | approved | Security/Ops | STAGE-MONITOR-AWS-001 | CloudWatch Logs, CloudWatch Alarms, and SNS/email alert routing approved for staging monitoring. |
| EV-STAGE-006 | Staging provision | passed | Codex/Ops | STAGE-PROVISION-AWS-001 | AWS Seoul staging resources provisioned for synthetic-data validation. Resource identifiers, account identifiers, private endpoints, and secret values remain outside the repository. |
| EV-STAGE-007 | Staging deploy | passed | Codex/Ops | STAGE-DEPLOY-AWS-001 | ECR image digest refs, RDS migration/seed, ECS Fargate services, ALB target health, and CloudWatch log groups verified for release SHA `1b3b1580be29cdaa83b9d627c3bd1c76d9b3059d`. Concrete endpoint values remain outside the repository. |
| EV-STAGE-008 | Staging runtime DB hardening | passed | Codex/Ops | STAGE-RUNTIME-RLS-AWS-001 | API runtime DB secret restored to the `vault_app` runtime role, migration `0063_auth_runtime_rls_helpers` applied, ECS API redeployed at release SHA `f0eb94457659b30e36e7ca9f5d0eb451bc1e936f`, RDS ingress returned to ECS-only, and runtime auth helper/RLS invariants verified without recording private endpoints or secret values. |
| EV-STAGE-009 | Staging main alignment | passed | Codex/Ops | STAGE-MAIN-MERGE-AWS-001 | Main merge SHA `9ed101081484e0f1d0f417652549d4dea762c6de` deployed to AWS staging with API/Web/ingestion digest refs and ECS service rollouts completed. Concrete endpoint values, account identifiers, provider-console metadata, and secret values remain outside the repository. |
| EV-SMOKE-001 | Staging smoke | prepared | Codex/Ops | `pnpm release:smoke -- --dry-run` | Smoke automation is repo-local and endpoint-configurable. |
| EV-SMOKE-002 | Local staging preflight | passed | Codex | `pnpm release:local-preflight` | Local-only rehearsal passed for frozen SHA `9e346d9e48c962448bcccbbef9e30d9c3e468e4f`: isolated infra, migration round trip, Docker image builds, SMOKE-001 through SMOKE-011 pass, full integration 81 files / 204 tests, and worker pytest 17 tests. |
| EV-SMOKE-003 | Staging smoke | passed | Codex/Ops | STAGE-SMOKE-AWS-001 | AWS temporary-target staging smoke passed for release SHA `1b3b1580be29cdaa83b9d627c3bd1c76d9b3059d`: SMOKE-001 through SMOKE-011 pass=11 fail=0 skip=0. |
| EV-SMOKE-004 | Staging smoke | passed | Codex/Ops | STAGE-RUNTIME-RLS-AWS-001 | Runtime-RLS hardened AWS temporary-target staging smoke passed for release SHA `f0eb94457659b30e36e7ca9f5d0eb451bc1e936f`: SMOKE-001 through SMOKE-011 pass=11 fail=0 skip=0. |
| EV-SMOKE-005 | Staging smoke | passed | Codex/Ops | STAGE-MAIN-MERGE-AWS-001 | Main-merge AWS temporary-target staging smoke passed for release SHA `9ed101081484e0f1d0f417652549d4dea762c6de`: SMOKE-001 through SMOKE-011 pass=11 fail=0 skip=0. |
| EV-UAT-001 | UAT | passed | Codex/Product QA | STAGE-MAIN-MERGE-AWS-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | UAT-001 auth and tenant-context path passed via current main-merge staging smoke; UAT acceptance is recorded under LRB-011. |
| EV-UAT-002 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Matter/client/party/team technical path is covered by integration evidence and accepted under LRB-011. |
| EV-UAT-003 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Ethical wall and permission denial technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-004 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Document upload/version/preview/download/delete/hold/audit technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-005 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Search authorization, metadata leakage, and Korean search eval technical paths are covered by integration/eval evidence and accepted under LRB-011. |
| EV-UAT-006 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Email import, raw storage, filing, RLS, and audit technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-007 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | DLP finding, metadata leakage, and external gate technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-008 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Break-glass scoped access and revocation technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-009 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Local-only AI evidence, citations, policy, model routing, and audit technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-010 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Permission-scoped graph technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-011 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Contract intelligence technical paths are covered by integration and contract gate evidence and accepted under LRB-011. |
| EV-UAT-012 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | DD vault technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-013 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Litigation vault technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-014 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | External portal token/NDA/manifest/Q&A and DLP warning technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-015 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Records hold/archive/disposal/certificate technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-016 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Enterprise hardening reference-only technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-017 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Scale and learning readiness technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-018 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Audit console/export/immutability/logger technical paths are covered by integration evidence and accepted under LRB-011. |
| EV-UAT-019 | UAT | accepted | Codex/Ops/Product QA | RESTORE-DRILL-AWS-001 / SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Non-production restore technical drill and integration evidence cover backup-resilience invariants; UAT is accepted under LRB-011 and restore acceptance under LRB-012. |
| EV-UAT-020 | UAT | accepted | Codex/Product QA | SYNTH-UAT-TECH-2026-06-14-001 / APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | Rollback-readiness technical evidence covers smoke dry-run, migration/docs gates, and launch validators; UAT is accepted under LRB-011. |
| EV-PILOT-001 | Pilot | approved | Legal/Product | APPROVAL-LRB-005-2026-06-14 | Legal terms and privacy/DPA approvals recorded for current launch scope. |
| EV-PILOT-002 | Pilot | approved | Product/Finance/Ops | APPROVAL-LRB-006-2026-06-14 | Pricing, support, SLA, escalation, and billing owner approval recorded. |
| EV-PILOT-003 | Pilot | approved | Operator/Customer Owner | APPROVAL-LRB-007-SYNTHETIC-ONLY-2026-06-14 | Customer-data handling approved as synthetic-data-only; real customer documents remain disallowed. |
| EV-PILOT-004 | Pilot | approved | Operator/Ops | APPROVAL-LRB-014-JWS-ADMIN-2026-06-14 | Support triage, incident handling, and rollback authority owner recorded as `jws-admin / Operator`. |
| EV-PROD-001 | Production gate | approved | Security | APPROVAL-LRB-009-2026-06-14 | Operational security review approval recorded. |
| EV-PROD-002 | Production gate | approved | Operator/Security | APPROVAL-LRB-010-2026-06-14 | Historical Risk=C waiver treatment approval recorded. |
| EV-PROD-003 | Production gate | approved | Product/Operator | APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 | UAT acceptance recorded for UAT-001 through UAT-020. |
| EV-PROD-004 | Production gate | approved | Codex/Ops | APPROVAL-LRB-012-RESTORE-2026-06-14 / RESTORE-DRILL-AWS-001 | Non-production AWS staging backup/restore rehearsal accepted. |
| EV-PROD-005 | Production release | approved | Operator | APPROVAL-LRB-013-PROD-RELEASE-2026-06-14 | Production release approval recorded for release-control SHA `65e2db1b401f02c52c58b87bd7af755b24b68483`; actual production deployment is not yet executed. |
| EV-PROD-006 | Production release preflight | blocked | Codex/Ops | PROD-REL-PREFLIGHT-AWS-2026-06-14-001 | Post-approval AWS discovery found staging resources only and no production-specific ECS/ECR/RDS/Secrets/Object Storage/ALB/logging/deploy workflow boundary. Production deployment is not executed; do not reuse staging as production. |

## Evidence ID Rules

- `EV-RC-*`: release candidate evidence.
- `EV-STAGE-*`: staging opening evidence.
- `EV-SMOKE-*`: smoke automation output refs.
- `EV-UAT-*`: UAT case refs.
- `EV-PILOT-*`: pilot entry evidence.
- `EV-PROD-*`: production gate and release evidence.

Evidence records may include status, owner role, date, check IDs, and non-secret
external references only.
