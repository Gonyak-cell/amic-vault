# PACK-OSS00A-02 — authority and product-facing source map

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721`.  This translates
`PROPOSED-PACK-OSS00A-02` without changing frozen `docs/package/**`.

## Scope and invariants

- AMIC Vault retains Matter-centric permission, ethical-wall, audit, tenant,
  immutable-original, and fail-closed authority.  An OSS row is research or a
  conditional component decision, never a wholesale DMS replacement.
- Exact source/test/fixture paths refer only to an external, detached,
  clean source-lab clone with an official remote, commit/tree and license hash.
  A path must be verified before it can be proposed for reuse.
- Source code, test source, fixtures, binaries, screenshots, and generated
  artifacts are not copied to the product tree in this PACK.  A behavioral
  scenario may be independently specified without copying upstream expression.
- Missing source pin, license, path/blob, baseline, owner, permission/audit
  parity, or product target is `BLOCKED`/`REJECTED`; it is never silently
  promoted into a candidate.

## TUW inventory

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSSADOPT-AUTH-TUW-001` | H | PACK-OSS00A-01 | map Vault authority and product gaps |
| 2 | `DEVOPS-OSSADOPT-SOURCEMAP-TUW-002` | H | AUTH-001 | bind DMS/pipeline/security/identity source and test inputs |
| 3 | `DEVOPS-OSSADOPT-REUSE-TUW-003` | H | SOURCEMAP-002 | classify test/fixture reuse and parity skeletons |

## `DEVOPS-OSSADOPT-AUTH-TUW-001`

- **Files create:** `docs/architecture/oss-adoption-decisions/vault-authority-map.md`.
- **Files modify:** target rows in `security/oss-source-map.yml` only.
- **Files NOT-modify:** application code, migrations, product tests, upstream
  source, dependencies/locks, Dockerfiles, `.github/**`, `docs/package/**`.
- **Implementation:** trace the real permission/audit/tenant/document/storage/
  search/records/identity/ingestion entry and persistence paths.  Mark each
  file/test `KEEP`, `AUGMENT`, `REPLACE_CANDIDATE`, `GAP`, or `UNKNOWN`, with
  a product target and owner.  PermissionService/RLS/AuditService/immutable
  FileObject/PG FTS/pg-boss/S3 adapter remain explicitly `KEEP`.
- **Verification:** every OSS-01 through OSS-11 portfolio has a target row;
  every proposed create target is reuse-first classified; stale/nonexistent
  local paths are zero; wholesale DMS replacement is explicitly absent.

## `DEVOPS-OSSADOPT-SOURCEMAP-TUW-002`

- **Files create:** source-map sections in the relevant component adoption
  decision documents under `docs/architecture/oss-adoption-decisions/`.
- **Files modify:** source/test/fixture target rows in
  `security/oss-source-map.yml` only.
- **Files NOT-modify:** upstream source, product source, copied fixtures,
  dependencies/locks, Dockerfiles, `docs/package/**`.
- **Implementation:** for Paperless, Mayan, Alfresco, Docspell, Teedy,
  ClamAV, Gotenberg, tusd, and blocked Tika/OCRmyPDF/openid-client/Keycloak/
  Presidio/SPIRE rows, record exact relative paths and blob hashes for public
  entry, persistence/state, retry/idempotency, permission/auth, audit/log,
  parser/network, error/remediation and unit/integration/negative/fault paths.
  Link each to an OSS-03 through OSS-08 acceptance target, expected reuse
  type, and prohibited Vault authority.
- **Verification:** cloned path/blob existence is proven; a L1-L4 row without
  a test path fails; each OSS-03 through OSS-08 portfolio has a verified input
  or explicit L0/no-candidate record; root-only paths and unlicensed fixture
  copy are zero.

## `DEVOPS-OSSADOPT-REUSE-TUW-003`

- **Files create:** `security/oss-test-reuse.yml`,
  `tools/oss/verify-test-reuse.mjs`, and
  `tools/oss/verify-test-reuse.spec.mjs`.
- **Files modify:** component decision documents and source-map references
  only.
- **Files NOT-modify:** product integration fixtures, upstream copied fixture,
  new top-level integration suites, application code, dependencies/locks,
  `docs/package/**`.
- **Implementation:** classify each candidate as `UNCHANGED_BASELINE`,
  `APPROVED_PORT`, `FIXTURE_REUSE`, `BEHAVIORAL_SCENARIO`, or `REJECTED`.
  A copied fixture needs a L2 decision, exact provenance/license/hash, and
  target rollback.  Behavioral scenarios carry no copied wording or code.
  Create a product parity skeleton that names the canonical existing suite and
  preserves permission/audit negative or fault assertions.
- **Verification:** malformed/missing-license/wrong-hash rows fail; each
  security-critical downstream portfolio has at least one negative/fault
  scenario; canonical suite targets validate; copied-source misclassification
  fails closed.

## Completion boundary

This PACK produces source-aware decision and parity evidence.  It does not
adopt, vendor, fork, install, deploy, or license-approve upstream code, and it
does not alter Vault runtime authority.
