# PACK-OSS00A-03 — ops source map and adoption gate

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721`. This translates
`PROPOSED-PACK-OSS00A-03` without modifying frozen `docs/package/**`.

## Scope and invariants

- Source availability, a local clone, a baseline, or a score alone never
  authorizes runtime adoption. Each decision retains Vault permission, audit,
  tenant, immutable-original and ethical-wall authority.
- A source/test mapping needs an official exact pin, license hash, clean
  external clone, relative paths, blob hashes, target portfolio, owner and
  explicit conditional/blocked state. Unknown or enterprise-only boundaries
  remain rejected.
- L0 is behavioral/reference-only. L1 is a supported integration candidate.
  L2 needs a file/update/rollback record. L3 needs remote/owners/security SLA/
  monthly sync/HA/backup/source-offer/exit. L4 is a separately governed fork.
  No L2-L4 is implied by this PACK.
- The reuse-first gate validates provenance and decision coverage; it cannot
  copy code, alter a product test, approve a dependency, execute CI, or turn a
  heuristic into evidence of copied source.

## TUW inventory

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSSADOPT-OPS-TUW-004` | H | PACK-OSS00A-02 | map ops/infra/search/editor source inputs |
| 2 | `DEVOPS-OSSADOPT-DECISION-TUW-005` | C | OPS-004 | make L0-L4/TCO/license decisions explicit |
| 3 | `DEVOPS-OSSADOPT-GATE-TUW-006` | H | DECISION-005 | enforce source-map and reuse-first gate |

## `DEVOPS-OSSADOPT-OPS-TUW-004`

- **Files create:** `docs/architecture/oss-adoption-decisions/ops-infra-source-map.md`.
- **Files modify:** `security/oss-source-map.yml` and
  `security/oss-test-reuse.yml` rows only.
- **Files NOT-modify:** infra runtime, search/editor code, product code/tests,
  dependency/install files, ADR approval state, `docs/package/**`.
- **Implementation:** map OTel Collector, OpenTofu, CloudNativePG, pgBackRest,
  OpenBao, OpenSearch, conditional co-editor and PgBouncer source/config/test
  inputs. Map redaction/retry/backpressure, compatibility, backup/restore/key
  loss, DLS/index drift, callback/lock/save/version and pooling/GUC behavior.
  A missing exact pin, trigger or ADR is `conditional-not-authorized`.
- **Verification:** exact pinned path/blob evidence or explicit blocked record;
  OSS-09 through OSS-11 target coverage; no trigger/ADR-absent candidate marked
  adoption-ready.

## `DEVOPS-OSSADOPT-DECISION-TUW-005`

- **Files create:** `security/oss-adoption-decisions.yml`.
- **Files modify:** component decision documents under
  `docs/architecture/oss-adoption-decisions/` only.
- **Files NOT-modify:** product/upstream code, dependencies/install config,
  Dockerfiles, CI workflow, `docs/package/**`.
- **Implementation:** give every source/test/fixture/conditional row an L0-L4
  or `REJECTED` decision. Record architecture/authority/security/license/
  maintenance/code-deletion TCO and a hard veto. L2/L3 obligations must be
  complete before the decision can advance; absent Legal/Security/owner input
  remains `BLOCKED`, never assumed.
- **Verification:** complete decision coverage, L2/L3 obligation-negative
  fixtures, zero Permission/Audit `REPLACE` decision, and an independent
  Risk=C review receipt before merge. Local implementation may proceed without
  that external review but must retain it as pending.

## `DEVOPS-OSSADOPT-GATE-TUW-006`

- **Files create:** `tools/oss/verify-source-map.mjs`,
  `tools/oss/verify-source-map.spec.mjs`, `tools/oss/check-reuse-first.mjs`,
  and `tools/oss/check-reuse-first.spec.mjs`.
- **Files modify:** `.github/workflows/supply-chain.yml` and
  `security/oss-evidence-schema.json` only.
- **Files NOT-modify:** product code, product test code, test skip config,
  dependency/lock files, CI permissions, deployment/OIDC/registry settings,
  `docs/package/**`.
- **Implementation:** fail closed on missing pin/tree/license/path/owner/
  refresh, dirty clone, fake SHA, unapproved copied fixture, new dependency,
  source-lab build context, or a new product file without L0-ineligible or
  approved L1-L4 coverage. Treat textual similarity only as a review signal.
- **Verification:** valid manifests pass; all named malformed fixtures fail;
  all upper-plan create candidates are covered; the CI job is non-deploying,
  does not clone sources on PR, and is not executed locally as a CI claim.

## Completion boundary

This PACK is a decision/control-plane gate. It does not adopt, vendor, fork,
install, deploy, or license-approve upstream source; Risk=C review, CI,
external approval, and release remain separately evidenced.
