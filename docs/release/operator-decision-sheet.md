# Operator Decision Sheet

Status: STAGING DECISIONS APPROVED - PILOT AND PRODUCTION DECISIONS REQUIRED

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
| LRB-002 | approved | Operator | STAGE-DNS-AWS-001 | Route 53 and ACM-managed TLS approved; concrete domain names and private endpoints remain outside the repository until provisioned. |
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
| LRB-005 | TBD | Legal/Product | TBD | Terms, privacy notice, DPA, external portal terms, retention/disposal language. |
| LRB-006 | TBD | Product/Finance/Ops | TBD | Pricing, support hours, SLA, escalation, billing owner. |
| LRB-007 | TBD | Operator/Customer Owner | TBD | Pilot customer-data permission and controls. |
| LRB-014 | TBD | Operator/Ops | TBD | Support triage, incident handling, and rollback authority owner. |

## Production Decisions

| Blocker | Status | Owner Role | Evidence Ref | Decision Summary |
|---|---|---|---|---|
| LRB-009 | TBD | Security | TBD | Operational security review over deployment, secrets, backup, logging, and network boundaries. |
| LRB-010 | TBD | Operator/Security | TBD | Operational treatment of historical Risk=C waiver before production. |
| LRB-011 | TBD | Operator/Product | TBD | Staging UAT acceptance for all critical workflows. |
| LRB-012 | TBD | Ops/Security | TBD | Backup and restore rehearsal evidence using non-production data. |
| LRB-013 | TBD | Operator | TBD | Production release approval for the frozen release SHA. |

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
