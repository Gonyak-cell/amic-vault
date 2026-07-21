# PACK-OSS00A-01 — isolated upstream source lab

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721`. Planning source is
`PROPOSED-PACK-OSS00A-01` in the Terra execution plan; package documents remain
frozen.

## Scope and invariants

- The source lab is an external, read-only research root. It must resolve
  outside the product repository and must never become a Docker build context,
  vendored source, dependency, or runtime input.
- A candidate has an official URL, resolved full commit/tree, release/tag,
  license-file hash, clean detached baseline state, ownership, and retention
  decision before it can be used as research evidence. A tag name alone is not
  a pin.
- Any source with a credential/customer-data requirement, an unresolved
  official remote, dirty baseline, LFS/submodule ambiguity, or path/symlink
  escape stays `BLOCKED`; no product change is implied.
- Source command logs remain outside the product tree. Only safe hashes,
  bounded classifications, source IDs, and result counts may enter evidence.

## TUW inventory

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSSLAB-BOUNDARY-TUW-001` | H | PACK-OSS00-03 | define/verify source-lab root and lock schema |
| 2 | `DEVOPS-OSSLAB-CLONE-TUW-001` | H | BOUNDARY-001 | exact official shortlist cloning and lock rows |
| 3 | `DEVOPS-OSSLAB-BASELINE-TUW-001` | H | CLONE-001 | preserve upstream baseline results without source mutation |
| 4 | `DEVOPS-OSSLAB-REPRO-TUW-001` | H | BASELINE-001 | second-clone reproducibility and drift gate |

## `DEVOPS-OSSLAB-BOUNDARY-TUW-001`

- **Files create:** `security/oss-source-map.yml`,
  `tools/oss/verify-upstream-lock.mjs`,
  `tools/oss/verify-upstream-lock.spec.mjs`,
  `docs/architecture/oss-adoption-decisions/source-lab.md`.
- **Files modify:** `.gitignore` only if the verifier proves a narrow source-lab
  exclusion is required.
- **Files NOT-modify:** product runtime/build inputs, Dockerfiles, dependencies,
  lockfiles, `.env`, credentials, customer data, `docs/package/**`.
- **Verification:** reject repository-inside-root, parent/child overlap,
  symlink/path traversal, non-40-hex pin/tree/license hash, and dirty detached
  baseline; prove clone path is absent from every product build context.

## `DEVOPS-OSSLAB-CLONE-TUW-001`

- **Files create:** `tools/oss/clone-upstream.mjs`,
  `tools/oss/clone-upstream.spec.mjs`.
- **Files modify:** `security/oss-source-map.yml` lock rows only.
- **Files NOT-modify:** upstream source, product source, `third_party/`,
  dependencies/locks, `docs/package/**`.
- **Verification:** each candidate is official-remote matched, detached and
  clean, with HEAD/tree/license hash and submodule/LFS/vendor classification;
  every unresolved row has a bounded `BLOCKED` owner/reason.

## `DEVOPS-OSSLAB-BASELINE-TUW-001`

- **Files create:** `tools/oss/run-upstream-baseline.mjs` and per-component
  baseline sections under `docs/architecture/oss-adoption-decisions/`.
- **Files modify:** source-map baseline command/result fields only.
- **Files NOT-modify:** upstream tests/source, product code, test skips,
  credentials/customer inputs, `docs/package/**`.
- **Verification:** each adoptable row records its unmodified upstream command,
  environment/result classification, bounded redacted log hash, and timeout;
  unavailable external/service/architecture dependencies stay `BLOCKED`.

## `DEVOPS-OSSLAB-REPRO-TUW-001`

- **Files create:** `tools/oss/verify-upstream-baseline.mjs`,
  `tools/oss/verify-upstream-baseline.spec.mjs`.
- **Files modify:** `.github/workflows/supply-chain.yml` for a manual/scheduled
  source-lock validation only; PR jobs must not clone upstream sources.
- **Files NOT-modify:** upstream source, product runtime, Docker build context,
  CI permissions, deployment/registry/OIDC settings, `docs/package/**`.
- **Verification:** positive and tamper/drift fixtures, representative
  second-clone replay, and a complete per-row `PINNED`/`REPRODUCED`/`BLOCKED`
  result. External clone/network/CI execution is never claimed from local proof.

## Completion boundary

This PACK produces a research lock and reproducibility evidence only. It does
not adopt, vendor, fork, ship, deploy, or license-approve any upstream code.
