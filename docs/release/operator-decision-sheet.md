# Operator Decision Sheet

Status: PILOT AND PRODUCTION APPROVALS RECORDED - PRODUCTION EXECUTED

Use this sheet to track decision evidence refs. Do not commit secrets, private
endpoints, credentials, real customer data, raw legal terms, private contracts,
or provider-console screenshots to this repository.

Use `docs/release/staging-input-checklist.md` for the staging input categories
and repository-safe recording rules.

Allowed values in this file:

- decision status,
- owner role,
- non-secret reference name,
- external evidence ref,
- date,
- short approval note.

## Staging Opening Decisions

| Blocker | Status | Owner Role | Evidence Ref | Decision Summary |
|---|---|---|---|---|
| LRB-001 | approved | Operator | STAGE-CLOUD-AWS-001 | AWS Seoul `ap-northeast-2` approved for staging-first launch path with separate staging/prod network boundaries. Operator chat approval ref: `CHAT-2026-06-14-AWS-STAGING-APPROVAL`. |
| LRB-002 | approved | Operator | STAGE-TEMP-TARGET-AWS-001 | No custom staging domain. Staging will use an AWS-managed temporary service or load-balancer target ref; concrete endpoint values remain outside the repository. Production custom domain/TLS remains deferred to the production gate. |
| LRB-003 | approved | Operator | STAGE-REGISTRY-ECR-001 | Amazon ECR approved with frozen-SHA image tags, digest pinning, and lifecycle retention policy. |
| LRB-004 | approved | Security | STAGE-SECRETS-AWS-001 | AWS Secrets Manager plus KMS approved for runtime secret refs; values must never be committed. |
| LRB-008 | approved | Security/Ops | STAGE-MONITOR-AWS-001 | CloudWatch Logs, CloudWatch Alarms, and SNS/email alert routing approved for staging monitoring and incident evidence. |

## RC Freeze Decision

| Decision | Status | Owner Role | Evidence Ref | Decision Summary |
|---|---|---|---|---|
| RC-FREEZE-001 | approved | Operator | CHAT-2026-06-14-RC-FREEZE | Frozen release SHA `9e346d9e48c962448bcccbbef9e30d9c3e468e4f` approved for staging image build, smoke, and UAT preparation. Production still requires LRB-013. |

## Pilot Decisions

| Blocker | Status | Owner Role | Evidence Ref | Decision Summary |
|---|---|---|---|---|
| LRB-005 | approved | Legal/Product | APPROVAL-LRB-005-2026-06-14 | Pilot/launch terms, privacy notice, DPA, external portal terms, and retention/disposal language approved for the current launch scope. |
| LRB-006 | approved | Product/Finance/Ops | APPROVAL-LRB-006-2026-06-14 | Pricing, support hours, SLA, escalation model, and billing owner approved for the current launch scope. |
| LRB-007 | approved | Operator/Customer Owner | APPROVAL-LRB-007-SYNTHETIC-ONLY-2026-06-14 | Pilot customer data is not approved for real customer documents; launch remains synthetic-data-only until a later explicit customer-data approval changes this row. |
| LRB-014 | approved | Operator/Ops | APPROVAL-LRB-014-JWS-ADMIN-2026-06-14 | Post-launch support triage, incident handling, and rollback authority owner is `jws-admin / Operator`. |

## Production Decisions

| Blocker | Status | Owner Role | Evidence Ref | Decision Summary |
|---|---|---|---|---|
| LRB-009 | approved | Security | APPROVAL-LRB-009-2026-06-14 | Operational security review over deployment, secrets, backup, logging, and network boundaries approved for the current launch scope. |
| LRB-010 | approved | Operator/Security | APPROVAL-LRB-010-2026-06-14 | Operational treatment of historical Risk=C waiver approved for this production release gate. |
| LRB-011 | approved | Operator/Product | APPROVAL-LRB-011-SYNTH-UAT-2026-06-14 / SYNTH-UAT-TECH-2026-06-14-001 | UAT-001 through UAT-020 accepted using synthetic technical UAT evidence. |
| LRB-012 | approved | Ops/Security | APPROVAL-LRB-012-RESTORE-2026-06-14 / RESTORE-DRILL-AWS-001 | Non-production backup/restore rehearsal evidence accepted. |
| LRB-013 | approved | Operator | APPROVAL-LRB-013-PROD-RELEASE-2026-06-14 | Production release approved for release-control SHA `65e2db1b401f02c52c58b87bd7af755b24b68483`; production execution is recorded under EV-PROD-006 and EV-PROD-007, while staging runtime evidence remains `STAGE-MAIN-MERGE-AWS-001`. |

## Required Secret Names

Record only secret names or approved refs here, never values.

| Runtime | Required Ref Name | Status |
|---|---|---|
| API database connection | `/amic-vault/staging/api/database-url` | approved ref name only |
| API session signing | `/amic-vault/staging/api/session-signing` | approved ref name only |
| API object storage access | `/amic-vault/staging/api/object-storage` | approved ref name only |
| API encryption material ref | `/amic-vault/staging/api/encryption-material-ref` | approved ref name only |
| Web API base URL ref | `/amic-vault/staging/web/api-base-url` | approved ref name only |
| Ingestion worker database connection | `/amic-vault/staging/worker/database-url` | approved ref name only |
| Ingestion worker object storage access | `/amic-vault/staging/worker/object-storage` | approved ref name only |

## Completion Rule

Launch may proceed only when every LRB-001 through LRB-014 row has:

- status `approved`,
- an evidence ref,
- no committed secret, private endpoint, or real customer data.
