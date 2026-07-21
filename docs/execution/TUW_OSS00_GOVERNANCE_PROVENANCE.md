# PACK-OSS00-01 OSS Governance and Provenance TUW Contract

Status: canonical live extension, approved 2026-07-21

Release: post-R14 enterprise uplift (registered as `R14` in the live backlog so
the existing validator can enforce uniqueness, DAG, and release bans)

Branch: `feat/pack-oss00-01-governance-provenance`

Registration authority: `USER-APPROVAL-PACK-OSS00-01-20260721`.

Planning baseline: `origin/main` at
`91ac55a59b538cb57ecacecea4e69c92dc7c4cfd`. The registration itself is
documentation-only; each implementation TUW records its actual source SHA and
tree in its evidence manifest before making a completion claim.

This PACK implements the first four governance TUWs from the Terra execution
plan. It does not add a package dependency, deploy, call an external system,
change an external account, or start the next PACK. `docs/package/**` remains
frozen: the live execution registry and backlog below are the authoritative
post-R14 extension surfaces.

## Common execution contract

- Execute TUWs strictly in the listed order. Do not start a successor until
  its predecessor is committed, its focused verification is green, and its
  evidence directory is written.
- Use only Node built-ins and already installed dependencies for the governance
  checkers. A dependency need is a stop condition, not an implicit exception.
- Store only SHA/tree/digest/reference data in committed evidence. Never store
  credentials, signed URLs, document content, customer data, raw queries, or
  raw identity assertions.
- Every checker must fail closed on a malformed or incomplete input. A passing
  scanner is not a substitute for a recorded approval/VEX decision.
- The complete PACK regression is the common validation sequence in
  `docs/execution/PACKS_R4_R14.md`, plus the focused commands below. CI, human
  review, merge, staging, deployment, and external evidence are separate truth
  lines.

## TUW inventory

| Order | ID | Title | Risk | Size | Depends on |
|---:|---|---|---|---|---|
| 1 | `DEVOPS-OSSGOV-PROV-TUW-001` | Exact-head provenance inventory and evidence schema | M | M | none |
| 2 | `DEVOPS-OSSGOV-PROV-TUW-002` | License, NOTICE, and delivery-profile policy | H | L | `DEVOPS-OSSGOV-PROV-TUW-001` |
| 3 | `DEVOPS-OSSGOV-PROV-TUW-003` | Vulnerability and VEX exception contract | H | M | `DEVOPS-OSSGOV-PROV-TUW-001` |
| 4 | `DEVOPS-OSSGOV-PROV-TUW-004` | Governance check CI integration | H | M | `DEVOPS-OSSGOV-PROV-TUW-002`, `DEVOPS-OSSGOV-PROV-TUW-003` |

## `DEVOPS-OSSGOV-PROV-TUW-001` — Exact-head provenance inventory and evidence schema

- **Release / Module / Risk / Size:** `R14` / `DEVOPS-OSSGOV-PROV` / `M` / `M`.
- **Depends_on:** none.
- **Objective:** Bind every direct product dependency, image build definition,
  and included vendored source or fixture to a source SHA/tree and a
  machine-valid evidence schema at the exact implementation head.
- **Inputs:** `package.json`, `pnpm-lock.yaml`, `apps/*/Dockerfile`,
  `workers/ingestion/pyproject.toml`, `.github/workflows/ci.yml`, and the
  current source SHA/tree.
- **Files create:** `security/oss-provenance.yml`,
  `security/oss-evidence-schema.json`,
  `tools/security/check-evidence-manifest.mjs`,
  `tools/security/check-evidence-manifest.spec.mjs`.
- **Files modify:** none.
- **Files NOT-modify:** `docs/package/**`, lockfiles, application/runtime
  source, workflows, deployment configuration, and external state.
- **Implementation sequence:** Restrict each `.yml` input to the YAML 1.2 JSON
  subset so the Node standard library can parse it deterministically. Require
  source SHA/tree, artifact digest, upstream URL/SHA/tree/license hash,
  file-level inclusion, modifier, and evidence state. Inventory current direct
  dependencies and image builds. Add negative fixtures for 7/40-character SHA
  mismatch, mutable tag-only images, and blank licenses.
