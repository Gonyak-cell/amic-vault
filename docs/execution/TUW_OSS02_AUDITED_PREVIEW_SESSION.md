# PACK-OSS02-01 — Audited preview session

Status: canonical post-R14 extension under `USER-UMBRELLA-AUTONOMY-20260721`.
This is the just-in-time canonical form of `PROPOSED-PACK-OSS02-01`, based on
merged `PACK-OSS01-04` at `origin/main`
`95580b5ca5a32b31b5d2dd14ea34a03633f88f98`. Frozen `docs/package/**` remains
unchanged.

## Scope and invariants

- Preview access is tenant, authenticated user, document, and current document
  version bound. A session expires in five minutes or less, stores only a
  cryptographic token hash, and can be revoked. It is not a share link or an
  external capability.
- `PermissionService` remains the sole permission authority. The permission
  evaluator, ethical-wall semantics, document/file immutability, storage
  authorization, and audit action meaning are not changed.
- One successful session issue creates exactly one `DOCUMENT_VIEWED` audit in
  the same tenant transaction. If that audit cannot commit, no session row or
  raw token may escape; stream access requires that committed session.
- Full (`200`) and range (`206`) preview calls use a header-only raw-token
  reference. Tokens are absent from URLs, query strings, fragments, filenames,
  response metadata, logs, audit metadata, localStorage, sessionStorage,
  service-worker cache, rendered HTML, and telemetry.
- A failed authorization, revoked/expired/mismatched session, or audit fault
  returns the existing safe denied shape before any storage read/stream byte,
  length, hash, title, or storage key is exposed. Large bodies remain streamed;
  no full-body buffering or per-chunk audit is permitted.
- This is L0 Vault-owned no-copy work. Reuse existing PreviewService,
  AuditService, PermissionService, TenantContextService, DatabaseService,
  storage APIs, web API client, and test patterns. New product files must be
  listed in `security/oss-adoption-decisions.yml` before reuse-first is green;
  no upstream source, fixture, dependency, vendor tree, or fork is allowed.
- No UI redesign, external viewer, external sharing, deployment, cloud change,
  or `docs/package/**` edit is within scope.

