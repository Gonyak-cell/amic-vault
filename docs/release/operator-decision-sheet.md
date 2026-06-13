# Operator Decision Sheet

Status: OPEN - DECISIONS REQUIRED

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
| LRB-001 | TBD | Operator | TBD | Cloud provider and domestic/private region approval. |
| LRB-002 | TBD | Operator | TBD | DNS, TLS, certificate authority, and ownership approval. |
| LRB-003 | TBD | Operator | TBD | Container registry, namespace, retention, and image signing policy approval. |
| LRB-004 | TBD | Security | TBD | Secret manager and runtime secret refs approval. |
| LRB-008 | TBD | Security/Ops | TBD | Monitoring sink, alert destination, incident response, and evidence retention approval. |

## RC Freeze Decision

| Decision | Status | Owner Role | Evidence Ref | Decision Summary |
|---|---|---|---|---|
| RC-FREEZE-001 | TBD | Operator | TBD | Decide whether `a0c1e60` is the frozen release-candidate SHA for staging. |

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
| API database connection | TBD | TBD |
| API session signing | TBD | TBD |
| API object storage access | TBD | TBD |
| API encryption material ref | TBD | TBD |
| Web API base URL ref | TBD | TBD |
| Ingestion worker database connection | TBD | TBD |
| Ingestion worker object storage access | TBD | TBD |

## Completion Rule

Launch may proceed only when every LRB-001 through LRB-014 row has:

- status `approved`,
- an evidence ref,
- no committed secret, private endpoint, or real customer data.