- **Verification (AND):**
  `node --test tools/security/check-evidence-manifest.spec.mjs` exits 0 AND
  the checker accepts the committed provenance inventory AND every malformed
  fixture exits non-zero AND `git diff -- docs/package` is empty.
- **Done:** 100% of current direct package/image/build inputs have a source
  SHA/tree binding; an unknown value is explicit `unresolved` with an owner,
  never an empty field.
- **Edge cases:** multi-stage Dockerfiles, workspace dependencies, generated
  artifacts, tag-and-digest references, and binary-only tools.
- **Stop condition:** the required record would contain a secret, signed URL,
  customer data, or cannot be bound to the current source SHA/tree.
- **Escalation:** append the opaque reason and affected reference to
  `docs/ledger/execution.md`; do not invent a source or relax validation.
- **Evidence target:**
  `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS00-01/DEVOPS-OSSGOV-PROV-TUW-001/`
  with `inventory.json`, `schema-negative-results.json`, and
  `source-identity.txt`.

## `DEVOPS-OSSGOV-PROV-TUW-002` — License, NOTICE, and delivery-profile policy

- **Release / Module / Risk / Size:** `R14` / `DEVOPS-OSSGOV-PROV` / `H` / `L`.
- **Depends_on:** `DEVOPS-OSSGOV-PROV-TUW-001`.
- **Objective:** Mechanically enforce license, NOTICE, source-offer, and owner
  obligations separately for SaaS-only, on-premises, and modified network
  service delivery profiles.
- **Inputs:** TUW-001 schema and inventory, approved L0–L4 adoption decisions,
  direct dependency license metadata, and Legal decisions D-OSS-04/12/13.
- **Files create:** `security/oss-allowlist.yml`,
  `security/oss-license-policy.yml`,
  `tools/security/check-oss-license-policy.mjs`,
  `tools/security/check-oss-license-policy.spec.mjs`, `third_party/NOTICE.md`.
- **Files modify:** `security/oss-provenance.yml` license and delivery fields.
- **Files NOT-modify:** product source, dependency versions, upstream source
  copies, `docs/package/**`, deployment configuration, and external state.
- **Implementation sequence:** Separate SPDX expression, source type, adoption
  mode, and delivery profile. Treat GPL, AGPL, LGPL, unknown, and custom
  licenses as review-required or denied rather than automatically permitted.
  Require a file map, patch/source offer, owner, and exit plan for L2/L3.
  Include only shipped inputs in NOTICE; L4 research candidates are not
  shipped components.
- **Verification (AND):** `node --test
  tools/security/check-oss-license-policy.spec.mjs` accepts allowed fixtures
  AND rejects unknown license, AGPL-on-premises-without-source-offer,
  L2-without-file-map, and expired-approval fixtures AND produces a current
  manifest report.
- **Done:** linked, sidecar, behavior-only, and research-only inputs are
  distinguishable; no strong-copyleft or unknown input becomes green without a
  recorded human decision.
- **Edge cases:** dual licenses, license exceptions, font/model/data licenses,
  copied fixtures, and unmodified external services.
- **Stop condition:** an API/sidecar split is asserted to erase a license
  obligation, or there is no Legal decision owner.
- **Escalation:** leave the component `blocked` in the policy; do not ship,
  link, or copy it.
- **Evidence target:**
  `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS00-01/DEVOPS-OSSGOV-PROV-TUW-002/`
  with `license-policy-report.json`, `notice-coverage.json`, and the opaque
  unresolved-item list.

## `DEVOPS-OSSGOV-PROV-TUW-003` — Vulnerability and VEX exception contract

- **Release / Module / Risk / Size:** `R14` / `DEVOPS-OSSGOV-PROV` / `H` / `M`.
- **Depends_on:** `DEVOPS-OSSGOV-PROV-TUW-001`.
- **Objective:** Classify vulnerability findings by package, advisory,
  reachability, remediation owner, expiry, and evidence hash, rejecting
  indefinite ignores.
- **Inputs:** `pnpm audit --prod --json`, future Trivy/Syft schema inputs, and
  the security risk-acceptance policy.