## TUW order

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS02-PRV-TUW-001` | H | QUE-004 | add RLS preview-session persistence and shared DTO contract |
| 2 | `DEVOPS-OSS02-PRV-TUW-002` | H | PRV-001 | issue a session and audit atomically |
| 3 | `DEVOPS-OSS02-PRV-TUW-003` | H | PRV-002 | gate every full/range stream before first byte |
| 4 | `DEVOPS-OSS02-PRV-TUW-004` | M | PRV-003 | migrate all identified web callers to the in-memory handshake |
| 5 | `DEVOPS-OSS02-PRV-TUW-005` | H | PRV-001~004 | prove the contract against real Nest/PostgreSQL/MinIO paths |

## `DEVOPS-OSS02-PRV-TUW-001`

- **Files create:** `db/migrations/0198_create_preview_access_sessions.sql`,
  `packages/shared/src/dto/document/preview-session.dto.ts`, and its spec.
- **Files modify:** `packages/shared/src/index.ts` and
  `security/oss-adoption-decisions.yml` only to declare the new Vault-owned
  L0 no-copy paths.
- **Files NOT-modify:** existing document/file immutability schema or code;
  permission evaluator/model; audit table/schema/append-only protection;
  any dependency/lock, workflow, `docs/package/**`, or path not named above.
- **Implementation:** create a reversible migration with the next verified
  number (`0198`). The table contains only `tenant_id`, `user_id`,
  `document_id`, `version_id`, `token_hash`, `expires_at`, `revoked_at`, and
  `created_at`, plus identifiers/indexes needed for bounded lookup. It enables
  and forces RLS with the standard tenant predicate; raw token, range, title,
  filename, storage URI, content hash, and body columns are prohibited. The
  shared strict schemas specify only issue input and one-time issue response;
  the response token is bounded, nonempty, and cannot be accepted by any URL
  helper.
- **Verification (AND):** DTO specs; migration up/down/up; new-table RLS and
  FORCE checks; direct cross-tenant SQL deny; schema scan proving zero raw
  token/range/filename columns; and source-map/reuse-first, backlog, frozen-doc
  and diff checks relevant to the slice.
- **Stop:** migration number collision, missing tenant RLS/FORCE, need to
  store/recover a raw token, or need to alter immutable document/file or audit
  schema.

## `DEVOPS-OSS02-PRV-TUW-002`

- **Files create:** `apps/api/src/modules/preview/preview-session.service.ts`
  and `preview-session.service.spec.ts`.
- **Files modify:** `preview.module.ts`, `preview.controller.ts`, its direct
  spec if created by this TUW, shared preview-session DTO imports, and
  `security/oss-adoption-decisions.yml` only for newly created product paths.
- **Files NOT-modify:** PermissionService evaluator; audit action names or
  metadata contract; storage read path; document/version immutability;
  dependencies/locks; `docs/package/**`; any unlisted module.
- **Implementation:** add `POST /v1/documents/:documentId/preview-sessions`.
  Use authenticated session user and `TenantContextService.require()`. In one
  tenant transaction: resolve a current non-deleted document/version, call
  PermissionService, generate high-entropy raw token only in process memory,
  persist its hash with bindings and expiry, and write the existing
  `DOCUMENT_VIEWED` preview-channel audit. Return raw token exactly once only
  after commit. All denied/error paths normalize to the safe existing response;
  logs/audit metadata contain reference IDs and bounded codes only.
- **Verification (AND):** allow success; non-member, ethical-wall,
  cross-tenant, deleted, and PermissionService-throw deny; concurrent issue;
  audit-insert failure leaves token response and row count at zero; raw token
  is absent from logger/audit spies; existing preview regressions remain green.
- **Stop:** a solution bypasses PermissionService, separates audit/session
  commits, requires a raw-token lookup, or cannot make audit failure atomic.

## `DEVOPS-OSS02-PRV-TUW-003`

- **Files create:** none.
- **Files modify:** `apps/api/src/modules/preview/preview.controller.ts`,
  `preview.service.ts`, direct unit specs, and `storage.service.ts` only if a
  signature change is strictly necessary for an already-authorized stream.
- **Files NOT-modify:** body buffering strategy; storage key response shape;
  per-chunk audit behavior; PermissionService evaluator; dependencies/locks;
  `docs/package/**`; any unrelated conversion/queue policy.
- **Implementation:** require a named header-only preview-session token on all
  full and range reads. Validate its hash, tenant/user/document/current-version
  bindings, expiry, and revocation before invoking either storage getter. The
  legacy unaudited GET path denies. Existing range parsing and invalid-range
  behavior stay compatible after authorization. Do not emit a second audit for
  chunks: the successful issue transaction is the sole `DOCUMENT_VIEWED`
  evidence.
- **Verification (AND):** positive `200` and `206`; no-session, expired,
  revoked, wrong user/tenant/document/version, replay, permission exception,
  and legacy-direct GET negatives; fault-injected audit/session validation
  failure proves zero bytes and zero storage-read call; invalid/suffix/multiple
  range parity; response/log metadata has no token, length/hash/title/storage
  clue on denial.
- **Stop:** a browser/viewer requires raw token in URL/query/fragment, a
  legacy unaudited route must remain, first-byte ordering cannot be proven, or
  storage authorization must be weakened.

## `DEVOPS-OSS02-PRV-TUW-004`

- **Files create:** `apps/web/src/lib/preview-session.ts` and direct test only
  if the existing API client cannot express a bounded in-memory handshake.
- **Files modify:** `apps/web/src/lib/api-client.ts` and spec;
  `apps/web/src/components/document/document-action-center.tsx` and test;
  `apps/web/src/components/search/result-card.tsx` and test; and only direct
  preview caller/PWA cache-policy files found by the verified caller inventory.
- **Files NOT-modify:** visual redesign, localStorage/sessionStorage token or
  byte persistence, service-worker preview cache, third-party viewer, external
  share capability, unrelated UI/copy, dependencies/locks, `docs/package/**`.
- **Implementation:** replace every identified direct preview URL caller with:
  issue session; retain token only in closure/component memory; request preview
  bytes with the header; create/revoke an in-memory object URL as needed; on
  one normalized expiry denial reissue once, otherwise show a safe generic
  error. Close/unmount releases object URLs. Search-result open must use the
  same controlled caller rather than an anchor to legacy preview. Preview
  issue/bytes responses are `no-store` and absent from PWA cache routing.
- **Verification (AND):** client/component tests prove issue-to-header stream,
  one and only one expiry reissue, no infinite retry, safe errors, object-URL
  cleanup, and token absence from URL/storage/rendered HTML/logger/telemetry
  mocks; existing preview UI tests pass; a verified caller inventory has zero
  remaining raw preview endpoint navigation.
- **Stop:** third-party viewer cannot carry request headers and no existing
  same-origin in-memory alternative satisfies the contract; do not introduce a
  proxy or persistence layer without a separately canonical TUW.

## `DEVOPS-OSS02-PRV-TUW-005`

- **Files create:**
  `tests/integration/document-access/preview-session.spec.ts`,
  `tests/integration/audit-coverage/preview-session-audit.spec.ts`, and
  `tests/integration/metadata-leakage/preview-session-token.spec.ts`.
- **Files modify:** `tests/integration/document-access/preview.spec.ts` only
  to migrate legacy expectations; minimal existing fixtures/helpers only when
  essential to construct deterministic tenant/user/document/version cases.
- **Files NOT-modify:** canonical suite registry, skip/quarantine config,
  unrelated preview conversion, production/deployment config, dependencies,
  `docs/package/**`.
- **Implementation:** execute real Nest/PostgreSQL/MinIO issue/full/range
  flows for deterministic tenants and versions. Inject audit/session and
  storage faults; prove audit failure precedes any byte, and prove revoke,
  expiry, user/tenant/document/version mismatch, replay, and direct legacy
  requests do not leak existence or metadata. Retain synthetic-only fixtures
  and exact-head evidence under the established enterprise-OSS artifact root.
- **Verification (AND):** three focused specs; full document-access,
  audit-coverage, metadata-leakage, cross-tenant, fail-closed, and existing
  preview suites; common lint/typecheck/test/build/backlog/frozen-doc checks;
  disposable compose migration up/rollback/up, seed, and complete integration
  suite; reuse-first/source-map/diff checks.
- **Stop:** actual DB audit fault cannot be exercised, byte-zero assertion is
  impossible, test weakening/skip is required, or an unauthorized path exposes
  token or protected preview metadata.

## Evidence boundary

Each TUW records exact source SHA/tree, L0 no-copy decision, migration/RLS
receipt where applicable, permission-negative matrix, audit rollback/zero-byte
result, token-leak scan, and synthetic-only evidence under
`artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS02-01/<tuw>/`. A local pass
does not claim CI, push, PR, merge, deployment, release, or go-live.
