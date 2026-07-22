# PACK-OSS00A-03 — ops source map and adoption gate

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721`. It translates
`PROPOSED-PACK-OSS00A-03` without changing frozen `docs/package/**`.

## Scope and invariants

- A local source, baseline, or score never authorizes runtime adoption. Vault
  retains permission, audit, tenant, immutable-original and ethical-wall
  authority.
- Mapping requires an official exact pin, license hash, clean clone, paths,
  blob hashes, portfolio, owner and conditional/blocked state; unknown or
  enterprise-only boundaries are rejected.
- L0 is reference-only; L1 is a future supported-component candidate; L2 needs
  file/update/rollback; L3 needs remote/two owners/security SLA/monthly sync/
  HA/backup/source offer/exit; L4 is a separately governed fork. This PACK
  grants none of L2-L4.

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSSADOPT-OPS-TUW-004` | H | PACK-OSS00A-02 | map ops/infra/search/editor source inputs |
| 2 | `DEVOPS-OSSADOPT-DECISION-TUW-005` | C | OPS-004 | make L0-L4/TCO/license decisions explicit |
| 3 | `DEVOPS-OSSADOPT-GATE-TUW-006` | H | DECISION-005 | enforce source-map and reuse-first gate |

## `DEVOPS-OSSADOPT-OPS-TUW-004`

- **Files create:** `docs/architecture/oss-adoption-decisions/ops-infra-source-map.md`.
- **Files modify:** `security/oss-source-map.yml`, `security/oss-test-reuse.yml` rows only.
- **Files NOT-modify:** infra runtime, search/editor code, product code/tests,
  dependency/install files, ADR approval state, `docs/package/**`.
- **Verification:** exact pinned path/blob or explicit blocked record covers
  OSS-09~11; a trigger/ADR-absent candidate is never adoption-ready.

## `DEVOPS-OSSADOPT-DECISION-TUW-005`

- **Files create:** `security/oss-adoption-decisions.yml`.
- **Files modify:** component decision documents only.
- **Files NOT-modify:** product/upstream code, dependencies/install config,
  Dockerfiles, CI workflow, `docs/package/**`.
- **Verification:** full decision coverage; L2/L3 obligation-negative fixtures;
  Permission/Audit `REPLACE` count zero. Independent Risk=C review remains
  required before merge and cannot be replaced by local evidence.

## `DEVOPS-OSSADOPT-GATE-TUW-006`

- **Files create:** `tools/oss/verify-source-map.mjs`, its spec,
  `tools/oss/check-reuse-first.mjs`, and its spec.
- **Files modify:** `.github/workflows/supply-chain.yml` and
  `security/oss-evidence-schema.json` only.
- **Files NOT-modify:** product code/tests, test skip config, dependency/lock
  files, CI permissions, deployment/OIDC/registry settings, `docs/package/**`.
- **Verification:** valid manifests pass; missing provenance, fake SHA, dirty
  clone, copied fixture, no-decision, new dependency and source-lab build
  context fixtures fail. CI is non-deploying and never clones sources in PR jobs.

## Completion boundary

This is a decision/control-plane gate. It does not adopt, vendor, fork,
install, deploy, or license-approve upstream source; CI, Risk=C review,
external approval and release remain separately evidenced.
