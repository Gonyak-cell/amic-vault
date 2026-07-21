# PACK-OSS00-03 SBOM, scanning, and release-identity TUW contract

**Status:** canonical live extension under `USER-UMBRELLA-AUTONOMY-20260721`

**Release:** post-R14 enterprise uplift (registered as `R14` solely for the
existing live-backlog uniqueness, DAG, and release-ban validator)

**Branch:** `feat/pack-oss00-03-sbom-scan-attestation`

**Planning baseline:** `origin/main` at
`91ac55a59b538cb57ecacecea4e69c92dc7c4cfd`; every implementation receipt
must bind its atomic implementation SHA and tree.

**Authority:** [OSS Terra autonomous sequential-execution authority](./OSS_TERRA_AUTONOMOUS_EXECUTION_AUTHORITY.md).
This contract removes no safety boundary: no deployment, external registry
write, signing, CI invocation, push, PR, merge, customer data, or secret use is
authorized. `docs/package/**` stays frozen.

## Common execution contract

- Execute the three TUWs in order. A successor needs its predecessor's atomic
  commit, focused green checks, and exact-head evidence. A local technical pass
  never implies a CI, signing, registry, release, or production pass.
- Use an official, exact-SHA/source-tree/license-pinned tool only. The tool may
  run in an isolated local source lab or as a pinned container; product runtime
  dependencies, lockfiles, base-image majors, and deployed images must not
  change. Generated SBOMs, scanner databases, reports, and image tarballs are
  ignored artifacts, not repository sources.
- Receipts contain only source SHA/tree, immutable image digest, file hash,
  normalized component/finding counts, tool identity, and safe command/result
  summaries. They must not contain a secret, signed URL, private registry
  reference, customer path, document content, raw scanner database, or raw
  signing identity.
- A scan cannot be made green by broad exclusion, deleting a fixture, history
  rewrite, VEX mutation, test weakening, or a mutable tag. Every exception is
  delegated to the existing fail-closed VEX/license contracts.
- The output identity graph is `source SHA/tree -> exact image digest -> SBOM
  hash -> normalized scan hash -> unsigned local identity bundle`. A missing or
  mismatched edge is a failure, never a warning.

## TUW inventory

| Order | ID | Title | Risk | Size | Depends on |
|---:|---|---|---|---|---|
| 1 | `DEVOPS-OSSATT-SBOM-TUW-001` | Source and three-image CycloneDX SBOM | H | L | `SEC-UPLOAD-MULTIPART-TUW-001`, `DEVOPS-OSSPY-LOCK-TUW-001` |
| 2 | `SEC-OSSSCAN-PIPELINE-TUW-001` | Source, IaC, secret, and image scanning contract | H | L | `DEVOPS-OSSATT-SBOM-TUW-001`, `DEVOPS-OSSGOV-PROV-TUW-003` |
| 3 | `DEVOPS-OSSATT-IDENTITY-TUW-001` | Unsigned release-identity verifier and attestation boundary | H | M | `DEVOPS-OSSATT-SBOM-TUW-001`, `SEC-OSSSCAN-PIPELINE-TUW-001` |

## `DEVOPS-OSSATT-SBOM-TUW-001` — Source and three-image CycloneDX SBOM

- **Release / Module / Risk / Size:** `R14` / `DEVOPS-OSSATT-SBOM` / `H` / `L`.
- **Objective:** Generate deterministic, schema-checked CycloneDX SBOMs for
  the repository dependency surface and locally built API, web, and ingestion
  images, then bind their normalized component sets to source SHA/tree and
  immutable local image digests.
- **Inputs:** three Dockerfiles, frozen Node/Python locks, existing provenance
  schema, and the exact official Syft source/release/image pin adopted only
  after source SHA/tree/license/checksum evidence is recorded.
- **Files create:** `tools/security/generate-sbom.mjs`,
  `tools/security/generate-sbom.spec.mjs`.
- **Files modify:** `security/oss-provenance.yml`,
  `security/oss-evidence-schema.json`, `.github/workflows/supply-chain.yml`
  only to add a non-deploying, digest-pinned artifact job after its local
  equivalent is proven.
- **Files NOT-modify:** application source, package manifests/lockfiles,
  Python project/lock, base-image major, Dockerfile behavior, deployment
  manifests, production registry, `docs/package/**`, and generated SBOM files.
- **Implementation sequence:** (1) verify an official tool release against
  source SHA/tree, license hash, and release checksum; (2) implement a Node
  built-in wrapper that rejects mutable image refs and writes only ignored
  artifact paths; (3) build each image locally with an exact source identity,
  resolve immutable digests, and generate source/API/web/ingestion CycloneDX
  documents; (4) normalize component identity without paths/timestamps and
  reject duplicate purl, malformed schema, missing digest, or source/image
  mismatch; (5) generate twice from the same immutable inputs and compare
  normalized sets; (6) add the same read-only job to the existing supply-chain
  workflow without changing permissions, registry login, or artifact publish.
- **Verification (AND):** tool pin/license/checksum evidence AND four SBOMs
  parse and validate AND three local image digests exist AND wrong-SHA,
  mutable-tag, malformed-SBOM, duplicate-purl, and missing-image fixtures fail
  AND two same-input normalized inventories match AND frozen locks and existing
  governance checks remain green.
- **Done:** each image has an immutable digest and CycloneDX hash connected to
  the same source identity; no SBOM relies only on a mutable image tag.
- **Stop / escalation:** the tool emits an unsafe field, cannot pin a digest,
  requires a registry credential, or changes the product build/dependency line.