- **Files create:** `security/oss-vulnerability-exceptions.yml`,
  `tools/security/check-vulnerability-policy.mjs`,
  `tools/security/check-vulnerability-policy.spec.mjs`.
- **Files modify:** `security/oss-evidence-schema.json` to require a
  vulnerability-decision reference.
- **Files NOT-modify:** dependency versions, `.trivyignore`, test-skip or
  quarantine configuration, `docs/package/**`, deployment configuration, and
  external state.
- **Implementation sequence:** Require advisory ID, affected artifact,
  production reachability, decision, owner, issued/expiry dates, compensating
  control, and evidence hash. A production-reachable High/Critical finding is
  accepted only when fixed or covered by a still-valid approved VEX.
  Unknown severity or reachability fails closed.
- **Verification (AND):** audit-JSON parser tests pass AND expired, ownerless,
  wrong-SHA VEX and malformed-tool-output fixtures fail AND the normalized
  report has zero unclassified production-reachable High/Critical findings.
- **Done:** scanner output and a risk-acceptance decision are distinct,
  expiring records; no unbounded ignore exists.
- **Edge cases:** withdrawn advisories, duplicate CVEs, development-only
  packages, and transitive packages without an available fixed version.
- **Stop condition:** the policy can pass only by weakening functional,
  permission, or audit tests, or no owner can decide reachability.
- **Escalation:** preserve the unresolved finding as `blocked`; do not mark it
  not-affected without evidence.
- **Evidence target:**
  `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS00-01/DEVOPS-OSSGOV-PROV-TUW-003/`
  with `vulnerability-inventory.json`, `vex-validation.json`, and
  `unresolved.json`.

## `DEVOPS-OSSGOV-PROV-TUW-004` — Governance check CI integration

- **Release / Module / Risk / Size:** `R14` / `DEVOPS-OSSGOV-PROV` / `H` / `M`.
- **Depends_on:** `DEVOPS-OSSGOV-PROV-TUW-002`,
  `DEVOPS-OSSGOV-PROV-TUW-003`.
- **Objective:** Run provenance, license, VEX, and evidence-schema checks
  deterministically on pull requests without claiming unimplemented scanner
  success.
- **Inputs:** TUW-001–003 checkers, `.github/workflows/ci.yml`, and existing
  verify/docker-build jobs.
- **Files create:** `.github/workflows/supply-chain.yml`.
- **Files modify:** `.github/workflows/ci.yml` only as needed to connect the
  reusable result without duplicating installation.
- **Files NOT-modify:** application source, existing test-command removal or
  skipping, branch protection, `docs/package/**`, deployment configuration,
  and external state.
- **Implementation sequence:** Match the existing Node/corepack/pnpm frozen
  install contract, run the checkers in a network-independent job, and bind
  artifact reports to the workflow SHA/tree. Explicitly label scanner, SBOM,
  and signature work as not-yet-implemented instead of adding pass stubs.
- **Verification (AND):** workflow syntax is valid AND local governance
  checkers pass AND an intentionally invalid manifest fails through the
  job-equivalent command AND the existing CI command inventory is unchanged.
- **Done:** governance failures are independently reportable PR-check
  candidates and every uploaded report is provenance-bound to the workflow
  source identity.
- **Edge cases:** fork PR read-only token, artifact-upload failure, and a path
  filter that would skip a changed governance input.
- **Stop condition:** GitHub secret/permission expansion or removal of an
  existing required check is necessary.
- **Escalation:** stop before changing workflow permissions or protections;
  record the exact missing capability.
- **Evidence target:**
  `artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS00-01/DEVOPS-OSSGOV-PROV-TUW-004/`
  with `governance-ci-local.json`, `workflow-command-inventory.json`, and
  `artifact-hash-list.json`.

## PACK completion and rollback

The PACK may be proposed for review only after all four TUWs, their focused
AND verification, the common full regression, and exact-head evidence manifest
are complete. `H` risk does not waive the independent security/license review
of a policy decision. No CI success authorizes a deployment or an external
operation.

Before merge, close the registration/implementation PR to roll back this PACK.
After merge, revert the registration and implementation commits together; no
database rollback applies because this PACK has no migration scope.
