# PACK-OSS00-02 Dependency and Python Hardening TUW Contract

**Status:** canonical live extension under `USER-UMBRELLA-AUTONOMY-20260721`

**Release:** post-R14 enterprise uplift (registered as `R14` only for existing
live-backlog uniqueness, DAG, and release-ban validation)

**Branch:** `feat/pack-oss00-02-dependency-python-hardening`

**Planning baseline:** `origin/main` at
`91ac55a59b538cb57ecacecea4e69c92dc7c4cfd`; implementation evidence must bind
the actual source SHA/tree at each atomic commit.

**Authority:** [OSS Terra 자율 순차 실행 권한](./OSS_TERRA_AUTONOMOUS_EXECUTION_AUTHORITY.md).
It removes per-PACK/TUW human approval waits. The package, version, or uv-tool
changes explicitly scoped by this contract may proceed only after source-pin,
license-policy, compatibility, and negative-test evidence; deployment, external
mutation, CI/PR, push, merge, and release remain unauthorized.
`docs/package/**` remains frozen.

## Common execution contract

- Execute the three TUWs in dependency order. A successor requires its
  predecessor's atomic commit, focused checks, and exact-head evidence; no
  merge wait is required for local sequential work.
- Preserve `permission-before-*`, fail-closed validation, immutable originals,
  audit-by-default, and no-sensitive-data-in-evidence. No step may weaken upload
  permission, storage isolation, audit semantics, or file-size policy.
- A raw upstream advisory response, registry URL, signed URL, secret, customer
  path, or document contents must not enter a committed report. Store only
  normalized advisory IDs, opaque hashes, package/version data, and source refs.
- A package/version change is permitted only when this contract explicitly names
  its component and files and the exact source pin, license policy, lockfile,
  compatibility, and negative-test checks are recorded. An unplanned override
  or unrelated upgrade remains a hard stop; do not silently change a manifest
  or lockfile merely to make a report green.

## TUW inventory

| Order | ID | Title | Risk | Size | Depends on |
|---:|---|---|---|---|---|
| 1 | `DEVOPS-OSSDEP-TRIAGE-TUW-001` | Current dependency advisory triage | H | M | `DEVOPS-OSSGOV-PROV-TUW-004` |
| 2 | `SEC-UPLOAD-MULTIPART-TUW-001` | Multer/upload parser security regression | H | L | `DEVOPS-OSSDEP-TRIAGE-TUW-001` |
| 3 | `DEVOPS-OSSPY-LOCK-TUW-001` | Python uv lock and frozen CI | H | M | `DEVOPS-OSSDEP-TRIAGE-TUW-001` |

## `DEVOPS-OSSDEP-TRIAGE-TUW-001` — Current dependency advisory triage

- **Release / Module / Risk / Size:** `R14` / `DEVOPS-OSSDEP-TRIAGE` / `H` /
  `M`.
- **Depends_on:** `DEVOPS-OSSGOV-PROV-TUW-004`.
- **Objective:** Recollect production advisories for the exact Node lockfile,
  classify each direct/transitive/reachable/fixable finding with source-path
  evidence, and create a bounded remediation queue without changing packages.
- **Inputs:** `pnpm-lock.yaml`, workspace manifests, `pnpm audit --prod --json`,
  and the vulnerability/VEX contract from PACK-OSS00-01.
- **Files create:**
  `docs/architecture/oss-adoption-decisions/dependency-advisory-baseline.md`.
- **Files modify:** `security/oss-vulnerability-exceptions.yml` for an already
  approved row only; `security/oss-provenance.yml` audit hash only.
- **Files NOT-modify:** package manifests, lockfiles, application source,
  `docs/package/**`, CI/workflow configuration, deployment configuration, and
  external state.
- **Implementation sequence:** (1) capture the exact-head audit with an opaque
  result hash; (2) normalize the unique advisory set; (3) trace import/call/
  build/runtime reachability to local source paths; (4) record fixed version,
  breaking-major risk, owner, expiry, and decision state; (5) queue a separate
  canonical remediation TUW for any fix not bounded to this PACK.
- **Verification (AND):** parser/policy checks green AND normalized report count
  equals the raw unique advisory set AND every production High/Critical finding
  has a fail-closed classification AND unclassified production High/Critical is
  zero AND `git diff -- docs/package` is empty.
- **Done:** a hash-bound decision report and bounded remediation queue exist;
  no unsupported `not_affected` conclusion or lockfile change is made.
- **Edge cases:** registry outage, no-fix advisory, optional dependency,
  platform-specific binary, withdrawn/duplicate advisory.
- **Stop / escalation:** raw audit cannot be reproduced, reachability lacks
  source evidence, or a VEX decision would need a fabricated/expired owner.
- **Evidence target:**
  `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS00-02/DEVOPS-OSSDEP-TRIAGE-TUW-001/`
  with redacted audit, normalized triage JSON, source-map refs, and report hash.

## `SEC-UPLOAD-MULTIPART-TUW-001` — Multer/upload parser security regression

- **Release / Module /Risk / Size:** `R14` / `SEC-UPLOAD-MULTIPART` / `H` /
  `L`.
- **Depends_on:** `DEVOPS-OSSDEP-TRIAGE-TUW-001`.
- **Objective:** Prove the resolved Multer/Nest multipart line rejects malformed
  and resource-exhausting input while preserving authorized normal upload and
  audit/storage cleanup behavior.
- **Inputs:** dependency-triage decision,
  `apps/api/src/modules/document/multipart.config.ts`, document upload tests,
  exact resolved `multer@2.0.2` source/test pin.
