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
| EV-UAT-001 | UAT | passed | Codex/Product QA | STAGE-MAIN-MERGE-AWS-001 | UAT-001 auth and tenant-context path passed via current main-merge staging smoke: live/ready health, unauthenticated dashboard redirect, synthetic login, authenticated dashboard, tenant-scoped API response, and negative tenant-settings denial. Product acceptance remains blocked by LRB-011. |
| EV-UAT-002 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Matter/client/party/team technical path is covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-003 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Ethical wall and permission denial technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-004 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Document upload/version/preview/download/delete/hold/audit technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-005 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Search authorization, metadata leakage, and Korean search eval technical paths are covered by integration/eval evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-006 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Email import, raw storage, filing, RLS, and audit technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-007 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | DLP finding, metadata leakage, and external gate technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-008 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Break-glass scoped access and revocation technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-009 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Local-only AI evidence, citations, policy, model routing, and audit technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-010 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Permission-scoped graph technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-011 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Contract intelligence technical paths are covered by integration and contract gate evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-012 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | DD vault technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-013 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Litigation vault technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-014 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | External portal token/NDA/manifest/Q&A and DLP warning technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-015 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Records hold/archive/disposal/certificate technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-016 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Enterprise hardening reference-only technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-017 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Scale and learning readiness technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-018 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Audit console/export/immutability/logger technical paths are covered by integration evidence; product acceptance remains blocked by LRB-011. |
| EV-UAT-019 | UAT | technical-pass | Codex/Ops | RESTORE-DRILL-AWS-001 / SYNTH-UAT-TECH-2026-06-14-001 | Non-production restore technical drill and integration evidence cover backup-resilience invariants; product acceptance remains blocked by LRB-011 and backup acceptance by LRB-012. |
| EV-UAT-020 | UAT | technical-pass | Codex | SYNTH-UAT-TECH-2026-06-14-001 | Rollback-readiness technical evidence covers smoke dry-run, migration/docs gates, and launch validators without executing production rollback; product acceptance remains blocked by LRB-011. |
| EV-PILOT-001 | Pilot | blocked | Legal/Product | LRB-005 | Legal terms and privacy/DPA approvals. |
| EV-PILOT-002 | Pilot | blocked | Product/Finance/Ops | LRB-006 | Pricing, support, SLA, billing owner. |
| EV-PILOT-003 | Pilot | blocked | Operator/Customer Owner | LRB-007 | Customer data approval and controls. |
| EV-PROD-001 | Production gate | blocked | Security | LRB-009 | Operational security review. |
| EV-PROD-002 | Production gate | blocked | Operator/Security | LRB-010 | Historical Risk=C waiver treatment. |
| EV-PROD-003 | Production gate | blocked | Product/Operator | LRB-011 | UAT acceptance. |
| EV-PROD-004 | Production gate | technical-pass | Codex/Ops | RESTORE-DRILL-AWS-001 | Non-production AWS staging RDS snapshot/restore technical drill passed: temporary restored DB verified `vault_app` runtime auth helpers, RLS FORCE on critical tables, audit append-only privileges, and tenant fixture counts; temporary DB and manual snapshot were deleted. Human acceptance remains required by LRB-012. |
| EV-PROD-005 | Production release | blocked | Operator | LRB-013 | Production release approval for frozen SHA. |

## Evidence ID Rules

- `EV-RC-*`: release candidate evidence.
- `EV-STAGE-*`: staging opening evidence.
- `EV-SMOKE-*`: smoke automation output refs.
- `EV-UAT-*`: UAT case refs.
- `EV-PILOT-*`: pilot entry evidence.
- `EV-PROD-*`: production gate and release evidence.

Evidence records may include status, owner role, date, check IDs, and non-secret
external references only.
