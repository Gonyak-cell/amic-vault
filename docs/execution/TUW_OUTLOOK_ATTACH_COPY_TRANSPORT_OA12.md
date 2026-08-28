# PACK-OA-12 AMIC OS Exact Copy Transport TUW Contract

Status: active implementation contract.

Branch: `codex/outlook-attach-copy-transport`

Pinned baseline: `5a04cc31f7c8a228982012b2213f78e6f07dc9ac`

Source goal: AMIC OS single-install Vault integration dated 2026-08-28.

## 0. Product Outcome

An AMIC OS installation can save an exact Vault document version locally or
attach it to an Outlook draft without a separately installed Vault desktop
application. Vault remains the only authority for identity mapping, exact
document/version/file bytes, PermissionService, Ethical Wall, Records, DLP,
immutable storage, and audit.

PACK-OA-12 opens only the reviewed server-side copy/transport gate named as a
stop condition in PACK-OA-08. It does not enable OA08 `attach-copy` directly,
public/external sharing, local upload, email filing, production credentials,
Microsoft 365 deployment, or package rollout.

## 1. Fixed Boundaries

- `docs/package/**` is read-only.
- Database migration count is zero unless the existing authorization ledger
  fails an invariant and a new PACK/migration is registered before continuing.
- `AMIC_OS_VAULT_PROVIDER_ENABLED=false` by default.
- Workload credentials stay in Vault and LawOS server processes; browser,
  renderer, preload return values, Office.js, logs, audit, and evidence never
  receive them.
- LawOS `principal.user_id` is an account-ledger identifier, not a Vault UUID.
  It must resolve through one active `user_login_identities` row.
- LawOS `principal.tenant_id` is correlation context, not Vault tenant
  authority. The identity mapping supplies the Vault tenant.
- `lawos_matter_id` must resolve through the server-owned Matter projection to
  exactly one active Matter in that tenant.
- `requested_exact_version` is an expected tuple. Vault re-resolves all six
  fields and rejects any mismatch; no latest/current fallback is allowed.
- All successful responses use `authority_kind='amic-vault-api'` and the strict
  LawOS provider shape. Unknown or additional response fields fail the LawOS
  adapter.
- Binary bytes exist only in the Vault API response stream, LawOS server
  memory, and the trusted host adapter's immediate write/attachment call.

## 2. API Shape

All operations are POST-only and require the dedicated AMIC OS provider guard:

| Route | Purpose | Success body |
|---|---|---|
| `/v1/integrations/amic-os/vault/exports/authorize` | Resolve identity, Matter, exact target, policy, and issue a short grant | strict JSON authorization |
| `/v1/integrations/amic-os/vault/exports/download` | Recheck policy, verify exact bytes, atomically consume, and return bytes once | binary with safe exact metadata headers |
| `/v1/integrations/amic-os/vault/exports/readback` | Prove consumed state, exact tuple, decisions, and audit correlation | strict JSON consumed readback |

The controller is public only with respect to the global browser session guard;
the dedicated workload guard is mandatory on every route. It resolves the
active account-ledger identity and enters `TenantContextService` before service
logic. A missing, malformed, disabled, or mismatched credential returns the same
safe denial boundary and performs no storage I/O.

## 3. Execution Order

```text
OUTLOOK-ATTACHCOPY-AUTH-TUW-001
  -> OUTLOOK-ATTACHCOPY-POLICY-TUW-001
    -> OUTLOOK-ATTACHCOPY-GRANT-TUW-001
      -> OUTLOOK-ATTACHCOPY-BYTES-TUW-001
        -> OUTLOOK-ATTACHCOPY-READBACK-TUW-001
          -> OUTLOOK-ATTACHCOPY-VERIFY-TUW-001
```

Only one TUW is active at a time. A failed security or data-integrity check stops
the PACK; it is not converted into a warning or best-effort path.

## 4. TUWs

### `OUTLOOK-ATTACHCOPY-AUTH-TUW-001` — Dedicated workload identity

Objective:

- add a default-off provider module and constant-time workload credential guard;
- resolve the asserted account-ledger id through exactly one active
  `user_login_identities`/user/tenant mapping;
- enter tenant context from that resolved mapping, never from caller tenant
  input;
- reject inactive, missing, duplicate, cross-tenant, malformed, and credential
  failure paths before provider service or storage access.

Owned files:

- `apps/api/src/modules/integrations/amic-os-vault-provider/**`
- `apps/api/src/app.module.ts`
- focused API tests under the same module.

Verification:

- disabled/missing/bad credential and missing/inactive account mapping all deny;
- timing-safe compare is exercised without logging the credential;
- a caller-supplied Vault UUID or tenant value cannot change the resolved actor;
- no shared PWA or Outlook add-in session cookie is accepted as provider auth.

