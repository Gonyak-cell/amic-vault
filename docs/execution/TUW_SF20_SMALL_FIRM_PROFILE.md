# PACK-SF20-00 — Small-firm profile freeze and OSS provenance

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721` and the owner's all-immediate-track execution
direction. This is the canonical form of `PROPOSED-PACK-SF20-00`, independently
based on `origin/main`
`287c9e3f52b2b8fbc0b6ade8bab5d56d47cf80e9`.

## Objective and authority

Freeze the maximum-20-user operating envelope before any transport,
infrastructure, monitoring, DLP, or identity-lifecycle implementation. The
machine-readable profile must preserve all 19 original immediate outcomes and
their 33 testable implementation units while preventing silent expansion into
the conditional enterprise topology.

The profile does not weaken Matter permission, ethical-wall deny precedence,
tenant RLS/FORCE RLS, audit transactionality, immutable originals, quarantine
before promotion, or sensitive-data logging prohibitions. It creates no
runtime service, dependency, cloud resource, certificate, secret, deployment,
release, or go-live claim.

## Ordered TUWs

| Order | ID                         | Risk / size | Depends on                 | Result                                               |
| ----: | -------------------------- | ----------- | -------------------------- | ---------------------------------------------------- |
|     1 | `DEVOPS-SF20-BASE-TUW-001` | M / M       | none                       | exact-main SF20 manifest and invariant checker       |
|     2 | `DEVOPS-SF20-CAP-TUW-002`  | M / M       | BASE-001                   | deterministic two-tenant capacity/SLO fixture        |
|     3 | `DEVOPS-SF20-OSS-TUW-003`  | H / M       | BASE-001                   | exact OSS source, test, license, and artifact locks  |
|     4 | `DEVOPS-SF20-GATE-TUW-004` | M / S       | BASE-001, CAP-002, OSS-003 | conditional-component and public-worker-port CI gate |

## `DEVOPS-SF20-BASE-TUW-001`

- **Files create:** `security/small-firm-20-profile.yml`,
  `tools/quality/check-small-firm-profile.mjs`, its direct spec, and the
  approved architecture plan.
- **Files modify:** canonical PACK/backlog/ledger registration and the root
  quality script/workflow only.
- **Files NOT-modify:** `docs/package/**`, product permission/audit/document
  state machines, application runtime, dependencies, lockfiles, deployment
  configuration.
- **Implementation:** bind `origin/main` SHA, capacity, SLOs, mandatory
  invariants, the exact 19 original outcomes, seven ordered PACKs, and 33
  unique canonical TUW IDs in one JSON-compatible profile.
- **Verification (AND):** valid profile passes; invariant removal, outcome or
  PACK shrinkage, duplicate TUW, malformed source SHA, and missing canonical
  path fail.
- **Done:** removing permission-before-search, audit-by-default,
  immutable-original, private-gateway-mTLS, production-loopback denial, or
  restore direct readback makes the checker fail closed.

## `DEVOPS-SF20-CAP-TUW-002`

- **Files create:** `tools/bench/small-firm-20-profile.mjs`, direct spec, and
  `tests/fixtures/small-firm-20-capacity.json`.
- **Files modify:** none outside the root command registration.
- **Files NOT-modify:** existing load/search runners, production data,
  dependencies/lockfiles, runtime performance promises.
- **Implementation:** create a fixed-seed, synthetic-only, two-tenant fixture
  whose totals are 20 named users, 12 active sessions, 25 API burst, eight
  preview/downloads, four ingestion jobs, 500,000 document versions, and
  2 TiB of objects. Include authorized control plus cross-tenant,
  ethical-wall, and unknown-policy denials.
- **Verification (AND):** two runs at the same source SHA produce the same
  SHA-256 manifest; count drift, missing denial, or a raw
  content/file/token/object-key field fails.
- **Done:** the fixture is a deterministic test contract and not a product
  guarantee or customer-data benchmark.

## `DEVOPS-SF20-OSS-TUW-003`

- **Files modify:** `security/oss-source-map.yml` and
  `security/oss-adoption-decisions.yml`.
- **Files NOT-modify:** product source with upstream code, dependency
  manifests, upstream fixtures, build context, deployment configuration,
  `docs/package/**`.
- **Implementation:** retain detached, credential-free clones outside the
  product tree and pin:

| Component    | Release / commit                  | Reuse                     | Runtime boundary                                    |
| ------------ | --------------------------------- | ------------------------- | --------------------------------------------------- |
| NGINX        | `release-1.30.4` / `017cf98d…`    | L1 official image/config  | image digest pinned; exact mTLS behavior referenced |
| nginx-tests  | `master-2026-07-23` / `76bb761c…` | L0 no-copy test reference | never enters product tree                           |
| Prometheus   | `v3.13.1` / `73ff57ce…`           | L1 official image/config  | image digest pinned; internal only                  |
| Alertmanager | `v0.33.1` / `2c8da51e…`           | L1 official image/config  | image digest pinned; bounded alerts only            |
| Ansible      | `v2.21.2` / `1ebfc2c7…`           | L0 external runner        | package/runtime pin required in SF20-03             |
| pgBackRest   | `release/2.59.0` / `f84c8357…`    | L0 behavioral study       | conditional until SF20-03 restore-tool decision     |

Every row binds official URL, release, commit, tree, license path/hash, clone
path, source path/blob, and test path/blob. The three selected service
images also bind immutable registry digests.

- **Verification (AND):** static source map checks pass; with
  `OSS_RESEARCH_ROOT`, each selected clone is detached/clean and its
  commit/tree/license/source/test blobs match. Copy policy remains `NO_COPY`.
- **Done:** a later PACK cannot use an unpinned image, package, or config
  candidate; cloning alone never authorizes runtime adoption.

## `DEVOPS-SF20-GATE-TUW-004`

- **Files modify:** the SF20 checker, root scripts,
  `.github/workflows/ci.yml`, and `.github/workflows/supply-chain.yml`.
- **Files NOT-modify:** runtime manifests to make canaries pass, conditional
  trigger policy, `docs/package/**`.
- **Implementation:** scan only runtime/dependency manifests, excluding the
  development compose profile. Reject unapproved Kubernetes, Redis, Kafka,
  OpenSearch, WOPI, PgBouncer, Keycloak, Presidio, Jaeger, OTel Collector,
  Collabora, ONLYOFFICE, or tusd tokens. Independently reject an
  ingestion/ingestion-worker `ports:` publication.
- **Verification (AND):** one negative fixture per component and the public
  worker port fails. A conditional component passes only when the profile
  carries an exact path, trigger receipt, and approval reference.
- **Done:** baseline complexity cannot expand through a silent dependency,
  image, or production manifest edit.

## PACK verification and evidence

Run:

```bash
node --test tools/quality/check-small-firm-profile.spec.mjs
node --test tools/bench/small-firm-20-profile.spec.mjs
node tools/quality/check-small-firm-profile.mjs --static
node tools/quality/check-small-firm-profile.mjs \
  --source-root /Users/jws/Projects/amic-vault-oss-source-lab-20260721
node tools/bench/small-firm-20-profile.mjs
node tools/oss/verify-source-map.mjs --static \
  --source-map security/oss-source-map.yml \
  --decisions security/oss-adoption-decisions.yml \
  --reuse security/oss-test-reuse.yml
pnpm backlog:validate
pnpm docs:frozen
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Evidence belongs under
`artifacts/enterprise-dms-oss/<source-sha>/PACK-SF20-00/<tuw>/` and contains
only source identities, deterministic hashes, bounded counts, and synthetic
results. Local evidence does not claim CI, merge, deployment, release, or
go-live.

## Stop conditions

- Any need to change `docs/package/**`, a permission/audit/immutable-original
  authority, application runtime, dependency, deployment, or external system.
- Any OSS source/fixture copy into the product tree or source-lab overlap with
  a product build context.
- Any profile that contains fewer than 19 original outcomes or 33 testable
  TUWs.
- Any conditional runtime component without both measured trigger receipt and
  explicit approval reference.
