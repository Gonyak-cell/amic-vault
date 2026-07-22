# PACK-OSS02-01 — Audited preview session

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721`. This is the canonical form of
`PROPOSED-PACK-OSS02-01`, based on merged `origin/main`
`c25bb0b2713b5a7da51fd4aa9cdbb1bdf6366790`. Its only serial prerequisite is
the merged `DEVOPS-OSS01-QUE-TUW-004` runtime-authority Gate. It is independent
of the blocked OSS03 storage-versioning, OSS04 scanner, OSS07 identity and
OSS09 telemetry-sink decisions.

## Scope and invariants

- Vault remains the authority for TenantContext, PermissionService, ethical
  walls, document/version selection, immutable originals, storage access and
  audit. A preview session never grants or widens a permission.
- A session is one-purpose, tenant/user/document/current-version bound,
  opaque and valid for at most five minutes. Only a SHA-256 token hash is
  stored. Raw token, filename, storage URI/key, range, body and audit text are
  never persisted or logged.
- Session creation and its exactly-one `DOCUMENT_VIEWED` audit event are one
  tenant transaction. Audit failure leaves neither session nor token response.
  A valid issued session is required before a full or range byte is opened.
- The existing direct preview GET is no longer a public sessionless route. A
  failure response is the existing safe denied response and reveals no title,
  hash, length, version, storage or session-existence signal.
- The controlled web caller uses an in-memory token and request headers only.
  It may assemble bounded client-side range responses into an object URL for
  the existing same-page viewer; it must not put the token in a URL, rendered
  HTML, local/session storage, telemetry, service-worker cache or a new
  third-party viewer. Search result preview links must navigate to that
  controlled caller instead of retaining a sessionless direct API URL.
- No dependency, upstream source/fixture copy, external service, deployment,
  storage-path change, permission evaluator change, audit schema/mutability
  change, `docs/package/**` change or UI redesign is authorized.

## TUW order

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS02-PRV-TUW-001` | H | `DEVOPS-OSS01-QUE-TUW-004` | tenant-RLS hashed preview-session schema and shared DTO |
| 2 | `DEVOPS-OSS02-PRV-TUW-002` | H | PRV-001 | atomic permission-gated issue and `DOCUMENT_VIEWED` audit |
| 3 | `DEVOPS-OSS02-PRV-TUW-003` | H | PRV-002 | session-gated full/range stream before first byte |
| 4 | `DEVOPS-OSS02-PRV-TUW-004` | M | PRV-003 | in-memory web-session handshake and bounded range caller |
| 5 | `DEVOPS-OSS02-PRV-TUW-005` | H | PRV-001~004 | real API/DB/MinIO permission, audit and leakage Gate |

## `DEVOPS-OSS02-PRV-TUW-001`

- **Files create:** `db/migrations/0200_create_preview_access_sessions.sql`,
  `packages/shared/src/dto/document/preview-session.dto.ts` and its spec.
- **Files modify:** `packages/shared/src/index.ts`, canonical backlog/PACK,
  the explicit L0 no-copy path declarations in
  `security/oss-adoption-decisions.yml`, and append-only ledger records only.
- **Files NOT-modify:** existing document/file immutability, PermissionService
  evaluator, `audit_events` schema or mutability, storage paths and packages.
- **Verification (AND):** DTO allow/deny tests; migration up/down/up; RLS and
  FORCE checks; cross-tenant direct-SQL denial; static raw-token-column/name
  scan; existing immutable-file/audit regressions.

## `DEVOPS-OSS02-PRV-TUW-002`

- **Files create:** `apps/api/src/modules/preview/preview-session.service.ts`
  and spec.
- **Files modify:** `preview.module.ts`, `preview.controller.ts`, shared DTO
  imports and the focused preview integration fixture only.
- **Files NOT-modify:** PermissionService evaluator, audit action meaning,
  storage read path and raw-token logging policy.
- **Verification (AND):** allow path; non-member/wall/cross-tenant/permission
  exception denials; audit-insert-fault leaves session row/token response zero;
  raw-token log/audit canary zero.

## `DEVOPS-OSS02-PRV-TUW-003`

- **Files modify:** `preview.controller.ts`, `preview.service.ts` and their
  focused specs. `storage.service.ts` changes only if a signature is proven
  necessary.
- **Files NOT-modify:** response-body buffering on the API, per-chunk audit,
  storage-key exposure or a sessionless legacy GET fallback.
- **Verification (AND):** full and 206 positives; no-session, expired,
  revoked, wrong-user, tenant/document/version/replay negatives; audit-fault
  byte count zero; invalid-Range parity; token-log canary zero.

## `DEVOPS-OSS02-PRV-TUW-004`

- **Files create:** a preview-session helper and test only if the existing API
  client cannot carry the in-memory header contract.
- **Files modify:** `apps/web/src/lib/api-client.ts` and spec,
  `apps/web/src/components/document/document-action-center.tsx` and test, and
  `apps/web/src/components/search/result-card.tsx` and test when inventory
  confirms its direct preview link.
- **Files NOT-modify:** UI redesign, token URL/query/fragment use,
  localStorage/sessionStorage, service-worker cache or third-party viewer.
- **Verification (AND):** issue-to-range flow; expiry controlled reissue; no
  infinite retry; token absent from URL/storage/rendered HTML/log mocks;
  existing document/search preview UI tests; actual rendered caller review.

## `DEVOPS-OSS02-PRV-TUW-005`

- **Files create:** `tests/integration/document-access/preview-session.spec.ts`,
  `tests/integration/audit-coverage/preview-session-audit.spec.ts` and
  `tests/integration/metadata-leakage/preview-session-token.spec.ts`.
- **Files modify:** `tests/integration/document-access/preview.spec.ts` and
  only minimum fixture helpers needed for the new contract.
- **Files NOT-modify:** canonical suite registry, skip/quarantine controls and
  unrelated preview conversion behavior.
- **Verification (AND):** focused three specs; full document-access,
  audit-coverage, metadata-leakage and cross-tenant suites; common validation;
  exact-head evidence manifest. Database audit-fault and zero-byte assertions
  must exercise the real Nest/PostgreSQL path.

## Evidence boundary

Evidence contains only exact source head, migration/schema hashes, synthetic
tenant/user/document references, bounded test output and checker hashes under
`artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS02-01/<tuw>/`. It never
contains raw session tokens, document bytes, filenames, object keys or
credentials, and it does not claim deployment, release or go-live.