- **Evidence target:**
  `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS00-03/DEVOPS-OSSATT-SBOM-TUW-001/`
  with safe manifests, normalized component hashes, tool pin, and fixture
  result summaries.

## `SEC-OSSSCAN-PIPELINE-TUW-001` — Source, IaC, secret, and image scanning contract

- **Release / Module / Risk / Size:** `R14` / `SEC-OSSSCAN-PIPELINE` / `H` /
  `L`.
- **Objective:** Add bounded, fail-closed local scan orchestration for secret,
  source, IaC, lock, and immutable image inputs, while retaining the existing
  VEX/license policies as the sole exception authority.
- **Inputs:** TUW-001 SBOM identity bundle, VEX policy, current workflow, and
  exact official source/release/checksum/license pins for each adopted scanner.
- **Files create:** `.gitleaks.toml`, `.semgrep.yml`,
  `tools/security/run-security-scans.mjs`,
  `tools/security/run-security-scans.spec.mjs`.
- **Files modify:** `security/oss-provenance.yml`,
  `security/oss-evidence-schema.json`, `.github/workflows/supply-chain.yml`.
  Create `.trivyignore` only if a pre-existing approved VEX row requires an
  exact advisory-scoped mapping; otherwise it must not exist.
- **Files NOT-modify:** application/runtime code, customer or real-secret
  fixtures, existing functional tests, broad scanner exclusions, VEX decision
  rows, deployment/registry/branch-protection configuration, and
  `docs/package/**`.
- **Implementation sequence:** (1) pin official scanner releases and build a
  deterministic local command manifest; (2) run full-history secret scanning
  separately from working-tree/diff scanning without rewriting history; (3)
  scan filesystem/config/SBOM-bound image inputs and normalize only safe finding
  keys; (4) match every High/Critical production finding to the existing policy
  and reject ownerless, expired, wrong-hash, or broad exclusions; (5) add
  synthetic injected-secret, insecure Docker/IaC, malformed policy, and image
  mismatch fixtures; (6) wire a read-only CI equivalent that uploads only safe
  normalized artifacts.
- **Verification (AND):** current clean policy result AND each synthetic secret
  and insecure config fixture is detected AND ownerless/expired/wrong-scope
  ignore is rejected AND no raw scanner report is committed AND unresolved
  production High/Critical remains explicitly blocked rather than green.
- **Done:** scans are reproducible, scope-bound, and connected to SBOM/image
  identity; an exception cannot silently suppress an unrelated input.
- **Stop / escalation:** a history rewrite, credential rotation, fixture
  deletion, external scanner account, broad ignore, or secret/registry access
  is needed. Record `EXTERNAL_BLOCKED` and continue only independent work.
- **Evidence target:**
  `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS00-03/SEC-OSSSCAN-PIPELINE-TUW-001/`
  with normalized findings, tool pins, fixture results, and policy mapping.

## `DEVOPS-OSSATT-IDENTITY-TUW-001` — Unsigned release-identity verifier and attestation boundary

- **Release / Module / Risk / Size:** `R14` / `DEVOPS-OSSATT-IDENTITY` / `H` /
  `M`.
- **Objective:** Verify a deterministic, unsigned local identity bundle that
  joins source SHA/tree, image digest, SBOM hash, scan hash, and policy state;
  explicitly keep cosign signing/attestation as an external CI-identity gate.
- **Inputs:** TUW-001 SBOM manifests, TUW-002 normalized scans, existing
  evidence schema, and exact official Cosign source/release/license pin for
  format compatibility research only.
- **Files create:** `tools/security/verify-release-identity.mjs`,
  `tools/security/verify-release-identity.spec.mjs`,
  `docs/execution/evidence/enterprise-dms-oss/OSS-00/README.md`.
- **Files modify:** `security/oss-evidence-schema.json`,
  `.github/workflows/supply-chain.yml` only for unsigned verification and
  artifact upload; no signing command is permitted.
- **Files NOT-modify:** production registry, container signing configuration,
  deployment manifests, GitHub/OIDC permissions, branch protection,
  application source, `docs/package/**`, or any key/certificate/identity
  material.
- **Implementation sequence:** (1) define a schema that requires one source
  SHA/tree and all image/SBOM/scan hash edges; (2) verify local unsigned bundles
  and prove wrong digest, wrong SHA/tree, replayed artifact, missing predicate,
  and unresolved High/license state fail; (3) emit an explicit
  `EXTERNAL_BLOCKED_SIGNING_IDENTITY_REQUIRED` result for actual Cosign signing
  or signature verification; (4) add CI artifact validation only, with no OIDC
  or write permission expansion.
- **Verification (AND):** positive local unsigned bundle AND all negative
  fixtures fail AND a blocked signing receipt is generated without key,
  certificate, registry, or network identity use AND existing governance/SBOM/
  scan checks pass.
- **Done:** identity integrity is locally verifiable and cannot be mistaken for
  a signed attestation; a future approved CI identity is the only route to a
  signing claim.
- **Stop / escalation:** any proposed path needs a private key, OIDC write
  token, registry write, secret, or branch-protection change.
- **Evidence target:**
  `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS00-03/DEVOPS-OSSATT-IDENTITY-TUW-001/`
  with identity bundles, negative results, and safe signing-boundary receipt.

## PACK completion and rollback

This PACK is locally technically complete only when every TUW has focused AND
verification, common regression, and exact-head evidence. Signature, CI,
registry, deployment, release, and external scanner claims remain distinct and
are never inferred from local artifacts. Before merge, close/revert the
registration and implementation commits together; no database rollback exists.
