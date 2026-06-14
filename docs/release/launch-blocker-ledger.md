# Launch Blocker Ledger

Status: OPEN - STAGING DECISIONS APPROVED, PILOT/PRODUCTION APPROVALS REQUIRED

Rows remain unresolved until an operator or responsible owner records an
approved value or evidence reference. Rows marked `approved` record only
non-secret decisions and evidence refs. Do not replace `TBD` values with
secrets, real customer data, or private endpoints in this repository.

| ID | Area | Status | Required Decision | Blocks | Evidence Ref |
|---|---|---|---|---|---|
| LRB-001 | Cloud provider and region | approved | AWS Seoul `ap-northeast-2`; staging/prod network boundaries remain separate. | Staging, production | STAGE-CLOUD-AWS-001 |
| LRB-002 | DNS and TLS | approved | Route 53 plus ACM-managed TLS; concrete domain/private endpoint values stay outside repo. | Staging, production | STAGE-DNS-AWS-001 |
| LRB-003 | Container registry | approved | Amazon ECR with frozen-SHA tags, digest pinning, and lifecycle retention policy. | Staging, production | STAGE-REGISTRY-ECR-001 |
| LRB-004 | Secret management | approved | AWS Secrets Manager plus KMS with runtime secret names only. | Staging, production | STAGE-SECRETS-AWS-001 |
| LRB-005 | Legal terms | approval-required | Terms, privacy notice, DPA, external portal terms, retention/disposal language. | Pilot, GA | TBD |
| LRB-006 | Pricing and support | approval-required | Pricing, support hours, SLA, escalation model, and billing owner. | Pilot, GA | TBD |
| LRB-007 | Customer data approval | approval-required | Whether pilot data may include real customer documents and under what controls. | Pilot, GA | TBD |
| LRB-008 | Monitoring and incident response | approved | CloudWatch Logs, CloudWatch Alarms, and SNS/email alert routing with staging incident evidence retention. | Staging, production | STAGE-MONITOR-AWS-001 |
| LRB-009 | Security review | approval-required | Operational security review over deployment, secrets, backup, logging, and network boundaries. | Production | TBD |
| LRB-010 | Risk C review disposition | approval-required | Confirm operational treatment of historical Risk=C waiver before production. | Production | TBD |
| LRB-011 | Staging UAT acceptance | approval-required | Approved UAT evidence for all critical workflows. | Production | TBD |
| LRB-012 | Backup and restore rehearsal | approval-required | Approved restore drill evidence using non-production data. | Production | TBD |
| LRB-013 | Production release approval | approval-required | Operator release sign-off for the release SHA. | Production | TBD |
| LRB-014 | Post-launch support owner | approval-required | Named owner for support triage, incident handling, and rollback authority. | Pilot, GA | TBD |

Machine-actionable preparation status: complete for this pack.

## Current Technical Preparation

- Candidate application SHA under consideration:
  `9e346d9e48c962448bcccbbef9e30d9c3e468e4f`.
- Frozen release SHA approved for staging image build, smoke, and UAT
  preparation via `CHAT-2026-06-14-RC-FREEZE`.
- Included PRs: `#66`, `#67`, `#68`, `#69`.
- RC freeze is complete and staging-opening decisions LRB-001/002/003/004/008
  are approved for the AWS path via `CHAT-2026-06-14-AWS-STAGING-APPROVAL`.
- No AWS resource provisioning, private endpoint recording, secret value
  recording, image push, staging deploy, or staging smoke execution has been
  performed by this ledger update.
- Repo-local smoke automation exists at `tools/release/staging-smoke.mjs`, but
  staging smoke remains blocked until AWS resources, image digests, runtime
  secret values in AWS, and an approved non-secret target ref exist.