- **Files create:** none; the closest existing configuration and document-upload
  integration tests host the regression.
- **Files modify:** `apps/api/src/modules/document/multipart.config.ts` for
  bounded limits only; `apps/api/src/modules/document/multipart.config.spec.ts`
  for the static limit contract; `tests/integration/upload.spec.ts` for a
  synthetic malformed-shape/no-artifact regression; `apps/api/package.json`,
  root manifest, and `pnpm-lock.yaml` only for an exact compatible patched
  Multer line whose source pin, license, and regression evidence are recorded.
  The root manifest is limited to the one `multer: 2.2.0` override required
  because the active Nest platform package pins its transitive Multer version
  exactly; unrelated overrides are forbidden. The existing global exception
  filter and its spec may change only to map the verified Multer parser-limit
  code set to the existing safe HTTP 400 `VALIDATION_FAILED` response without
  logging a parser error payload; no other error semantics may change.
- **Files NOT-modify:** PermissionService, storage authority, upload audit
  semantics, file-size policy relaxation, `docs/package/**`, deployment
  configuration, and external state.
- **Implementation sequence:** (1) compare the pinned resolved source/tests to
  current behavior; (2) add aggregate-part/field-count and malformed-stream
  negative cases; (3) reuse existing limits/helper first; (4) record that the
  installed `busboy@1.6.0` source fixes multipart header parsing to internal
  constants and does not read the documented `limits.headerPairs` input, so no
  header-pair mitigation is claimed without a compatible patched dependency
  line; (5) if a version change is required, preserve the red test/evidence and
  continue only after its exact source pin and compatibility are verified. (6)
  if the Nest platform package pins Multer exactly, use only the named root
  package-manager override and prove the resolved interceptor dependency changed.
  (7) Map only the verified Multer parser-limit codes to the existing safe
  `VALIDATION_FAILED` Bad Request response, with a direct filter regression.
- **Verification (AND):** focused multipart tests AND
  `tests/integration/document-access/upload-permission.spec.ts` AND
  `tests/integration/storage-isolation` AND document audit coverage tests AND
  a negative assertion that malformed input leaves no temp file/object/DB row.
- **Done:** bounded aggregate-part malformed input produces
  `VALIDATION_FAILED`, authorized normal upload remains green, and
  cleanup/audit authority is unchanged. Header-pair remediation remains
  explicitly blocked until a compatible patched dependency line is source-pinned
  and compatibility-verified.
- **Edge cases:** zero-byte, duplicate field names, Unicode filename, client
  disconnect, and chunked transfer without content length.
- **Stop / escalation:** patched line is incompatible with the Nest adapter,
  bounded limit breaks normal large upload without evidence, the installed
  parser ignores a required limit, or the required package upgrade falls outside
  this contract's explicit component/file scope.
- **Evidence target:**
  `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS00-02/SEC-UPLOAD-MULTIPART-TUW-001/`
  with negative results, source/test map, cleanup/audit results, and lockfile
  change reason (or `not_changed`).

## `DEVOPS-OSSPY-LOCK-TUW-001` — Python uv lock and frozen CI

- **Release / Module / Risk / Size:** `R14` / `DEVOPS-OSSPY-LOCK` / `H` / `M`.
- **Depends_on:** `DEVOPS-OSSDEP-TRIAGE-TUW-001`.
- **Objective:** Make ingestion dependencies and test extras reproducible with
  an exact lock and two equal clean-sync inventories, without changing parser
  behavior or the supported Python range.
- **Inputs:** `workers/ingestion/pyproject.toml`, its Dockerfile, existing
  Python-worker CI job, and an exact official uv release/source pin.
- **Files create:** `workers/ingestion/uv.lock`.
- **Files modify:** `workers/ingestion/Dockerfile`, `.github/workflows/ci.yml`,
  and provenance inventory, only for the exact uv pin whose source, license,
  container, and CI behavior are verified.
- **Files NOT-modify:** parser behavior, fixture semantics, Python version
  range, `docs/package/**`, deployment configuration, and external state.
- **Implementation sequence:** (1) prove the requested uv binary/image pin and
  license/adoption decision; (2) create base plus test-extra lock; (3) align
  CI/Docker on `uv sync --frozen` or equivalent hash-locked install; (4) compare
  normalized package/version/hash lists from two clean temporary environments.
  Do not write a lock or CI/Docker delta if the exact uv pin, license, or
  supported-platform behavior cannot be verified.
- **Verification (AND):** two frozen syncs exit zero with identical normalized
  inventory hashes AND worker pytest is green AND container import/health is
  green AND lock/pyproject drift exits non-zero.
- **Done:** unbounded `pip` resolution is absent from CI/image path and the
  locked environment is reproducible across two clean runs.
- **Edge cases:** platform wheels, LibreOffice system packages, optional test
  extras, and sdist-only dependencies.
- **Stop / escalation:** reproducible hash/wheel is unavailable, a supported
  platform breaks, or a required uv/CI change falls outside this contract's
  explicit component/file scope.
- **Evidence target:**
  `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS00-02/DEVOPS-OSSPY-LOCK-TUW-001/`
  with two sync inventories, inventory hash, test report, container health, and
  the tool provenance pin.

## PACK completion and rollback

This PACK is locally verified only when all three TUWs are independently
completed without an unresolved hard stop, its common regression and exact-head
manifest are green, and no forbidden dependency/CI/deployment change occurred.
An externally unauthorized remediation or uv introduction stays explicitly
blocked; it must not be misrepresented as PACK completion. Before any later
merge, close/revert the PACK's registration and implementation commits together;
there is no database rollback in this PACK.
