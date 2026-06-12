# Launch Blocker Ledger

Status: OPEN - APPROVALS REQUIRED

All rows are intentionally unresolved until an operator or responsible owner
records an approved value or evidence reference. Do not replace `TBD` values
with secrets, real customer data, or private endpoints in this repository.

| ID | Area | Status | Required Decision | Blocks | Evidence Ref |
|---|---|---|---|---|---|
| LRB-001 | Cloud provider and region | approval-required | Approved domestic/private cloud target and region. | Staging, production | TBD |
| LRB-002 | DNS and TLS | approval-required | Approved staging and production domains, certificate authority, and TLS ownership. | Staging, production | TBD |
| LRB-003 | Container registry | approval-required | Approved registry, repository names, retention, and image signing policy. | Staging, production | TBD |
| LRB-004 | Secret management | approval-required | Approved secret manager and secret refs for DB, object storage, sessions, encryption, and worker runtime. | Staging, production | TBD |
| LRB-005 | Legal terms | approval-required | Terms, privacy notice, DPA, external portal terms, retention/disposal language. | Pilot, GA | TBD |
| LRB-006 | Pricing and support | approval-required | Pricing, support hours, SLA, escalation model, and billing owner. | Pilot, GA | TBD |
| LRB-007 | Customer data approval | approval-required | Whether pilot data may include real customer documents and under what controls. | Pilot, GA | TBD |
| LRB-008 | Monitoring and incident response | approval-required | Alert destinations, on-call owner, incident severity policy, evidence retention. | Staging, production | TBD |
| LRB-009 | Security review | approval-required | Operational security review over deployment, secrets, backup, logging, and network boundaries. | Production | TBD |
| LRB-010 | Risk C review disposition | approval-required | Confirm operational treatment of historical Risk=C waiver before production. | Production | TBD |
| LRB-011 | Staging UAT acceptance | approval-required | Approved UAT evidence for all critical workflows. | Production | TBD |
| LRB-012 | Backup and restore rehearsal | approval-required | Approved restore drill evidence using non-production data. | Production | TBD |
| LRB-013 | Production release approval | approval-required | Operator release sign-off for the release SHA. | Production | TBD |
| LRB-014 | Post-launch support owner | approval-required | Named owner for support triage, incident handling, and rollback authority. | Pilot, GA | TBD |

Machine-actionable preparation status: complete for this pack.
