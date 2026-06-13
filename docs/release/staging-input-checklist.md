# Staging Input Checklist

Status: PREPARED - AWAITING APPROVED EVIDENCE REFS
Date: 2026-06-13

This checklist is the operator handoff for opening staging. It records only
non-secret reference names and external evidence refs. Do not commit private
URLs, passwords, tokens, cookies, key material, provider screenshots, or real
customer data to this repository.

## Required Inputs Before Staging Deploy

| Input ID | LRB | Required Input | Allowed Repository Value | Blocked Until |
|---|---|---|---|---|
| STAGE-IN-001 | LRB-001 | Cloud provider, domestic/private region, network isolation model. | Evidence ref only. | Operator approval evidence exists. |
| STAGE-IN-002 | LRB-002 | Staging and production DNS/TLS ownership. | Domain evidence ref only, not the private endpoint. | DNS/TLS owner evidence exists. |
| STAGE-IN-003 | LRB-003 | Container registry namespace, retention, signing policy. | Registry evidence ref and image namespace ref only. | Registry evidence exists. |
| STAGE-IN-004 | LRB-004 | Secret manager and runtime secret names. | Secret names only, never values. | Security approval evidence exists. |
| STAGE-IN-005 | LRB-008 | Monitoring, alert sink, incident policy, evidence retention. | Alert sink ref and policy ref only. | Ops/Security approval evidence exists. |
| STAGE-IN-006 | RC-FREEZE-001 | Frozen release candidate SHA. | Git SHA and evidence ref. | Operator RC freeze evidence exists. |
| STAGE-IN-007 | EV-STAGE-001 | Staging image digest set. | Digest refs only. | Approved registry push exists. |
| STAGE-IN-008 | EV-SMOKE-001 | Staging smoke target and execution evidence. | Non-secret target ref and smoke evidence ref only. | `pnpm release:smoke` passes on approved target. |

## Required Secret Names

Record only the approved secret reference names in the external evidence system.
The repository may mention the required categories below, but never the values.

| Runtime | Required Secret Category | Repository Handling |
|---|---|---|
| API | database connection | external evidence ref only |
| API | session signing material | external evidence ref only |
| API | object storage access | external evidence ref only |
| API | encryption material reference | external evidence ref only |
| Web | API base URL | external evidence ref only |
| Ingestion worker | database connection | external evidence ref only |
| Ingestion worker | object storage access | external evidence ref only |

## Operator Fill-In Rule

For each row, the operator records the actual value in the approved external
evidence store and writes only the evidence ref into
`docs/release/operator-decision-sheet.md`.

## Codex Stop Conditions

- A task requires committing a private endpoint, password, token, cookie, key,
  raw provider screenshot, or real customer file.
- A staging target has no LRB evidence ref.
- Smoke, permission, tenant isolation, audit, DLP, records, external portal, or
  AI gate checks fail.
- The release SHA changes without a new RC freeze evidence ref.