### `OUTLOOK-ATTACHCOPY-POLICY-TUW-001` — Exact target and policy envelope

Objective:

- resolve `lawos_matter_id` through Matter metadata inside the resolved tenant;
- resolve exact document/version/file/promoted-object tuple;
- require `canDownloadDocument` and preserve the returned permission/Wall
  decision references;
- deny deleted/disposal-locked Matter or document, active legal hold, and active
  requested/approved disposal;
- evaluate DLP with purpose `outlook_document_insertion` and internal actor
  authorization;
- return four explicit allow decisions: permission, Ethical Wall, Records, DLP.

Owned files:

- provider exact-export service and focused tests;
- existing Permission, Records, DLP, promoted-file, and Matter projection
  services are consumed, not duplicated.

Verification:

- wrong tenant, actor, Matter projection, document, version, file object, hash,
  byte size, MIME type, deleted state, Wall, Records, and DLP all fail closed;
- permission/policy checks occur before storage reads;
- exact historical versions are supported without resolving “current”.

### `OUTLOOK-ATTACHCOPY-GRANT-TUW-001` — Short idempotent one-time grant

Objective:

- derive a stable UUID authorization key from the bounded AMIC OS operation id;
- insert or idempotently read one `preview_access_sessions` row bound to the
  resolved tenant, user, document, and version;
- store only a provider-secret-keyed HMAC of the immutable principal, Matter,
  installation, compose, operation, idempotency, and exact version binding;
  no raw capability is created, returned, or accepted by provider routes;
- cap expiry at 60 seconds;
- reject conflict, expiry, revocation, actor drift, target drift, and reused
  operation ids.

Owned files:

- provider grant repository/service and focused tests;
- no migration file.

Verification:

- retry with identical input returns the same safe grant reference;
- conflicting retry denies;
- existing RLS/FORCE RLS and user-offboarding revocation remain effective;
- the grant cannot be used on the public preview endpoint because no raw token
  is exposed.

### `OUTLOOK-ATTACHCOPY-BYTES-TUW-001` — Verified atomic byte consumption

Objective:

- lock and validate the grant and repeat all current authorization checks;
- require the promoted-file guard before storage access;
- read no more than the configured Outlook attachment ceiling;
- compute SHA-256 and byte count and compare them with the exact tuple; preserve
  the resolved MIME type and normalized attachment filename;
- lock the grant again, recheck current authority, atomically set `revoked_at`,
  and write the download audit before returning bytes;
- discard buffered bytes when another consumer wins or any check changes.

Owned files:

- provider exact-export service, controller binary response adapter, and tests.

Verification:

- oversize, truncated, extended, hash-changed, MIME drift, missing object,
  permission change, Wall change, Records change, DLP change, expiry, and
  concurrent replay return no bytes;
- exactly one concurrent consumer succeeds;
- successful bytes match document/version/file/SHA/size/MIME exactly;
- no storage URI, token, or byte value appears in JSON, logs, or audit metadata.

### `OUTLOOK-ATTACHCOPY-READBACK-TUW-001` — Consumed-state proof

Objective:

- require the same workload identity, actor mapping, operation, provider grant,
  exact tuple, and correlation identifier;
- prove `revoked_at` consumption and locate the matching append-only download
  audit reference;
- re-evaluate current permission/Wall/Records/DLP for the readback envelope;
- return only the strict LawOS `state='consumed'` JSON shape.

Owned files:

- provider exact-export service/controller and focused tests.

Verification:

- authorized-but-not-consumed, expired-only, wrong actor, wrong operation,
  wrong correlation, wrong tuple, and missing audit all fail closed;
- response has exact keys and no storage locator, filename, token, endpoint, or
  provider implementation detail.

### `OUTLOOK-ATTACHCOPY-VERIFY-TUW-001` — Integrated negative evidence

Objective:

- add controller/service/integration coverage for the complete three-call flow;
- prove tenant isolation, PermissionService, Wall, Records, DLP, promoted-file,
  audit, exact-integrity, expiry, idempotency, and replay invariants;
- prove `docs/package/**` is unchanged and no migration/dependency was added;
- record a reference-only technical receipt without claiming live deployment.

Owned files:

- focused unit and integration tests;
- this contract, API contract, threat model, PACK registry, and append-only
  ledgers.

Verification command family:

- focused provider unit tests;
- focused tenant/RLS/document-access integration tests;
- `pnpm lint`;
- `pnpm typecheck`;
- proportionate API test/build gates;
- `pnpm docs:frozen`;
- `pnpm backlog:validate`;
- `git diff --check`;
- `git diff --name-only -- docs/package` returns no path.

## 5. Response Compatibility

Authorize JSON must contain exactly:

```text
authority_kind, authority_ref, provider_revision, state,
provider_export_ref, expires_at, exact_version, attachment_name,
decisions, audit
```

