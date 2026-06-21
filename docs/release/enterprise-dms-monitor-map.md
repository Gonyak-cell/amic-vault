# Enterprise DMS Monitor Map

Status: REQUIRED BEFORE DMS PRODUCTION SIGNOFF - EXTERNAL REFS ONLY
Related TUW: DMS-GA-305, DMS-GA-701, DMS-UX-811

This monitor map defines the production evidence refs required for the
Matter-first Enterprise DMS release. It intentionally records only opaque query
refs, owners, thresholds, and rollback triggers. Do not commit production URLs,
provider account IDs, ARNs, tenant IDs, customer matter data, document names,
raw search queries, raw prompt/source/model output, cookies, tokens, or
screenshots.

The refs below must be bound to the external monitoring system before release
signoff. Until each required external query ref has an owner-reviewed evidence
receipt, DMS-UX-812 remains `HOLD`.

## DMS-GA-305 Reindex Evidence Contract

| Evidence ref | Required proof | Repository evidence | External receipt boundary |
| --- | --- | --- | --- |
| REINDEX-DMS-001 | Admin-only request path for tenant or matter reindex | `POST /v1/admin/search/reindex`, `RequireRoles('firm_admin', 'security_admin')`, and `apps/api/src/modules/search/index/reindex.controller.spec.ts` | Approved operator smoke or API log ref for admin request only |
| REINDEX-DMS-002 | Non-admin reindex requests fail closed | `RequireRolesGuard` and `reindex.controller.spec.ts` role metadata coverage | Negative role receipt showing `PERMISSION_DENIED` without target leakage |
| REINDEX-DMS-003 | Audit receipt is reference/count only | `SEARCH_REINDEX_REQUESTED` with `scope_type`, `scope_id`, and `enqueued_job_count` only | Audit query ref proving no raw document body or search query text |
| REINDEX-DMS-004 | UI shows queue/status counts only | `AdminSearchOperationsPanel`, `requestTenantSearchReindex`, and `GET /v1/admin/search/health` | Operator UI receipt with count/hash-only status, no raw content |
| REINDEX-DMS-005 | Queue age/failure is monitored | `MON-DMS-003B` and `MON-DMS-003C` below | External queue monitor ref before release PASS |

## Monitor Ref Matrix

| Monitor ID | Required query refs | Signal | Aggregate dimensions | Owner | Threshold | Rollback trigger |
| --- | --- | --- | --- | --- | --- | --- |
| DMS-MON-001 | `MON-DMS-001A-UPLOAD-FAILURE-RATE`, `MON-DMS-001B-UNSUPPORTED-FILE-TYPE-RATE` | Upload failure and unsupported file type rate for Matter-scoped upload and upload-preflight paths | release_sha, tenant_class, route, standard_error_code | Operator | Sustained rate above approved launch baseline for two windows or any unexpected allow/deny mismatch | Pause traffic widening, hide `/files`, and fail closed Matter upload source flags |
| DMS-MON-002 | `MON-DMS-002A-EXTRACTION-PENDING-AGE`, `MON-DMS-002B-OCR-PENDING-AGE`, `MON-DMS-002C-EXTRACTION-FAILURE-RATE` | Extraction/OCR backlog age and failure rate | release_sha, tenant_class, extraction_status, file_type_class | Operator | Queue age or failure rate exceeds approved SLA or clusters by file type | Stop enqueue/worker paths and keep upload receipts in pending/unavailable state |
| DMS-MON-003 | `MON-DMS-003A-SEARCH-P95-LATENCY`, `MON-DMS-003B-REINDEX-QUEUE-AGE`, `MON-DMS-003C-REINDEX-FAILURE-RATE`, `MON-DMS-003D-NO-RESULT-RATE`, `MON-DMS-003E-DENIED-SEARCH-SPIKE` | Search latency, reindex queue age/failure, no-result rate, and denied-search spikes | release_sha, tenant_class, route, target_scope, standard_error_code | Security owner | P95 or queue age exceeds approved SLA, no-result spike after deploy, or denied-search pattern diverges from expected permission changes | Hide `/search` or `/search/folders`, stop reindex requests, and roll back to previous known-good API/web image |
| DMS-MON-004 | `MON-DMS-004A-PERMISSION-DENIED-SPIKE`, `MON-DMS-004B-ETHICAL-WALL-BLOCKED-SPIKE`, `MON-DMS-004C-TENANT-ISOLATION-ERROR` | Permission denied, ethical wall blocked, and tenant isolation signals | release_sha, tenant_class, route, standard_error_code, policy_surface | Security owner | Any tenant isolation error, unexpected allow, or deny spike inconsistent with release notes | Stop rollout, hide affected routes, and preserve audit refs for incident review |
| DMS-MON-005 | `MON-DMS-005A-AI-PREP-PENDING-AGE`, `MON-DMS-005B-AI-PREP-FAILED-RATE`, `MON-DMS-005C-AI-PREP-REJECTED-RATE`, `MON-DMS-005D-AI-SCOPE-VIOLATION` | AI prep queue pending, failed, rejected, stale counts limited to file organization prep | release_sha, tenant_class, artifact_kind, reason_code | Legal-data owner | Queue health fails or any legal-analysis, summary, external model, raw prompt/source/model-output signal appears | Disable `AI_PREP_ENABLED`, `AI_PREP_QUEUE_WORKER_ENABLED`, `LOCAL_GEMMA_ENABLED`, and keep `AI_SUMMARY_GEMMA_ENABLED=false` |
| DMS-MON-006 | `MON-DMS-006A-AUDIT-WRITE-FAILURE`, `MON-DMS-006B-AUDIT-LATENCY` | Audit write failures and audit latency for document, search, records, permissions, Outlook, and AI prep actions | release_sha, tenant_class, audit_action, target_type | Security owner | Any audit write failure for a required audited action | Roll back or forward-fix before accepting further DMS actions |
| DMS-MON-007 | `MON-DMS-007A-STORAGE-WRITE-FAILURE`, `MON-DMS-007B-STORAGE-READ-FAILURE`, `MON-DMS-007C-DUPLICATE-HASH-SPIKE`, `MON-DMS-007D-INTEGRITY-MISMATCH` | Storage write/read failures, duplicate hash spikes, and integrity mismatch signals | release_sha, tenant_class, storage_operation, file_type_class | Security owner | Immutable original, version, tenant prefix, or hash integrity invariant fails | Stop upload/version paths and preserve storage/audit refs without hard delete |
| DMS-MON-008 | `MON-DMS-008A-MATTER-SOURCE-HEALTH`, `MON-DMS-008B-OUTLOOK-GATE-FAILURE`, `MON-DMS-008C-OFFICE-ONEDRIVE-CLAIM-GATE` | Matter source health, Outlook filing gate failures, and future Office/OneDrive integration claim gate failures | release_sha, tenant_class, integration_surface, gate_reason | Operator | Matter source becomes stale/unavailable, Outlook claim appears without filing evidence, or Office/OneDrive connected/edit/sync claim appears before ADR-017 approval | Disable integration route exposure and Matter source upload-authoritative flags |

## Required External Evidence Review

Before DMS-UX-812 can move from `HOLD` to `PASS`, the release owner must attach
reference-only evidence for every `MON-DMS-*` query ref above. Each evidence ref
must prove the query exists, is scoped to the approved tenant class or
aggregate-safe view, names the owner, and has an alert or review threshold tied
to the rollback trigger.

Missing query refs are not a code failure, but they are a release blocker.
