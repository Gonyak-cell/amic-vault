# PACK-OSS05-01 — Bounded ingestion identity and storage contract

Status: canonical under `USER-UMBRELLA-AUTONOMY-20260721`, based on merged
`PACK-OSS04-02` at `origin/main` `33944bca70a637dfffd8c3f433f2faea5cdb6663`.

## Invariants

- The API, never a caller, derives the storage alias, object key, object
  version, expected hash and expected size from a promoted Vault file object.
  An ingestion request contains no URL, host, IP address, endpoint, bucket,
  credential or other network destination selector.
- A worker is not trusted because a body says `tenant_id`. Before byte access,
  a later TUW must bind an approved workload identity, audience, expiry and
  replay-resistant nonce to the envelope. Until then, no dispatch path changes.
- Parser, storage and conversion failures are bounded and fail closed. They do
  not release unpromoted bytes, alter a Vault original, bypass Matter/ethical
  wall permission, or suppress the existing audit ordering.
- Source studies of Paperless-ngx and Mayan EDMS remain L0 behavioral evidence.
  No upstream source, test fixture, data, dependency or service is copied.
- No deployment, external operation, public worker route, endpoint change,
  source vendoring, new package, lock change or `docs/package/**` mutation is
  permitted unless a later TUW explicitly records it.

## Ordered TUWs

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS05-ING-TUW-001` | C | PRM-004 | define the closed cross-language envelope without changing dispatch |
| 2 | `DEVOPS-OSS05-ING-TUW-002` | C | ING-001 + platform identity decision | bind approved workload identity, expiry and replay protection |
| 3 | `DEVOPS-OSS05-ING-TUW-003` | C | ING-001~002 | replace dispatcher signed-read URL use with the server-derived envelope |
| 4 | `DEVOPS-OSS05-ING-TUW-004` | C | ING-003 | use a fixed worker storage profile and verify tenant prefix/version/hash/size |

## `DEVOPS-OSS05-ING-TUW-001` — cross-language bounded envelope

- **Files create:** `packages/shared/src/ingestion/ingestion-job.ts` and its
  direct spec; `workers/ingestion/app/contracts.py`;
  `workers/ingestion/tests/test_contracts.py`; a synthetic shared golden corpus
  under `tests/fixtures/documents/`.
- **Files modify:** `packages/shared/src/index.ts` only to export the contract;
  `security/oss-adoption-decisions.yml` only to declare these independently
  written L0 files for the reuse-first gate.
- **Files NOT-modify:** extraction dispatcher/runtime routes, parser code,
  storage endpoint configuration, deployment, dependencies/locks,
  `docs/package/**`.
- **Contract:** accept only `tenantId`, `documentId`, `versionId`,
  `fileObjectId`, `storageAlias`, `objectKey`, `objectVersion`, `sha256`,
  `sizeBytes`, `parserProfile`, `requestId` and `expiresAt`. IDs use a single
  canonical UUID representation; hash is lower-case SHA-256; size is a safe
  positive bounded integer; expiry is an ISO instant in the bounded future;
  parser profile and storage alias are closed allowlists. Object key/version
  are opaque bounded identifiers, reject NUL, traversal and URI-scheme forms,
  and never denote a host or endpoint. The model rejects every unknown field
  with only `VALIDATION_FAILED` exposed to its caller.
- **Implementation:** TS Zod and Python Pydantic strict models consume the same
  JSON corpus with exact normalized accept/reject outcomes. The corpus contains
  no customer data. Direct test assertions prove every invalid value yields the
  canonical error code, so validator drift fails either language suite.
- **Verification (AND):** shared corpus parity; URL/host/private-IP/extra-field/
  expired/oversize/bad-hash/traversal/unknown-profile negatives; fixture hash
  inventory; shared package and Python worker tests.
- **Stop:** stop if TS/Python acceptance cannot be made equivalent or a
  host/URL-style field must remain in the contract.

## `DEVOPS-OSS05-ING-TUW-002` — workload identity, nonce and replay profile

- **Files create:** worker identity interface/adapters and direct specs in the
  extraction module; `workers/ingestion/app/service_identity.py` and tests.
- **Files modify:** selected-profile env/example and deployment configuration
  only after the platform identity decision is recorded.
- **Files NOT-modify:** custom unapproved crypto, production static shared
  secret, public worker route, parser/storage behavior, dependencies/locks,
  `docs/package/**`.
- **Implementation:** only approved mTLS/SPIFFE or a topology-proven
  non-spoofable gateway identity may bind stable workload subject, audience
  `amic-vault-ingestion`, short expiry and one-use nonce. A dev loopback profile
  refuses production boot. Keys, certificates and tokens are never logged.
- **Verification (AND):** valid identity; wrong subject/audience; expired,
  replay, rotation, spoofed-header/direct-port and production-dev-profile
  negatives.
- **Stop:** no platform/network peer-identity enforcement, or any need to use a
  dev shared secret in production, leaves this TUW blocked.

## `DEVOPS-OSS05-ING-TUW-003` — dispatcher envelope with no signed URL

- **Files create:** optional `ingestion-request.factory.ts` and direct spec
  only if existing resolver helpers cannot express the contract.
- **Files modify:** extraction dispatcher/types/spec and document-module wiring;
  existing storage path resolver only when needed to derive the canonical ref.
- **Files NOT-modify:** request-selected worker endpoint; response body limit
  relaxation; downstream search/audit ordering; dependencies/locks;
  `docs/package/**`.
- **Implementation:** after promoted-state assertion and target lookup, derive
  alias/key/version/hash/size through the existing resolver, add authenticated
  identity/nonce/expiry metadata, use bounded timeout and bounded response
  parsing, and remove extraction use of `createReadUrlByStorageUri`.
- **Verification (AND):** payload snapshots contain no `storage_url`/credential;
  server-derived key; identity/expiry/nonce; timeout, response oversize,
  malformed worker response and promoted-guard negatives.
- **Stop:** missing legacy object metadata requires a distinct backfill/adapter
  TUW before dispatch changes.

## `DEVOPS-OSS05-ING-TUW-004` — fixed worker storage adapter

- **Files create:** `workers/ingestion/app/storage_client.py` and direct tests.
- **Files modify:** extract/ocr/convert routers and direct tests;
  `pyproject.toml`/`uv.lock` only for a separately approved official S3 client.
- **Files NOT-modify:** arbitrary URL fetch, request-selected endpoint/bucket,
  bucket-wide write/delete, dependencies/locks absent a component decision,
  `docs/package/**`.
- **Implementation:** endpoint/bucket/profile are fixed at boot. Parse the
  envelope as a tenant/alias canonical prefix, reject traversal and encoded
  separators, and verify exact version/size/hash during read. Credentials are
  read-only except an independently authorized derivative writer.
- **Verification (AND):** correct read; wrong tenant/prefix/version/hash/size;
  traversal/encoded path/endpoint injection; 403/404/timeout and credential
  rotation negatives.
- **Stop:** lack of least-privilege prefix/version access, or any arbitrary
  network requirement, blocks the TUW.

## Evidence boundary

Store only synthetic envelope cases, validator outcomes, fixture hashes,
identity/replay results, dispatcher snapshots and storage-isolation summaries
under `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS05-01/<tuw>/`. A local
pass does not claim CI, merge, deployment, release or go-live.
