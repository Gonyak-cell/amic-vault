# Launch Blocker Ledger

Status: OPEN - STAGING SMOKE/RUNTIME TECHNICAL PASS, PILOT/PRODUCTION APPROVALS REQUIRED

Rows remain unresolved until an operator or responsible owner records an
approved value or evidence reference. Rows marked `approved` record only
non-secret decisions and evidence refs. Do not replace `TBD` values with
secrets, real customer data, or private endpoints in this repository.

| ID | Area | Status | Required Decision | Blocks | Evidence Ref |
|---|---|---|---|---|---|
| LRB-001 | Cloud provider and region | approved | AWS Seoul `ap-northeast-2`; staging/prod network boundaries remain separate. | Staging, production | STAGE-CLOUD-AWS-001 |
| LRB-002 | DNS and TLS | approved | No custom staging domain. Use an AWS-managed temporary service or load-balancer target ref for staging smoke; concrete endpoint values stay outside repo. Production custom domain/TLS remains deferred to the production gate. | Staging; production domain deferred | STAGE-TEMP-TARGET-AWS-001 |
| LRB-003 | Container registry | approved | Amazon ECR with frozen-SHA tags, digest pinning, and lifecycle retention policy. | Staging, production | STAGE-REGISTRY-ECR-001 |
| LRB-004 | Secret management | approved | AWS Secrets Manager plus KMS with runtime secret names only. | Staging, production | STAGE-SECRETS-AWS-001 |
| LRB-005 | Legal terms | approval-required | Terms, privacy notice, DPA, external portal terms, retention/disposal language. | Pilot, GA | TBD |
| LRB-006 | Pricing and support | approval-required | Pricing, support hours, SLA, escalation model, and billing owner. | Pilot, GA | TBD |
| LRB-007 | Customer data approval | approval-required | Whether pilot data may include real customer documents and under what controls. | Pilot, GA | TBD |
| LRB-008 | Monitoring and incident response | approved | CloudWatch Logs, CloudWatch Alarms, and SNS/email alert routing with staging incident evidence retention. | Staging, production | STAGE-MONITOR-AWS-001 |
| LRB-009 | Security review | approval-required | Operational security review over deployment, secrets, backup, logging, and network boundaries. | Production | TBD |
| LRB-010 | Risk C review disposition | approval-required | Confirm operational treatment of historical Risk=C waiver before production. | Production | TBD |
| LRB-011 | Staging UAT acceptance | approval-required | Approved UAT evidence for all critical workflows. | Production | TBD |
| LRB-012 | Backup and restore rehearsal | approval-required | Approve restore drill evidence using non-production data. | Production | RESTORE-DRILL-AWS-001 technical evidence; acceptance pending |
| LRB-013 | Production release approval | approval-required | Operator release sign-off for the release SHA. | Production | TBD |
| LRB-014 | Post-launch support owner | approval-required | Named owner for support triage, incident handling, and rollback authority. | Pilot, GA | TBD |

Machine-actionable preparation status: complete for this pack.

## Current Technical Preparation

- Candidate application SHA originally approved for staging preparation:
  `9e346d9e48c962448bcccbbef9e30d9c3e468e4f`.
- AWS staging technical candidate deployed for temporary-target smoke after the
  web Docker same-origin staging fix: `1b3b1580be29cdaa83b9d627c3bd1c76d9b3059d`.
- AWS staging runtime-RLS hardening candidate deployed after removing the
  runtime DB owner workaround: `f0eb94457659b30e36e7ca9f5d0eb451bc1e936f`.
- Frozen release SHA approved for staging image build, smoke, and UAT
  preparation via `CHAT-2026-06-14-RC-FREEZE`.
- Included PRs: `#66`, `#67`, `#68`, `#69`.
- RC freeze is complete and staging-opening decisions LRB-001/002/003/004/008
  are approved for the AWS path via `CHAT-2026-06-14-AWS-STAGING-APPROVAL`.
  Staging uses an AWS-managed temporary target ref instead of a custom domain
  via `CHAT-2026-06-14-AWS-TEMP-STAGING-TARGET`.
- AWS staging resources, ECR images, runtime secret values in AWS Secrets
  Manager, ECS services, ALB target health, and staging smoke have been
  completed under evidence refs `STAGE-PROVISION-AWS-001`,
  `STAGE-DEPLOY-AWS-001`, `STAGE-SMOKE-AWS-001`, and
  `STAGE-RUNTIME-RLS-AWS-001`.
- Runtime DB owner workaround is resolved in staging: API runtime now uses the
  `vault_app` role, runtime auth helper functions are present, RLS FORCE and
  audit append-only invariants were verified, and RDS ingress was returned to
  ECS-only access.
- Non-production AWS staging backup/restore technical rehearsal passed under
  `RESTORE-DRILL-AWS-001`; human acceptance remains required for LRB-012.
- Concrete endpoint values, account identifiers, private URLs, screenshots,
  cookies, tokens, secret values, and provider-console metadata remain outside
  this repository.
- Production remains blocked by LRB-009 through LRB-013. Security review must
  still review deployment, secrets, backup, logging, and network boundaries
  before production approval.
