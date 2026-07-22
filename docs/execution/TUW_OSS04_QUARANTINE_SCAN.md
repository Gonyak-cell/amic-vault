# PACK-OSS04-01 — Quarantine and malware-scan authority

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721`. This is the just-in-time canonical form of
`PROPOSED-PACK-OSS04-01`; frozen `docs/package/**` remains unchanged.

## Scope and invariants

- Vault remains the authority for tenant isolation, Matter permission, ethical
  walls, audit, immutable originals, storage naming, queue ownership and every
  final promotion decision. A scanner verdict is an input, never authority.
- The only admissible scanner adoption is L1 consumption of the exact-pinned
  official ClamAV artifact. No upstream source, test fixture, protocol code or
  malware label is copied into this repository.
- Quarantine records and attempts are tenant-scoped with `FORCE ROW LEVEL
  SECURITY`; they retain references, hashes, bounded codes, engine version and
  signature timestamp only. Filename, malware label, signature text, document
  body, raw token and object-store credential are prohibited.
- States are exactly `quarantined`, `scanning`, `clean`, `infected`, `error`,
  `security_hold` and `promoted`. Missing/unknown/malformed/stale/hash-mismatch
  results are fail-closed and cannot transition to `clean` or `promoted`.
- The scanner runs on the internal compose network without a host port, object
  store mount, full-filesystem mount or object-store credential. Vault streams
  authorized bytes to it with bounded timeout/size; the scanner never chooses
  a key, bucket or URL.
- The quarantine-first path is feature-flagged default-off until the next
  promotion Gate. While disabled it does not silently claim that legacy primary
  upload is scanned; while enabled every inventoried ingress must use the same
  quarantine authority.

## Upstream and license boundary

- Source lock: official `clamav-1.4.3` tag of `Cisco-Talos/clamav-devel` at
  `d8b053865fd5995f7af98bfbcd98c9a5644bfe2b`, tree
  `94730b32d264dbc5d1550927a33ee2fb9fb6abbd`, `COPYING.txt` hash
  `sha256:0c4fd2fa9733fc9122503797648710851e4ee6d9e4969dd33fcbd8c63cd2f584`.
- Official artifact: `clamav/clamav:1.4.3` index
  `sha256:75fb5fd95fcbe1d7e6d240c369c1572b686ee2c95949d1042b5148de8eddebb4`
  for `linux/amd64`, consumed unchanged through `infra/clamav.Dockerfile`.
- Source/test map: `clamdscan/proto.c` blob
  `4c26e1695bc9142d43e4677c5aac54f2a7d24e31` and
  `unit_tests/check_clamd.c` blob
  `2f526709a7f60fe3fa825c5eb8b95b543570950b`; both remain behavioral input
  only under `NO_COPY`.
- Before TUW-002 can run, the exact official image digest, release-to-source
  mapping, license policy and supported CLI/client route must be recorded and
  verified. A mutable tag is not a pin. A sidecar boundary does not waive GPL
  obligations.

## TUW order

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS04-QRT-TUW-001` | C | `DEVOPS-OSS01-QUE-TUW-004` | establish the Vault-owned security-state, RLS and audit contract |
| 2 | `DEVOPS-OSS04-QRT-TUW-002` | C | QRT-001 and ClamAV L1 decision | prove a pinned, bounded scanner adapter |
| 3 | `DEVOPS-OSS04-QRT-TUW-003` | C | QRT-002 | make scan attempts queue-owned, idempotent and audited |
| 4 | `DEVOPS-OSS04-QRT-TUW-004` | C | QRT-003 | make enabled upload ingress quarantine-first without primary promotion |

## `DEVOPS-OSS04-QRT-TUW-001`

- **Files create:** `db/migrations/0199_create_file_security_scans.sql`,
  `packages/shared/src/file-security/file-security.types.ts`, and its spec.
- **Files modify:** `packages/shared/src/file-security` exports through the
  shared index, `packages/shared/src/audit/audit-event-types.ts` and its spec,
  migration grants/checks, and no other product behavior.
- **Files NOT-modify:** document lifecycle enum, `file_objects` immutability,
  `audit_events` mutability, storage write path, upload endpoints,
  dependencies/locks, `.github/**`, and `docs/package/**`.
- **Implementation:** create a tenant-scoped quarantine registry plus scan
  attempts. Persist only opaque quarantine reference, storage URI/reference,
  expected SHA-256, byte count, bounded state/result code, engine version,
  signature timestamp, attempt sequence and actor/reference IDs. Add only the
  security audit action declarations required for later transactions. Use
  `ENABLE/FORCE RLS`, least runtime grants and reversible migration checks.
- **Verification (AND):** migration up/down/up; RLS/FORCE and cross-tenant
  denial; illegal state/result/signature-age/hash constraints; append-only
  audit-action migration behavior; shared transition unit matrix; static scan
  proving no filename/body/malware-label/token columns; existing immutable-file
  and audit regression specs.
- **Stop:** `error` is represented as `clean`, a raw malware label/filename is
  required, `file_objects` must be mutable, or a primary document/version is
  created by this TUW.

## `DEVOPS-OSS04-QRT-TUW-002`

- **Files create:** `workers/ingestion/app/security/__init__.py`,
  `workers/ingestion/app/security/clamav_client.py`,
  `workers/ingestion/tests/test_clamav_client.py`, `infra/clamav.Dockerfile`,
  and `third_party/clamav-1.4.3-source-offer.md`.
- **Files modify:** `security/oss-adoption-decisions.yml`,
  `security/oss-source-map.yml`, `security/oss-test-reuse.yml`,
  `security/oss-provenance.yml`, `security/oss-license-policy.yml`,
  `third_party/NOTICE.md`, `infra/docker-compose.dev.yml`, worker
  configuration and `workers/ingestion/pyproject.toml`/`uv.lock` only if the
  approved supported client is indispensable.
- **Files NOT-modify:** scanner bucket mount, scanner public port, custom wire
  protocol without exact source-map approval, application permission/audit
  services, primary storage path, `docs/package/**`.
- **Implementation:** record the official artifact digest/source relation and
  license decision, then use the official supported CLI/client route to stream
  bounded bytes. Normalize only `clean`, `infected`, `error` and
  `stale_signature`; malformed/unavailable/timeout responses are `error`.
  Health exposes engine version and signature age only.
- **Verification (AND):** source-lock/artifact/license checks; clean,
  EICAR, malformed response, timeout, unavailable scanner, stale signature and
  chunk-boundary tests; no credentials/content/filename log scan; frozen lock
  and isolated sidecar configuration checks.
- **Stop:** no supported official client/CLI is available, image/source digest
  cannot be proven, or the scanner requires object-store/full-filesystem access.

### QRT-002 scope amendment — release-aligned artifact boundary

The initial development-branch source pin did not map to the official runtime
image. This amendment replaces it with the official `clamav-1.4.3` release tag
and its digest, records the GPL delivery decision/source offer, and adds the
one-line digest-pinned sidecar Dockerfile so the existing provenance checker
can inventory the actual image. The Vault adapter uses only Python's standard
library and independently implements the no-copy upstream `INSTREAM` behavior;
it does not add a Python dependency or copy protocol code. This is limited to
QRT-002: no scanner credential, bucket mount, public port, application
permission/audit service, queue, upload, primary promotion, deployment or
external data change is authorized.

### QRT-002 scope amendment — L1 path-scoped validation

The static source-map validator may distinguish an unapproved L1 candidate from
an L1 component approved only for its listed product paths. This amendment
permits the corresponding validator and regression-test change only: a blocked
L1 remains blocked, and an approved L1 must declare a non-empty explicit path
list. It authorizes no further source adoption, runtime behavior, dependency,
credential, mount, public port, queue, upload, promotion, deployment, or
external data change.

## `DEVOPS-OSS04-QRT-TUW-003`

- **Files create:** `apps/api/src/modules/file-security/file-security.module.ts`,
  `file-security.service.ts`, `file-scan-queue.service.ts`, their specs, and a
  worker scan handler only if the current ingestion service owns the adapter
  call.
- **Files modify:** `apps/api/src/app.module.ts`, the existing QueueRegistry,
  worker router/main, `StoragePathResolver` plus its spec for the
  tenant-bound quarantine read/validation variant, and source map.
- **Files NOT-modify:** document/version finalization, primary storage
  promotion, search/extraction dispatch, queue payload policy unrelated to
  scans, `docs/package/**`.
- **Implementation:** enqueue only opaque quarantine reference and expected
  hash. The worker obtains an authorized bounded stream, calls the adapter and
  returns a bounded verdict. One locked API transaction records a monotonic
  attempt/state transition and audit; duplicate jobs share the authoritative
  scan reference. Stale signature becomes `security_hold`.
- **Verification (AND):** queue/service specs; duplicate job ×10; worker
  malformed/error/timeout/hash-mismatch tests; audit failure rollback;
  API-role consumer zero, worker-role consumer one; no arbitrary storage URL or
  object key accepted.
- **Stop:** a worker chooses storage location, a `clean` transition occurs
  outside its audit transaction, or queue retry changes unrelated policy.

### QRT-003 scope amendment — authoritative quarantine read boundary

Under `USER-UMBRELLA-AUTONOMY-20260721`, QRT-003 may add only the existing
Vault `StoragePathResolver`'s tenant-bound quarantine URI parse/validation
variant and use it through `StorageService` for its bounded read. The worker
still receives neither bucket/key/URL choice nor storage credentials, and this
does not authorize a quarantine write, an ingress change, primary promotion or
any QRT-004 intake behavior. QRT-004 retains ownership of server-derived
quarantine key creation and every upload-ingress change.

### QRT-003 scope amendment — Vault-owned control provenance

QRT-003 may declare its new API queue/service/module and ingestion scan-router
files as explicit L0 no-copy control code in the existing adoption-decision
manifest. This changes no upstream source, fixture, dependency or runtime
authority; it makes the reuse-first gate prove that the queue, audit and
adapter bridge remain Vault-owned.

## `DEVOPS-OSS04-QRT-TUW-004`

- **Files create:** `apps/api/src/modules/file-security/quarantine-intake.service.ts`
  and spec.
- **Files modify:** direct upload, bulk upload, email attachment and migration
  intake call sites discovered by an ingress inventory; storage path service;
  document module; shared pending response DTO and web client only for the
  pending-intake contract; source map.
- **Files NOT-modify:** primary document/version finalization, legacy path
  removal before the promotion Gate, client-controlled key/bucket/tenant,
  external sharing, `docs/package/**`.
- **Implementation:** permission/preflight/file validation precedes a
  server-derived quarantine key, stream write, hash, registry creation,
  enqueue and audit. Return `202` with an opaque pending reference. Guard the
  route behind a default-off feature flag and add a source checker that fails
  if an enabled ingress bypasses quarantine.
- **Verification (AND):** direct/bulk/email/migration positive paths;
  non-member/wall/cross-tenant/quota/hash negatives; DB/enqueue/audit failure
  compensation; enabled primary-prefix write count zero; ingress inventory
  checker; no client metadata controls bucket/key/tenant.
- **Stop:** any enabled ingress can bypass quarantine or unscanned bytes reach
  document/version/search/preview/AI/external surfaces.

## Evidence boundary

Each TUW records source SHA/tree, source/artifact/license decision, exact file
inventory, focused/negative/audit commands and synthetic-only evidence at
`artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS04-01/<tuw>/`. Local pass
does not claim CI, merge, deployment, release, or go-live.