Download is binary. Safe response headers carry provider identity, grant
reference, exact version references/hash/size/MIME, normalized attachment name,
and audit/correlation references. The LawOS server adapter reconstructs its
strict in-memory provider response; these headers are never forwarded to an
Office.js renderer response.

Readback JSON must contain exactly:

```text
authority_kind, authority_ref, provider_revision, state,
provider_export_ref, exact_version, decisions, audit
```

`exact_version` always contains exactly:

```text
document_id, version_id, file_object_id, sha256, byte_size, mime_type
```

Every decision contains `effect='allow'` and a bounded `decision_ref`. Audit
contains exactly `event_id` and the caller-supplied `correlation_id`.

## 6. Explicitly Deferred

- local files, email MIME, or selected Outlook attachments uploaded to Vault;
- quarantine intake, malware scan, asynchronous promotion, and upload status;
- turning OA08's normal add-in session endpoint into a byte route;
- external-recipient/public/guest/secure/VDR link creation;
- renderer or Outlook-local cache/queue;
- production endpoint/credential enablement;
- Microsoft 365 assignment, tenant consent, and live Outlook host validation;
- AMIC OS package signing, installer/repair/uninstall, and canary rollout.

Those items remain in the parent AMIC OS single-install goal and require later
PACKs and operational gates; they are not evidence of OA12 completion.

## 7. PACK Completion

PACK-OA-12 may be reported only as `technical-pass` when every TUW verification
is green on the exact branch head. It must remain explicitly non-production
until a deployed Vault provider revision, real identity/Matter binding,
workload-credential activation, AMIC OS host adapter, Outlook compose receipt,
and Vault audit readback are independently evidenced.

## 8. Local Technical Receipt — 2026-08-29

State: `technical-pass`, `non-production`, exact branch commit pending.

Implementation evidence:

- the dedicated provider guard resolves an active account-ledger identity before
  tenant context and ignores the caller tenant as authority;
- authorization resolves one LawOS Matter projection and one promoted exact
  document/version/file tuple, then reuses the existing RLS/FORCE RLS
  `preview_access_sessions` ledger for a maximum-60-second one-time grant;
- download repeats PermissionService, Ethical Wall, Records, DLP, promoted-file,
  exact tuple, SHA-256, size, MIME, and immutable request-binding checks before
  atomically consuming the grant and appending `DOCUMENT_DOWNLOADED`;
- readback proves the consumed grant, exact tuple, current policy decisions, and
  matching audit correlation without returning a storage URI or credential;
- the LawOS-side HTTP provider is default-off, server-only, no-redirect,
  bounded, strict-content-type, and independently re-hashes the returned bytes.

Verification evidence on Node 22:

- focused provider contract/guard/service/controller: 4 files, 11 tests passed;
- complete API unit suite: 216 files, 1,039 tests passed;
- AppModule integration: 2 tests passed;
- API lint, typecheck, and build passed;
- isolated full-Nest HTTP integration: 1 file, 1 test passed after applying all
  206 repository migrations to a disposable PostgreSQL 16 database;
- the integration exercised upload, promoted-file evidence, clean canonical DLP
  assessment, workload denial, authorization, binding-drift denial before byte
  access, exact binary download, consumed-state readback, replay denial, and
  append-only audit inspection;
- the successful receipt matched one `document_id`, `version_id`,
  `file_object_id`, SHA-256, MIME, and 56-byte payload across response headers,
  bytes, grant, and audit; replay returned `grant_consumed`;
- the first integration attempt correctly failed closed on missing canonical
  DLP extraction, and the second reached download but exposed an over-specific
  cache-header assertion; the final fixture records clean canonical extraction
  and accepts the stronger global `no-store, no-cache, ... private` policy;
- `docs:frozen` passed for 51 protected files, backlog validation passed for 174
  PACKs and 266 TUWs, and `git diff --check` passed;
- no migration, dependency, `docs/package/**` file, production endpoint,
  credential, tenant, object store, M365 assignment, or deployment was changed.

Isolation evidence:

- Docker, the default developer database, and configured S3 were not used;
- storage calls were replaced only inside the integration application instance
  with a byte-preserving in-memory adapter;
- pgvector 0.8.6 was checksum-verified and compiled only in the disposable test
  directory for the PostgreSQL 16 migration run;
- the temporary database, pgvector build, and port 62256 were stopped, deleted,
  and released after evidence capture.

Remaining external gates:

- commit identity and independent review;
- deployed provider revision and real account-ledger/Matter projection binding;
- production workload-secret activation through the approved secret channel;
- AMIC OS signed package and trusted host adapter;
- real Classic Outlook and Office.js compose positive/negative receipts;
- M365 cohort assignment, canary, rollback, and Vault audit readback.

These gates prohibit a deployment, release, or go-live claim from this local
receipt.
