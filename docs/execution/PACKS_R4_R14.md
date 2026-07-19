# R4~R14 Live Execution Packs

Status: live extension after R3 Gate
Source constraints: `docs/package/codex/30_Release_Roadmap.md`,
`docs/package/codex/44_Outline_R4_R6.md`, and active operator waiver.

`docs/package/` is read-only, so these PACK definitions extend the frozen package
without modifying it. Each PACK still follows the AGENTS cycle: branch, implement,
verify, ledger append, PR, CI, merge under the active waiver.

## Common Validation

Every implementation PACK runs at least:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm backlog:validate
pnpm docs:frozen
```

DB or security PACKs additionally run compose, migrate, rollback, migrate, seed,
targeted integration suites, and full `pnpm test:integration`.

## PACK Order

| PACK | Branch | TUW count | TUW range |
|---|---|---:|---|
| PACK-DLP-01 | `feat/pack-dlp-01-core-rules` | 4 | `SEC-DLP-SENSDATADE-TUW-001~004` |
| PACK-R4-01 | `feat/pack-r4-01-email-ingestion-parser` | 5 | `EMAIL-EMAIINGE-PARS-TUW-001~005` |
| PACK-R4-02 | `feat/pack-r4-02-email-metadata-normalizer` | 5 | `EMAIL-EMAIMETA-NORM-TUW-001~005` |
| PACK-R4-03 | `feat/pack-r4-03-attachment-linker` | 5 | `EMAIL-ATTAHAND-ATTALINK-TUW-001~005` |
| PACK-R4-04 | `feat/pack-r4-04-matter-filing` | 5 | `EMAIL-MATTFILI-FILIENGI-TUW-001~005` |
| PACK-R4-05 | `feat/pack-r4-05-email-security-thread-upload` | 7 | `EMAIL-EMAISECU-EMAIDLP-TUW-001~004`, `EMAIL-EMAITHRE-THREAD-TUW-001`, `EMAIL-UPLOENDP-UPLOAD-TUW-001`, `INGEST-HWP5-SPIKE-TUW-001` |
| PACK-R5-01 | `feat/pack-r5-01-dlp-wall-entry` | 4 | `SEC-DLP-SENSDATADE-TUW-005~006`, `SEC-ETHIWALL-WALLENFO-TUW-004`, `SEC-ETHIWALL-WALLENFO-TUW-007` |
| PACK-R5-02 | `feat/pack-r5-02-break-glass` | 4 | `SEC-BREAKGLAS-DUALAPPR-TUW-001~004` |
| PACK-R5-03 | `feat/pack-r5-03-abac-policy` | 4 | `SEC-ABAC-ATTRPOLI-TUW-001~004` |
| PACK-R5-04 | `feat/pack-r5-04-audit-console-policy-wall-ui` | 7 | `AUDIT-AUDICONS-CONS-TUW-001~005`, `SEC-SHAREPOLICY-DEFIONLY-TUW-001`, `SEC-ETHIWALL-WALLADMIUI-TUW-001` |
| PACK-R6-01 | `feat/pack-r6-01-ai-policy-evaluator` | 5 | `AI-AIPOLI-POLIEVAL-TUW-001~005` |
| PACK-R6-02 | `feat/pack-r6-02-chunks-vector` | 7 | `AI-AICONT-CHUNEVID-TUW-001~002`, `SEARCH-SEMASEAR-VECT-TUW-001~005` |
| PACK-R6-03 | `feat/pack-r6-03-retrieval-wall` | 7 | `AI-AIRETR-RETRORCH-TUW-001~006`, `SEC-ETHIWALL-WALLENFO-TUW-006` |
| PACK-R6-04 | `feat/pack-r6-04-evidence-pack` | 4 | `AI-AICONT-CHUNEVID-TUW-003~006` |
| PACK-R6-05 | `feat/pack-r6-05-citations` | 5 | `AI-CITA-CITAMAPP-TUW-001~005` |
| PACK-R6-06 | `feat/pack-r6-06-ai-session` | 5 | `AI-AISESS-SESSLOGG-TUW-001~005` |
| PACK-R6-07 | `feat/pack-r6-07-ai-audit` | 5 | `AUDIT-AIAUDI-AIEVEN-TUW-001~005` |
| PACK-R6-08 | `feat/pack-r6-08-model-routing` | 5 | `AI-MODEROUT-RISKROUT-TUW-001~005` |
| PACK-R6-09 | `feat/pack-r6-09-ai-features` | 5 | `AI-AIFEAT-SUMM-TUW-001~005` |
| PACK-R6-10 | `feat/pack-r6-10-feedback-eval-mvp` | 6 | `AI-FEEDSTOR-FEEDCAPT-TUW-001~003`, `DEVOPS-EVALHARN-GATEMEAS-TUW-001~003` |
| PACK-R7-01 | `feat/pack-r7-01-knowledge-graph` | 8 | `GRAPH-*` R7 rows |
| PACK-R8-01 | `feat/pack-r8-01-contract-parsing-playbook` | 6 | `CONTRACT-CLASSIFY-TUW-001` through `CONTRACT-PLAYBOOK-TUW-001` |
| PACK-R8-02 | `feat/pack-r8-02-contract-rule-ui-gate` | 6 | `CONTRACT-PLAYBOOK-TUW-002` through `CONTRACT-GATE-REPORT-TUW-001` |
| PACK-R9-01 | `feat/pack-r9-01-dd-vault` | 8 | `DD-RFI-CORE-TUW-001` through `DD-GATE-REPORT-TUW-008` (`docs/execution/TUW_R9_DD_VAULT.md`) |
| PACK-R10-01 | `feat/pack-r10-01-litigation-vault` | 8 | `LIT-EVID-REG-TUW-001` through `LIT-GATE-REPORT-TUW-008` (`docs/execution/TUW_R10_LITIGATION_VAULT.md`) |
| PACK-R11-01 | `feat/pack-r11-01-external-core` | 5 | `EXT-USER-TUW-001` through `EXT-NDA-TUW-005` (`docs/execution/TUW_R11_EXTERNAL_CORE.md`) |
| PACK-R11-02 | `feat/pack-r11-02-external-portal-gate` | 5 | `EXT-DLP-WARN-TUW-001` through `EXT-GATE-REPORT-TUW-001` (`docs/execution/TUW_R11_EXTERNAL_PORTAL_GATE.md`) |
| PACK-R12-01 | `feat/pack-r12-01-records-governance` | 8 | `RECORD-RETENTION-TUW-001` through `RECORD-GATE-REPORT-TUW-001` (`docs/execution/TUW_R12_RECORDS_GOVERNANCE.md`) |
| PACK-R13-01 | `feat/pack-r13-01-enterprise-hardening` | 8 | `ENT-SSO-SAML-TUW-001` through `ENT-GATE-REPORT-TUW-001` (`docs/execution/TUW_R13_ENTERPRISE_HARDENING.md`) |
| PACK-R14-01 | `feat/pack-r14-01-scale-learning` | 8 | `SCALE-PERF-BENCH-TUW-001` through `SCALE-GATE-REPORT-TUW-001` (`docs/execution/TUW_R14_SCALE_LEARNING.md`) |
| PACK-R14-02 | `feat/pack-r14-02-control-plane-recovery` | 4 | `DEVOPS-EXECCTRL-PARSE117-TUW-001` through `DEVOPS-EXECCTRL-TRANSITION-TUW-004` (recovery-plan Task 4 then Task 5 only) |
| PACK-R14-03 | `feat/pack-r14-03-recovery-manifest` | 3 | `RECOVERY-MANIFEST-SCHEMA-TUW-001` through `RECOVERY-MANIFEST-REGISTRATION-TUW-003` (recovery-plan Task 6B only) |
| PACK-R14-03-AMENDMENT-01 | `feat/pack-r14-03-recovery-manifest-v2` | 3 | `RECOVERY-MANIFEST-HISTORY-SOURCE-TUW-004` through `RECOVERY-MANIFEST-AMENDMENT-VALIDATION-TUW-006` (Task 7+ preflight correction only) |

## PACK-R14-02 — 117-row control-plane recovery

Status: owner-approved post-R14 registration and PACK execution. Implementation
remains prohibited only until this registration PR passes its exact-head
technical gates and merges.

Registration authority:

- Registration approval token:
  `OWNER-APPROVAL-PACK-R14-02-REGISTRATION-20260717`.
- Final control authority: owner directives `claude는 전부 생략`,
  `머지도 승인`, and `인간의 승인 필요 없게 진행`.
- Sealed canonical PACK payload SHA-256:
  `32dc34bc28ea6642978098e17a80f33f4c590c49190edcbdf9e2cb03fcfa99d9`.
  This supersedes the original and intermediate review-control clauses only.
- Registration branch: `codex/register-pack-r14-02-control-plane-recovery`.
- Implementation branch: `feat/pack-r14-02-control-plane-recovery`.
- Registration changes only this file and `docs/ledger/decision.md`.
- Risk is `C`; no Claude review, human review, human approval, or
  `needs-human-review` label is required. Codex may mechanically merge the
  registration and implementation PRs only after every required automated and
  deterministic technical gate passes against the exact head SHA.

Exact objective: Restore a deterministic 117-row execution control plane and
enforce mutation-free checking, evidence provenance, structured dependency
validity, and ordered one-row transitions without changing product scope,
migrations, dependencies, or docs/package.

The PACK contains four normal-size TUWs and has no count exception. They execute
serially in this exact order:

1. `DEVOPS-EXECCTRL-PARSE117-TUW-001`
2. `DEVOPS-EXECCTRL-ACTIVE117-TUW-002`
3. `DEVOPS-EXECCTRL-PROVENANCE-TUW-003`
4. `DEVOPS-EXECCTRL-TRANSITION-TUW-004`

### DEVOPS-EXECCTRL-PARSE117-TUW-001

- **Title:** Parse both heading grammars with equal-or-higher rank boundaries
  and require the exact 117-ID set.
- **Release / Module / Risk / Size:** `R14 recovery extension` /
  `execution-control` / `C` / `M`.
- **Depends_on:** none.
- **Objective:** Replace the structurally incomplete heading scan with one
  rank-aware parser that recognizes the original and Appendix-2 TUW forms,
  isolates every TUW block correctly, and rejects any ID set other than the
  frozen 117.
- **Files create:** `tools/execution/build-tuw-status-ledger.mjs` and
  `tools/execution/build-tuw-status-ledger.spec.mjs`. **Files modify:** none.
- **Files NOT-modify:** `docs/package/**`, `AGENTS.md`, `db/migrations/**`,
  `apps/**`, `packages/**`, `workers/**`, `infra/**`, `.github/**`, `tests/**`,
  `package.json`, `pnpm-lock.yaml`, `docs/ledger/**`, and every path outside
  this TUW's create/modify list.
- **Verification (AND):**
  `node --test --test-name-pattern='heading|boundary|117|H14|B20' tools/execution/build-tuw-status-ledger.spec.mjs`
  exits 0 and proves both grammars, equal-or-higher boundaries, the exact set,
  source refs, and H14/B20 isolation; then
  `git diff --check -- tools/execution/build-tuw-status-ledger.mjs tools/execution/build-tuw-status-ledger.spec.mjs`
  exits 0 and proves the two-file slice has no whitespace error or third path.
- **Edge cases:** missing B19; duplicate C16; an extra TUW ID; a same-rank
  non-TUW heading after B20; a higher-rank heading inside a lower-rank block;
  H14/B15 bleed; B20/post-B20-directive bleed; malformed Appendix horizon or
  optional size.
- **Stop condition:** stop on frozen parser/source-plan hash drift, a required
  dependency/fixture/product/migration/`docs/package` path, a guessed 117-ID
  semantic, an out-of-selector helper, or the same failure three times.
- **Escalation:** preserve the clean candidate and record the scoped reason
  without weakening tests; wait for owner resolution and do not start TUW-002.
- **Evidence target:**
  `.omo/evidence/ulw/amic-vault-117-recovery-20260716/G003-g03-complete-tasks-6a-4-5-and-6b-aft/a1/task-4-amic-vault-117-tuw-recovery-and-merge.txt`.

### DEVOPS-EXECCTRL-ACTIVE117-TUW-002

- **Title:** Create canonical 117 artifacts, preserve immutable 110 history,
  and cut active pointers to validated 117 truth.
- **Release / Module / Risk / Size:** `R14 recovery extension` /
  `execution-control` / `C` / `M`.
- **Depends_on:** `DEVOPS-EXECCTRL-PARSE117-TUW-001`.
- **Objective:** Import the seven registered documentation substrate records,
  generate the canonical 117 policy/overrides/JSON/Markdown outputs, preserve
  all four 110 artifacts byte-for-byte as history, and change only the three
  registered active-pointer surfaces after validation.
- **Files create:** the four 110 history files; the 117 policy, overrides, JSON,
  and Markdown ledger; `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md`;
  `docs/handoff/dms-uplift-2026-07/00_README.md`; and
  `docs/handoff/dms-uplift-2026-07/06_execution-guide.md`.
- **Files modify:** `tools/execution/build-tuw-status-ledger.mjs` and its direct
  spec.
- **Files NOT-modify:** `docs/package/**`, `AGENTS.md`, `db/migrations/**`,
  `apps/**`, `packages/**`, `workers/**`, `infra/**`, `.github/**`, `tests/**`,
  `package.json`, `pnpm-lock.yaml`, `docs/ledger/**`, all 117 TUW bodies and
  post-B20 directives, the four 110 files after exact import, and every path
  outside this TUW's create/modify list.
- **Verification (AND):**
  `node --test --test-name-pattern='artifact|pointer|determin|immutable|count' tools/execution/build-tuw-status-ledger.spec.mjs`
  exits 0; `node tools/execution/build-tuw-status-ledger.mjs` creates exactly
  the four canonical 117 outputs; and
  `node tools/execution/build-tuw-status-ledger.mjs --check` exits 0 without
  writing. Assertions include 38/61/18 and 19/80/11/7 counts, immutable 110
  hashes, pointer cutover, and repeated-generation byte equality.
- **Edge cases:** one changed legacy byte; one stale 110 pointer; pointer change
  before validation; wall-clock output drift; misplaced `UNADJUDICATED`; an
  unrelated handoff edit.
- **Stop condition:** stop before pointer cutover on substrate hash drift,
  out-of-selector edits, a required 110 modification, output/count/determinism
  mismatch, or the same failure three times.
- **Escalation:** retain 110 as active truth, record the exact failed
  hash/count/selector, wait for owner resolution, and do not start TUW-003.
- **Evidence target:** the Task 4 receipt above.

### DEVOPS-EXECCTRL-PROVENANCE-TUW-003

- **Title:** Enforce deterministic metadata, mutation-free check mode, blocker
  semantics, and evidence provenance.
- **Release / Module / Risk / Size:** `R14 recovery extension` /
  `execution-control` / `C` / `L`.
- **Depends_on:** `DEVOPS-EXECCTRL-ACTIVE117-TUW-002`.
- **Objective:** Make generated metadata deterministic, make `--check`
  genuinely mutation-free, and reject invalid statuses, blockers, gaps,
  rationale, or evidence provenance before any completion transition is
  accepted.
- **Files create:** none. **Files modify:** parser, direct spec, 117 policy,
  117 overrides, and generated 117 JSON/Markdown ledgers.
- **Files NOT-modify:** `docs/package/**`, `AGENTS.md`, `db/migrations/**`,
  `apps/**`, `packages/**`, `workers/**`, `infra/**`, `.github/**`, `tests/**`,
  `package.json`, `pnpm-lock.yaml`, `docs/ledger/**`, every 110 artifact,
  `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md`, `docs/handoff/**`, and
  every path outside this TUW's create/modify list.
- **Verification (AND):**
  `node --test --test-name-pattern='check|provenance|blocker|evidence|stale|wrong-SHA|tmp' tools/execution/build-tuw-status-ledger.spec.mjs`
  exits 0; `node tools/execution/build-tuw-status-ledger.mjs --check` changes
  neither content nor mtime; and
  `node --test --test-name-pattern='drift.*zero.write' tools/execution/build-tuw-status-ledger.spec.mjs`
  proves drifted JSON and Markdown fail while all observed hashes and mtimes
  remain invariant.
- **Edge cases:** missing evidence type/ref/hash/timestamp/candidate
  SHA/environment/provenance; stale or wrong-SHA evidence; generated/tmp-only
  support; unresolved policy conflict; invalid blocker or missing refs;
  `EXTERNAL_BLOCKED` treated as complete; one-surface drift.
- **Stop condition:** stop on ambiguous schema/accepted-blocker semantics, any
  `--check` write, fail-open validation, private evidence dereference, a new
  dependency, or the same failure three times.
- **Escalation:** leave the row unchanged, record opaque refs/hashes and the
  validator code only, and do not promote/demote, weaken validation, or start
  TUW-004.
- **Evidence target:**
  `.omo/evidence/ulw/amic-vault-117-recovery-20260716/G003-g03-complete-tasks-6a-4-5-and-6b-aft/a1/task-5-amic-vault-117-tuw-recovery-and-merge.txt`.

### DEVOPS-EXECCTRL-TRANSITION-TUW-004

- **Title:** Normalize dependencies and enforce ordered one-row transition
  journal replay.
- **Release / Module / Risk / Size:** `R14 recovery extension` /
  `execution-control` / `C` / `M`.
- **Depends_on:** `DEVOPS-EXECCTRL-PROVENANCE-TUW-003`.
- **Objective:** Normalize every dependency into a typed resolvable record and
  make a single ordered transition journal the replayable authority for one-row
  changes and validated 3-8 TUW aggregate deltas.
- **Files create:**
  `docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_TRANSITION_JOURNAL.json`.
- **Files modify:** parser, direct spec, 117 policy/overrides/generated
  JSON/Markdown, and only the final `docs/ledger/execution.md` EOF receipt.
- **Files NOT-modify:** `docs/package/**`, `AGENTS.md`, `db/migrations/**`,
  `apps/**`, `packages/**`, `workers/**`, `infra/**`, `.github/**`, `tests/**`,
  `package.json`, `pnpm-lock.yaml`, all 110 artifacts, the H1-H3 source plan,
  `docs/handoff/**`, `docs/ledger/decision.md`, this PACK registry, every other
  ledger path/hunk, and every path outside this TUW's create/modify list.
- **Verification (AND):**
  `node --test --test-name-pattern='dependency|journal|transition|replay|A10|A7|UNADJUDICATED' tools/execution/build-tuw-status-ledger.spec.mjs`
  exits 0 and proves typed/resolved dependencies, ordered one-row entries,
  aggregate replay, and transitional bounds;
  `node tools/execution/build-tuw-status-ledger.mjs --check` exits 0 without
  mutation; and `git diff --check` exits 0.
- **Edge cases:** bare/duplicate/self/unresolved dependency; A10 before A9; A7
  while A6 is blocked; invalid accepted `EXTERNAL_BLOCKED`; unordered multi-row
  promotion; replay mismatch; final or misplaced `UNADJUDICATED`; non-EOF
  execution-ledger change.
- **Stop condition:** stop on guessed dependency normalization, ambiguous
  journal/replay/delta semantics, an existing-line or dirty-E8 ledger import,
  a missing, failing, stale, or invalidated technical gate, or the same failure
  three times.
- **Escalation:** preserve the last accepted aggregate, append only an approved
  BLOCKED reason, resolve the technical blocker, never bypass a failing gate,
  and do not start Task 6B.
- **Evidence target:** the Task 5 receipt above.

### Frozen G002 substrate

These eight whole-file atomic records are consumed exactly once. Their original
owners remain provenance; this routing exception does not complete or reassign
any G002 TUW. Task 6B must mark their ordinals/fingerprints consumed.

| Path | Ordinal | Path digest | Fingerprint | Content SHA-256 | G002 owner |
|---|---:|---|---|---|---|
| `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_EXECUTION_POLICY.md` | 4689 | `beeafadba8ae797eff17751bac64c232d25904f2f02bfb20f7e5de0809d9c0b8` | `028106220093bd458439e1d5c4b14bddd223c739874fb769cc0ce73e28ee85d5` | `5c8f40f9f093535f5a7a438a98335552c7e937aa6e5a8301ecf20a55a16a6040` | C13 |
| `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.json` | 4690 | `97bd0568fd12d080f10e90a6f1f80a58afc3bdc389d54cf45541dfed2766d1ed` | `e391ffddf9759aa113f89c883c9fe1408978e6db51c6dda0bcdd12fbf99ca898` | `36004dc408cbf6c3164bdde6ab80d90312b539e0c6e1a7b5c340eca6243febb7` | C6 |
| `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.md` | 4691 | `256c03f0ba2bd1da5fff77c1c8baa95bd50f4ae31ed310bdb208d09c95c3bceb` | `ef0ea07f7e269eb9111d22b106b704a4251b94f35998bab2102d861e2bae1662` | `bf5fe7cb3d956a64b0cfff818bf9f4d7386ff21254d42c519a879980b31586e2` | C15 |
| `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json` | 4692 | `8a5f3e634f35f67bbb2d54e988316b60f7ac4d3e8944f3d69bbbaa9f01d09ee2` | `99dc58075b2abfa54f3546e85e4087f68f4884c75664b2e51f20780e2478f276` | `b94e141ab1fd796884c2d452e2da14d4f9a43b69fdbb5d07f7cf178f2bd7711a` | B6 |
| `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md` | 4693 | `229abfe8db90a6c4e6c13018fa295fd562f3e090b9cb07105d7aeec9ae23a2bc` | `c0f8bf6027ff73b9f41756f1011eafe44b8826b2915d1d9f20ec5c2910954d1f` | `ee05e4e3e453fab573a8e99153eaeb3bca610e80ecc4d42b15a4491dff5474b1` | B2 |
| `docs/handoff/dms-uplift-2026-07/00_README.md` | 4695 | `f7eb7f15c8ef1664200d5e2ec568f467f58437ef848c07ff781dc3dc27b0a5cc` | `cadaa977ca540ed86451413922e3308e800bcd29c9889a8132d80a812c5f9f46` | `8a15f67522a64ac1e5c83f61abdd9343de03daa6fd9f0e55f0cc279a57df82d2` | HISTORICAL-HANDOFF-BASE |
| `docs/handoff/dms-uplift-2026-07/06_execution-guide.md` | 4701 | `3856a9c534232f55589e4e30e82a776b047655d97cb6c96f58a48504aa498e31` | `c2f98068bfa92520c4b668bbaad407f44583538154b7430408c5755a4bbdd19c` | `ad6699d98a27dddfdad3ee60ada26eb6cceb24e44bea8711428cfd203596d18c` | HISTORICAL-HANDOFF-BASE |
| `tools/execution/build-tuw-status-ledger.mjs` | 4768 | `1808a08a4a13b0dbbfc4268646420aafb5ed781a303579560f12b57bf33bbd70` | `429784f848cef1b49fa7edf59758851eb9ad04044609b4128de3930e0afde620` | `90fc49993c01c06f6e338c8330567b6c1dc77230c5097435724cfdd9c1e47720` | C1 |

Frozen selection identity: classification SHA-256
`a17a2b79040cda94a9a77fa4667ad80f295c2a1b3dc820d80918f76cfe0dac74`;
ownership SHA-256
`40489d3b32fd8e1270c33d0a38fea7b739c533cd2194415437e9f6ee291fc4cb`;
117-unit SHA-256
`0df1f6a74f348b12ec7178f9b3fe0771e5a337dae92d21c3c77d1494d00e9e04`;
all-record fingerprint aggregate
`fcd11b64575c6c588484d72e4e5bf5eb78ee250d4381d5fc57b0774800de672a`;
selected tuple aggregate
`cb58efa92256d7d0ba0d417ca3498ea7cb69fe24bea1aa35fed5fb069546b787`.
Coverage is 8/893 paths and 8/4801 ownership records; the other 885 paths and
4793 records are excluded. Selected migrations and `docs/package/**` paths are
both zero.

### Exact implementation diff

The implementation PR must contain exactly these fourteen added paths:

```text
docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_EXECUTION_POLICY.md
docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.json
docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.md
docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_OVERRIDES.json
docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_EXECUTION_POLICY.md
docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.json
docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_LEDGER.md
docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_STATUS_OVERRIDES.json
docs/execution/TUW_INTERNAL_DMS_UPLIFT_117_TRANSITION_JOURNAL.json
docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md
docs/handoff/dms-uplift-2026-07/00_README.md
docs/handoff/dms-uplift-2026-07/06_execution-guide.md
tools/execution/build-tuw-status-ledger.mjs
tools/execution/build-tuw-status-ledger.spec.mjs
```

The sole modified path is `docs/ledger/execution.md`, with only the final PACK
result and `TECHNICAL-VERIFICATION: PACK-R14-02` lines appended at EOF after all
verification gates pass. Any other path, rename, deletion, mode change, symlink,
submodule, binary, or non-EOF ledger hunk rejects.

Semantic selectors are limited to: parser active constants/status maps,
dependency parsing, override/provenance validation, dual-rank scan, exact-set
assertion, deterministic generation/check/replay, and direct-test-driven helpers;
source-plan lines 9-13 and 40-45; handoff README lines 8 and 16; and execution
guide line 3. All 117 TUW bodies/post-B20 directives and all four imported 110
artifacts remain byte-identical.

Fixed outputs are exactly 117 unique rows; H1/H2/H3 = 38/61/18; status counts =
19 `COMPLETE_CANDIDATE`, 80 `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE`, 11
`EXTERNAL_BLOCKED`, and 7 `UNADJUDICATED`; the seven new rows are exactly
B15/B16/B17/C16/B18/B19/B20 at source lines
3094/3106/3118/3130/3142/3154/3166. Dependency kinds are
hard/soft/conditional/external and blocker classes are
NONE/POLICY_CONFLICT/OWNER_DECISION/EXTERNAL_EVIDENCE/SOURCE_ACCESS/DEPENDENCY/TOOLING.

### Task 5 technical schema v1

Schema ID: `PACK-R14-02-TASK5-SCHEMA-V1`.

Sealed canonical schema payload SHA-256: `259aab3796b85e88f927318460f3c04a41333008689dc5d1bcd7beb09caf4011`.

Final PACK payload SHA-256: `32dc34bc28ea6642978098e17a80f33f4c590c49190edcbdf9e2cb03fcfa99d9`.

This schema registration is an additional exact-head technical predecessor. The implementation branch must be based or rebased on the merge SHA of this schema-registration change. No Claude review, human review, human approval, or `needs-human-review` disposition is present. No product behavior, migration, dependency, deployment, runtime, or external operation is authorized by this registration.

The complete technical schema wrapper follows and must remain value-identical to the sealed source JSON:

```json
{
  "schemaVersion": "task5-technical-schema-decision-wrapper/v1",
  "schemaId": "PACK-R14-02-TASK5-SCHEMA-V1",
  "sealedPayloadSha256": "259aab3796b85e88f927318460f3c04a41333008689dc5d1bcd7beb09caf4011",
  "schema": {
    "schemaId": "PACK-R14-02-TASK5-SCHEMA-V1",
    "status": "TECHNICAL_SCHEMA_DECIDED",
    "authority": {
      "approvalToken": "OWNER-APPROVAL-PACK-R14-02-REGISTRATION-20260717",
      "ownerDirectives": [
        "PACK-R14-02 진행 승인",
        "순서대로 진행해",
        "claude는 전부 생략",
        "머지도 승인",
        "인간의 승인 필요 없게 진행"
      ],
      "authorityRefs": [
        "docs/execution/PACKS_R4_R14.md:64-399",
        "docs/ledger/decision.md:30",
        "docs/ledger/decision.md:31"
      ],
      "authorityCommit": "2daa27d6ecb959342ecb13396286532e64f54cab",
      "finalPackPayloadSha256": "32dc34bc28ea6642978098e17a80f33f4c590c49190edcbdf9e2cb03fcfa99d9",
      "gateMode": "EXACT_HEAD_TECHNICAL_GATES_ONLY",
      "claudeReviewRequired": false,
      "humanReviewRequired": false,
      "humanApprovalRequired": false,
      "needsHumanReviewLabelRequired": false,
      "mechanicalMergeAllowedOnlyAfterAllExactHeadTechnicalGatesPass": true,
      "allowedGovernanceChangedPaths": [
        "docs/execution/PACKS_R4_R14.md",
        "docs/ledger/decision.md"
      ]
    },
    "canonicalPrimitives": {
      "hash": {
        "type": "object",
        "requiredKeys": [
          "algorithm",
          "value"
        ],
        "additionalProperties": false,
        "algorithmLiteral": "SHA-256",
        "valuePattern": "^[0-9a-f]{64}$"
      },
      "gitSha": {
        "type": "string",
        "pattern": "^[0-9a-f]{40}$"
      },
      "timestamp": {
        "type": "string",
        "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
        "timezone": "UTC",
        "calendarValidationRequired": true
      },
      "stringNormalization": "UNICODE_NFC",
      "canonicalJson": {
        "id": "AMIC-CJSON-1",
        "allowedValues": [
          "null",
          "boolean",
          "string",
          "safe-integer",
          "array",
          "object"
        ],
        "objectKeyOrder": "JAVASCRIPT_UTF16_LEXICAL_ASCENDING",
        "arrayOrder": "PRESERVE",
        "whitespace": "NONE",
        "stringEncoding": "JSON_STRINGIFY_AFTER_NFC",
        "hashTarget": "schema subobject only; wrapper and sealedPayloadSha256 are excluded"
      },
      "generatedJson": {
        "indentSpaces": 2,
        "lineEnding": "LF",
        "terminalLfCount": 1
      },
      "generatedMarkdown": {
        "lineEnding": "LF",
        "terminalLfCount": 1
      }
    },
    "generationMetadata": {
      "generatedAtRule": "generatedAt MUST equal generationMetadata.asOf, and generationMetadata.asOf MUST equal journal.asOf; wall clock access is forbidden",
      "requiredObject": {
        "hashAlgorithm": "SHA-256",
        "sourcePlanSha256": "Hash",
        "overridesSha256": "Hash",
        "transitionJournalSha256": "Hash",
        "asOf": "Timestamp",
        "phase": "BOOTSTRAP_IMPORT|TRANSITION|FINAL_CLOSEOUT"
      },
      "inputHashSemantics": "SHA-256 over exact UTF-8 file bytes",
      "asOfSource": "journal.asOf",
      "asOfMustEqualJournalAsOf": true,
      "asOfRules": {
        "BOOTSTRAP_IMPORT": "journal.asOf MUST equal 2026-07-17T00:00:00.000Z",
        "TRANSITION": "journal.asOf MUST equal latest journal entry.recordedAt",
        "FINAL_CLOSEOUT": "journal.asOf MUST equal closeoutSeal.recordedAt"
      },
      "bootstrapJournalAsOf": "2026-07-17T00:00:00.000Z",
      "currentTimeAccessForbidden": true
    },
    "bootstrap": {
      "bootstrapId": "PACK-R14-02-BOOTSTRAP-117",
      "selectedTupleSha256": {
        "algorithm": "SHA-256",
        "value": "cb58efa92256d7d0ba0d417ca3498ea7cb69fe24bea1aa35fed5fb069546b787"
      },
      "frozenSourceInputSha256": {
        "algorithm": "SHA-256",
        "value": "ee05e4e3e453fab573a8e99153eaeb3bca610e80ecc4d42b15a4491dff5474b1"
      },
      "imported110Hashes": {
        "policy": {
          "algorithm": "SHA-256",
          "value": "5c8f40f9f093535f5a7a438a98335552c7e937aa6e5a8301ecf20a55a16a6040"
        },
        "ledgerJson": {
          "algorithm": "SHA-256",
          "value": "36004dc408cbf6c3164bdde6ab80d90312b539e0c6e1a7b5c340eca6243febb7"
        },
        "ledgerMarkdown": {
          "algorithm": "SHA-256",
          "value": "bf5fe7cb3d956a64b0cfff818bf9f4d7386ff21254d42c519a879980b31586e2"
        },
        "overrides": {
          "algorithm": "SHA-256",
          "value": "b94e141ab1fd796884c2d452e2da14d4f9a43b69fdbb5d07f7cf178f2bd7711a"
        }
      },
      "rowCount": 117,
      "orderedRowIds": [
        "A1",
        "A2",
        "A3",
        "A4",
        "A5",
        "A6",
        "A7",
        "B1",
        "B2",
        "B3",
        "B4",
        "B6",
        "C1",
        "C2",
        "C3",
        "C4",
        "C5",
        "C6",
        "C7",
        "D1",
        "D2",
        "D3",
        "D4",
        "E1",
        "E2",
        "E3",
        "E4",
        "F4",
        "F5",
        "G1",
        "G2",
        "H1",
        "H2",
        "H3",
        "H5",
        "H6",
        "A8",
        "A9",
        "A10",
        "A11",
        "A12",
        "A14",
        "B5",
        "B7",
        "B8",
        "B9",
        "B10",
        "B11",
        "B12",
        "C8",
        "C9",
        "C10",
        "C11",
        "C12",
        "C13",
        "C15",
        "D5",
        "D6",
        "D7",
        "D8",
        "D10",
        "E5",
        "E6",
        "E7",
        "E8",
        "E9",
        "E10",
        "E11",
        "E12",
        "F1",
        "F2",
        "F3",
        "F6",
        "F7",
        "F8",
        "F9",
        "F10",
        "F11",
        "G3",
        "G5",
        "G6",
        "G7",
        "G8",
        "G9",
        "G10",
        "G11",
        "G12",
        "G13",
        "H4",
        "H7",
        "H8",
        "H9",
        "H11",
        "A13",
        "B13",
        "B14",
        "C14",
        "D9",
        "D11",
        "D12",
        "E13",
        "E14",
        "F12",
        "F13",
        "F14",
        "G4",
        "G14",
        "H12",
        "H13",
        "H14",
        "B15",
        "B16",
        "B17",
        "C16",
        "B18",
        "B19",
        "B20"
      ],
      "orderedRowSetSha256": {
        "algorithm": "SHA-256",
        "value": "64228240f540c1687d08fe3ac10de23ad7093d04f446d48e0580ce19c8649d8c"
      },
      "exactIdSetSha256": {
        "algorithm": "SHA-256",
        "value": "eb3fe63aaad2c86ed2b58f7bcf752f7ea5ac9b6d266fb7ba79564a8d3d0e1a82"
      },
      "statusCounts": {
        "COMPLETE_CANDIDATE": 19,
        "LOCAL_IMPLEMENTED_NEEDS_EVIDENCE": 80,
        "EXTERNAL_BLOCKED": 11,
        "UNADJUDICATED": 7
      },
      "validationCounts": {
        "BOOTSTRAP_PREIMAGE": 117,
        "CURRENT_VALIDATED": 0
      },
      "unadjudicatedIds": [
        "B15",
        "B16",
        "B17",
        "C16",
        "B18",
        "B19",
        "B20"
      ],
      "initialRowRules": {
        "validationState": "BOOTSTRAP_PREIMAGE",
        "validatedCandidateSha": null,
        "validationScope": null,
        "evidenceRefs": [],
        "historicalEvidenceRefs": "preserve existing {type,ref,note} records byte-for-byte and order-for-order"
      },
      "preimageOnly": true,
      "bootstrapRowsSatisfyDependencies": false,
      "bootstrapCompleteCandidateIsCurrentCompletion": false,
      "legacyEvidenceMayAppearAsCurrentEvidence": false,
      "autoPromotionAllowed": false,
      "autoDemotionAllowed": false
    },
    "rowState": {
      "requiredAddedFields": {
        "validationState": "BOOTSTRAP_PREIMAGE|CURRENT_VALIDATED",
        "validatedCandidateSha": "GitSha|null",
        "validationScope": "ValidationScope|null",
        "historicalEvidenceRefs": "HistoricalEvidence[]",
        "evidenceRefs": "Evidence[]",
        "blockerClass": "BlockerClass",
        "blockingRefs": "string[]",
        "acceptedBlockers": "AcceptedBlocker[]",
        "dependencyConditions": "DependencyCondition[]"
      },
      "historicalEvidence": {
        "requiredKeys": [
          "type",
          "ref",
          "note"
        ],
        "additionalProperties": false,
        "currentGateWeight": 0
      },
      "validationScope": {
        "requiredKeys": [
          "entries",
          "aggregateSha256"
        ],
        "entryRequiredKeys": [
          "path",
          "mode",
          "contentSha256"
        ],
        "fieldTypes": {
          "entries": "ValidationScopeEntry[]",
          "aggregateSha256": "Hash"
        },
        "modeEnum": [
          "100644",
          "100755",
          "120000",
          "ABSENT"
        ],
        "pathRules": [
          "repo-relative",
          "Unicode NFC",
          "not absolute",
          "no .. segment",
          "sorted ascending",
          "unique",
          "non-empty for CURRENT_VALIDATED"
        ],
        "aggregatePreimage": "for each sorted entry: path + NUL + mode + NUL + content SHA-256 lowercase value or ABSENT + LF",
        "aggregateAlgorithm": "SHA-256"
      },
      "transitionToBootstrapPreimageForbidden": true,
      "currentValidatedRequiresCandidateAndScope": true
    },
    "evidence": {
      "requiredKeys": [
        "type",
        "ref",
        "hash",
        "timestamp",
        "candidateSha",
        "validationScopeDigest",
        "environment",
        "provenance"
      ],
      "additionalProperties": false,
      "typeEnum": [
        "SOURCE",
        "CODE",
        "UNIT_TEST",
        "INTEGRATION_TEST",
        "SECURITY_TEST",
        "AUDIT_TEST",
        "MIGRATION",
        "BUILD",
        "LINT",
        "TYPECHECK",
        "DIAGNOSTIC",
        "MANUAL_QA",
        "RENDERED_QA",
        "PERFORMANCE",
        "EXTERNAL_OPERATION",
        "APPROVAL",
        "ARTIFACT",
        "RELEASE_GATE"
      ],
      "refRules": {
        "minLength": 1,
        "maxLength": 512,
        "semantics": "opaque; Task 5 validator never dereferences it"
      },
      "validationScopeDigest": {
        "type": "Hash",
        "mustEqualRowValidationScopeAggregateSha256": true,
        "mustEqualJournalValidationScopeDigest": true,
        "bootstrapValueAllowed": false,
        "comparison": "exact algorithm and lowercase digest value"
      },
      "environment": {
        "requiredKeys": [
          "class",
          "targetRef",
          "targetHash"
        ],
        "additionalProperties": false,
        "classEnum": [
          "REPO_LOCAL",
          "CI",
          "ISOLATED_DB",
          "LOCAL_WEB",
          "PACKAGED_DESKTOP",
          "STAGING",
          "PRODUCTION",
          "EXTERNAL_PROVIDER",
          "MANUAL_OFFLINE"
        ],
        "targetRef": "non-empty opaque string",
        "targetHash": "Hash|null"
      },
      "provenance": {
        "requiredKeys": [
          "producerKind",
          "producerRef",
          "receiptRef",
          "ownerRole",
          "commandRef",
          "approvalRef",
          "approvalScopeHash",
          "expiresAt",
          "exitCode",
          "expectedCount",
          "passCount",
          "failCount",
          "skipCount",
          "visibility",
          "durability",
          "nonClaims",
          "invalidationTriggers"
        ],
        "additionalProperties": false,
        "producerKindEnum": [
          "COMMAND",
          "TEST_RUNNER",
          "CI_JOB",
          "AGENT",
          "OPERATOR",
          "EXTERNAL_SYSTEM",
          "STATIC_SOURCE",
          "GENERATED_ARTIFACT"
        ],
        "ownerRolePattern": "^[A-Z][A-Z0-9_-]{1,63}$",
        "visibilityEnum": [
          "REPO_SAFE",
          "OPAQUE_PRIVATE"
        ],
        "durabilityEnum": [
          "DURABLE",
          "NON_DURABLE",
          "GENERATED"
        ],
        "invalidationTriggerEnum": [
          "CANDIDATE_SHA_DRIFT",
          "SOURCE_DRIFT",
          "CONFIG_DRIFT",
          "FIXTURE_DRIFT",
          "ARTIFACT_DRIFT",
          "TARGET_DRIFT",
          "APPROVAL_EXPIRY",
          "POST_REVIEW_PUSH",
          "TEST_COUNT_REGRESSION",
          "SKIP_NONZERO"
        ]
      },
      "freshness": {
        "asOfSource": "journal.asOf; generationMetadata.asOf MUST equal it",
        "maxAgeSeconds": 2592000,
        "timestampMustNotExceedAsOf": true,
        "expiresAtMustBeNullOrAfterAsOf": true,
        "candidateShaMustEqualRowValidatedCandidateSha": true,
        "candidateShaMustEqualJournalCandidateSha": true,
        "validationScopeDigestMustEqualRowValidationScopeAggregateSha256": true,
        "validationScopeDigestMustEqualJournalValidationScopeDigest": true,
        "validationScopeMustRecomputeAtCheckedCandidate": true,
        "wallClockForbidden": true
      },
      "testLikeTypes": [
        "UNIT_TEST",
        "INTEGRATION_TEST",
        "SECURITY_TEST",
        "AUDIT_TEST",
        "MIGRATION",
        "BUILD",
        "LINT",
        "TYPECHECK",
        "DIAGNOSTIC",
        "PERFORMANCE",
        "RELEASE_GATE"
      ],
      "testLikeRules": {
        "exitCode": 0,
        "failCount": 0,
        "skipCount": 0,
        "expectedCountEqualsPassPlusFailPlusSkip": true,
        "expectedCountMustBePositive": true
      },
      "approvalOrExternalTypes": [
        "APPROVAL",
        "EXTERNAL_OPERATION"
      ],
      "approvalOrExternalRequiredNonNullFields": [
        "provenance.approvalRef",
        "provenance.approvalScopeHash",
        "provenance.expiresAt"
      ],
      "nonDurableRefClassifier": {
        "mode": "LEXICAL_STRING_ONLY_NO_DEREFERENCE",
        "unicodeNormalization": "NFC",
        "uriSchemeComparison": "ASCII_CASE_INSENSITIVE",
        "segmentBoundaryRequired": true,
        "leadingCurrentDirectorySegmentsIgnored": true,
        "fileUriDisposition": "NON_DURABLE",
        "malformedFileUriDisposition": "NON_DURABLE",
        "fileUriLexicalRules": [
          "any ref whose NFC-normalized scheme is file is NON_DURABLE",
          "scheme recognition is lexical and does not access filesystem, network, DNS, or URI target",
          "query and fragment do not change NON_DURABLE disposition",
          "percent escapes are inspected only as text; malformed escapes fail closed as NON_DURABLE"
        ],
        "posixAbsoluteTemporaryPaths": [
          "/tmp",
          "/private/tmp"
        ],
        "repoRelativeFirstSegments": [
          ".omo",
          "tmp"
        ],
        "pathRules": [
          "exact /tmp or first path segments /tmp/ are NON_DURABLE",
          "exact /private/tmp or first path segments /private/tmp/ are NON_DURABLE",
          "after removing any leading ./ segments, repo-relative first segment .omo is NON_DURABLE",
          "after removing any leading ./ segments, repo-relative first segment tmp is NON_DURABLE",
          "lookalikes such as /tmpx and .omotive are not prefix matches because segment boundaries are mandatory",
          "classification never dereferences the opaque ref"
        ],
        "requiredNonDurableExamples": [
          "/tmp",
          "/tmp/evidence.json",
          "/private/tmp",
          "/private/tmp/evidence.json",
          "tmp/evidence.json",
          ".omo/evidence/receipt.json",
          "./.omo/evidence/receipt.json",
          "file:/tmp/evidence.json",
          "file:///tmp/evidence.json",
          "FILE:///private/tmp/evidence.json",
          "file://localhost/tmp/evidence.json",
          "file://host.example/private/tmp/evidence.json"
        ],
        "requiredBoundaryNonMatches": [
          "/tmpx/evidence.json",
          "/private/tmpx/evidence.json",
          ".omotive/evidence.json",
          "tmpfiles/evidence.json"
        ]
      },
      "generatedProducerRequiresGeneratedDurability": true,
      "completeCandidateRequiresAtLeastOneDurableNonGeneratedEvidence": true,
      "privateEvidenceDereferenceForbidden": true
    },
    "blockers": {
      "classEnum": [
        "NONE",
        "POLICY_CONFLICT",
        "OWNER_DECISION",
        "EXTERNAL_EVIDENCE",
        "SOURCE_ACCESS",
        "DEPENDENCY",
        "TOOLING"
      ],
      "acceptedBlocker": {
        "requiredKeys": [
          "dependencyId",
          "blockerClass",
          "disposition",
          "scope",
          "authorityKind",
          "authorityRef",
          "authorityHash",
          "acceptedAt",
          "expiresAt",
          "candidateSha",
          "validationScopeDigest",
          "nonClaims"
        ],
        "additionalProperties": false,
        "allowedBlockerClasses": [
          "OWNER_DECISION",
          "EXTERNAL_EVIDENCE",
          "SOURCE_ACCESS"
        ],
        "externalBoundaryClassRegistryId": "PACK-R14-02:T5-EXTERNAL-BOUNDARY-BLOCKERS-V1",
        "allowedDependencyKindLiteral": "external",
        "neverAcceptedBlockerClasses": [
          "POLICY_CONFLICT",
          "DEPENDENCY",
          "TOOLING"
        ],
        "neverAcceptedDependencyKinds": [
          "hard",
          "conditional"
        ],
        "fieldTypes": {
          "candidateSha": "GitSha",
          "validationScopeDigest": "Hash",
          "scope": "DEPENDENCY_ORDER_ONLY"
        },
        "dispositionLiteral": "ACCEPT_DEFER",
        "scopeLiteral": "DEPENDENCY_ORDER_ONLY",
        "validationScopeBinding": {
          "type": "Hash",
          "mustEqualAffectedRowValidationScopeAggregateSha256": true,
          "mustEqualJournalValidationScopeDigest": true,
          "candidateShaMustEqualAffectedRowValidatedCandidateSha": true,
          "candidateShaMustEqualJournalCandidateSha": true
        },
        "authorityKindEnum": [
          "DECISION_LEDGER",
          "REGISTERED_PACK"
        ],
        "nonClaimsExact": [
          "NO_EXTERNAL_EXECUTION",
          "NO_GO_LIVE",
          "NOT_COMPLETE"
        ],
        "maxDurationSeconds": 7776000
      },
      "rules": [
        "NONE requires empty blockingRefs and acceptedBlockers",
        "every non-NONE class requires non-empty sorted unique blockingRefs",
        "accepted blockers require blockerClass in registered external-boundary classes OWNER_DECISION, EXTERNAL_EVIDENCE, or SOURCE_ACCESS",
        "accepted blockers apply only to dependencies with kind=external",
        "POLICY_CONFLICT (policy), DEPENDENCY, and TOOLING blocker classes can never be accepted",
        "hard and conditional dependency kinds can never be accepted, whether active or inactive",
        "DEPENDENCY_ORDER_ONLY is the accepted blocker scope literal and is separate from validationScopeDigest",
        "candidateSha and validationScopeDigest must equal the affected row and journal candidate/scope bindings",
        "acceptedAt must precede expiresAt and expiresAt must be after asOf",
        "accepted blocker never makes either row complete",
        "row containing acceptedBlocker cannot be COMPLETE_CANDIDATE",
        "EXTERNAL_BLOCKED is never dependency-complete or product-complete"
      ]
    },
    "dependencies": {
      "recordRequiredKeys": [
        "id",
        "kind",
        "sourceText",
        "resolutionRef"
      ],
      "additionalProperties": false,
      "idPattern": "^(?:[A-H][0-9]+|CAP-[A-Z0-9-]+)$",
      "kindEnum": [
        "hard",
        "soft",
        "conditional",
        "external"
      ],
      "resolutionRefType": "string|null",
      "parser": {
        "splitCommasOnlyAtParenthesisDepth": 0,
        "splitArrowsOnlyAtParenthesisDepth": 0,
        "exactTuwIdDefaultKind": "hard",
        "softMarkers": [
          "소프트",
          "차단 아님"
        ],
        "conditionalMarkers": [
          "조건부",
          "ACTIVE",
          "선택"
        ],
        "externalKindMayBeAssignedOnlyByRegistry": true,
        "heuristicLetterAliasResolutionForbidden": true,
        "duplicateDependencyBehavior": "REJECT",
        "selfDependencyBehavior": "REJECT",
        "unknownIdBehavior": "REJECT",
        "malformedParenthesesBehavior": "REJECT",
        "unregisteredAliasBehavior": "REJECT"
      },
      "semantics": {
        "soft": "does not gate",
        "hard": "requires CURRENT_VALIDATED and COMPLETE_CANDIDATE TUW",
        "conditional": "ACTIVE behaves as hard; missing or unknown condition is ACTIVE",
        "external": "requires current complete TUW or valid accepted blocker",
        "capability": "syntactically resolved but semantically unresolved",
        "hardOrActiveConditionalCapability": "never satisfies completion until a later registered amendment replaces it with a TUW ID"
      },
      "dependencyCondition": {
        "requiredKeys": [
          "dependencyId",
          "state",
          "decisionRef",
          "decisionHash"
        ],
        "additionalProperties": false,
        "stateEnum": [
          "ACTIVE",
          "INACTIVE"
        ],
        "missingStateBehavior": "ACTIVE"
      },
      "aliasRegistryId": "PACK-R14-02:T5-DEPREG-V1",
      "aliasDecisionCount": 17,
      "emittedDependencyRecordCount": 18,
      "aliases": [
        {
          "ordinal": 1,
          "rowId": "D7",
          "sourceLine": 1650,
          "aliasKey": "D7/B-OCR",
          "sourceText": "B(OCR 엔진 — ingestion 워커의 스캔 PDF OCR 스테이지)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:D7/B-OCR",
          "emits": [
            {
              "id": "B1",
              "kind": "hard"
            }
          ]
        },
        {
          "ordinal": 2,
          "rowId": "D8",
          "sourceLine": 1678,
          "aliasKey": "D8/C-OUTLOOK-AUTO-INGEST",
          "sourceText": "C(Outlook Graph 실연동 — 이메일 소스 자동 유입, 소프트 의존: 현행 업로드/파일링 경로만으로 완결 가능)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:D8/C-OUTLOOK-AUTO-INGEST",
          "emits": [
            {
              "id": "CAP-OUTLOOK-GRAPH-AUTO-INGEST",
              "kind": "soft"
            }
          ]
        },
        {
          "ordinal": 3,
          "rowId": "D10",
          "sourceLine": 1706,
          "aliasKey": "D10/E2-GEMMA",
          "sourceText": "E(E2 Gemma 생성·E8 Strong LLM 라우팅 — 답변 생성 품질, 소프트 의존: 기존 로컬 생성 경로로 선출시 가능)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:D10/E2-GEMMA",
          "emits": [
            {
              "id": "E2",
              "kind": "soft"
            }
          ]
        },
        {
          "ordinal": 4,
          "rowId": "D10",
          "sourceLine": 1706,
          "aliasKey": "D10/E8-STRONG-ROUTING",
          "sourceText": "E(E2 Gemma 생성·E8 Strong LLM 라우팅 — 답변 생성 품질, 소프트 의존: 기존 로컬 생성 경로로 선출시 가능)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:D10/E8-STRONG-ROUTING",
          "emits": [
            {
              "id": "E8",
              "kind": "soft"
            }
          ]
        },
        {
          "ordinal": 5,
          "rowId": "E7",
          "sourceLine": 1791,
          "aliasKey": "E7/F-GRAPH-CONFIRMATION",
          "sourceText": "F(그래프 후보 candidate/confirmed 상태 스키마·승인 확정 플로우)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:E7/F-GRAPH-CONFIRMATION",
          "emits": [
            {
              "id": "CAP-GRAPH-CANDIDATE-CONFIRMATION",
              "kind": "conditional"
            }
          ],
          "registeredCondition": {
            "state": "INACTIVE",
            "reason": "E7 scope excludes canonical graph write and confirmation; a scope amendment makes the condition ACTIVE"
          }
        },
        {
          "ordinal": 6,
          "rowId": "E11",
          "sourceLine": 1897,
          "aliasKey": "E11/C-OUTLOOK-THREAD-INGEST",
          "sourceText": "C(Email Vault Outlook Graph 실연동 — 쓰레드 단위 인입 확대)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:E11/C-OUTLOOK-THREAD-INGEST",
          "emits": [
            {
              "id": "CAP-OUTLOOK-GRAPH-THREAD-INGEST",
              "kind": "soft"
            }
          ]
        },
        {
          "ordinal": 7,
          "rowId": "E12",
          "sourceLine": 1919,
          "aliasKey": "E12/G-HIDDEN-ROUTES",
          "sourceText": "G(contracts/dd/litigation hidden-route 봉인 해제·화면 노출)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:E12/G-HIDDEN-ROUTES",
          "emits": [
            {
              "id": "G2",
              "kind": "hard"
            }
          ]
        },
        {
          "ordinal": 8,
          "rowId": "G3",
          "sourceLine": 2204,
          "aliasKey": "G3/B-DIFF",
          "sourceText": "B(문서 버전 비교 diff API/뷰)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:G3/B-DIFF",
          "emits": [
            {
              "id": "B11",
              "kind": "hard"
            }
          ]
        },
        {
          "ordinal": 9,
          "rowId": "G9",
          "sourceLine": 2328,
          "aliasKey": "G9/B-WATERMARK",
          "sourceText": "B(서버사이드 PDF 워터마크 렌더링)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:G9/B-WATERMARK",
          "emits": [
            {
              "id": "B3",
              "kind": "hard"
            }
          ]
        },
        {
          "ordinal": 10,
          "rowId": "B13",
          "sourceLine": 2638,
          "aliasKey": "B13/E-AI-ROUTING",
          "sourceText": "E(Gemma 구조화+Strong LLM 라우팅)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:B13/E-AI-ROUTING",
          "emits": [
            {
              "id": "CAP-AI-STRUCTURED-STRONG-ROUTING",
              "kind": "external"
            }
          ]
        },
        {
          "ordinal": 11,
          "rowId": "B13",
          "sourceLine": 2638,
          "aliasKey": "B13/C-OUTLOOK-SEND",
          "sourceText": "C(Outlook Graph 송부 연동)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:B13/C-OUTLOOK-SEND",
          "emits": [
            {
              "id": "C16",
              "kind": "hard"
            }
          ]
        },
        {
          "ordinal": 12,
          "rowId": "B14",
          "sourceLine": 2662,
          "aliasKey": "B14/F-CLAUSE-SEARCH",
          "sourceText": "F(조항은행 검색 API)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:B14/F-CLAUSE-SEARCH",
          "emits": [
            {
              "id": "F11",
              "kind": "hard"
            }
          ]
        },
        {
          "ordinal": 13,
          "rowId": "D11",
          "sourceLine": 2758,
          "aliasKey": "D11/F-CLAUSE-CORPUS",
          "sourceText": "F(조항은행 — contract-intel 조항 파싱 데이터 적재 확대)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:D11/F-CLAUSE-CORPUS",
          "emits": [
            {
              "id": "CAP-CLAUSE-BANK-PARSED-CORPUS",
              "kind": "hard"
            }
          ]
        },
        {
          "ordinal": 14,
          "rowId": "D12",
          "sourceLine": 2780,
          "aliasKey": "D12/H-LAW-DATA",
          "sourceText": "H(국내 법률데이터 연동 — 국가법령정보센터/판례 API 커넥터)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:D12/H-LAW-DATA",
          "emits": [
            {
              "id": "H12",
              "kind": "hard"
            }
          ]
        },
        {
          "ordinal": 15,
          "rowId": "E13",
          "sourceLine": 2804,
          "aliasKey": "E13/B-EDITING-BASE",
          "sourceText": "B(문서 편집·버전 관리 기반)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:E13/B-EDITING-BASE",
          "emits": [
            {
              "id": "CAP-DOCUMENT-DRAFT-VERSION-PERSISTENCE",
              "kind": "hard"
            }
          ]
        },
        {
          "ordinal": 16,
          "rowId": "E14",
          "sourceLine": 2827,
          "aliasKey": "E14/F-CONFIRMED-FACTS",
          "sourceText": "F(확정 graph facts — candidate→confirmed 승인 플로우)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:E14/F-CONFIRMED-FACTS",
          "emits": [
            {
              "id": "F9",
              "kind": "hard"
            }
          ]
        },
        {
          "ordinal": 17,
          "rowId": "H12",
          "sourceLine": 3004,
          "aliasKey": "H12/F-AUTHORITY-CITATION",
          "sourceText": "F(F1 Authority 노드 타입·F4 Citation Ledger 연결 규약 협의 — 차단 아님)",
          "resolutionRef": "PACK-R14-02:T5-DEPREG-V1:H12/F-AUTHORITY-CITATION",
          "emits": [
            {
              "id": "F1",
              "kind": "soft"
            },
            {
              "id": "F4",
              "kind": "soft"
            }
          ]
        }
      ]
    },
    "journal": {
      "schemaVersion": "tuw-transition-journal/v1",
      "hashAlgorithm": "SHA-256",
      "canonicalization": "AMIC-CJSON-1",
      "authorityMode": "GIT_COMMIT_V1",
      "additionalProperties": false,
      "topLevelRequiredKeys": [
        "schemaVersion",
        "hashAlgorithm",
        "canonicalization",
        "authorityMode",
        "schemaId",
        "finalPackPayloadSha256",
        "authorityCommit",
        "candidateSha",
        "validationScopeDigest",
        "asOf",
        "previousAcceptedJournalHead",
        "bootstrap",
        "genesisHash",
        "entries",
        "closeoutSeal"
      ],
      "headerFieldContract": {
        "schemaVersion": {
          "type": "string",
          "exactValue": "tuw-transition-journal/v1"
        },
        "hashAlgorithm": {
          "type": "string",
          "exactValue": "SHA-256"
        },
        "canonicalization": {
          "type": "string",
          "exactValue": "AMIC-CJSON-1"
        },
        "authorityMode": {
          "type": "string",
          "exactValue": "GIT_COMMIT_V1"
        },
        "schemaId": {
          "type": "string",
          "exactValue": "PACK-R14-02-TASK5-SCHEMA-V1"
        },
        "finalPackPayloadSha256": {
          "type": "Hash",
          "algorithm": "SHA-256",
          "exactValue": "32dc34bc28ea6642978098e17a80f33f4c590c49190edcbdf9e2cb03fcfa99d9"
        },
        "authorityCommit": {
          "type": "GitSha",
          "exactValue": "2daa27d6ecb959342ecb13396286532e64f54cab"
        },
        "candidateSha": {
          "type": "GitSha|null",
          "BOOTSTRAP_IMPORT": null,
          "TRANSITION": "non-null and equal to every entry.candidateSha, affected row.validatedCandidateSha, and evidence.candidateSha",
          "FINAL_CLOSEOUT": "non-null and equal to every entry.candidateSha, closeoutSeal.candidateSha, affected row.validatedCandidateSha, and evidence.candidateSha"
        },
        "validationScopeDigest": {
          "type": "Hash|null",
          "BOOTSTRAP_IMPORT": null,
          "TRANSITION": "non-null and equal to every entry.validationScopeDigest, affected row.validationScope.aggregateSha256, evidence.validationScopeDigest, and acceptedBlocker.validationScopeDigest",
          "FINAL_CLOSEOUT": "non-null and equal to every entry.validationScopeDigest, closeoutSeal.validationScopeDigest, affected row.validationScope.aggregateSha256, evidence.validationScopeDigest, and acceptedBlocker.validationScopeDigest"
        },
        "asOf": {
          "type": "Timestamp",
          "BOOTSTRAP_IMPORT": "2026-07-17T00:00:00.000Z",
          "TRANSITION": "equal to latest entry.recordedAt",
          "FINAL_CLOSEOUT": "equal to closeoutSeal.recordedAt",
          "mustEqualGenerationMetadataAsOf": true
        },
        "previousAcceptedJournalHead": {
          "type": "Hash|null",
          "BOOTSTRAP_IMPORT": null,
          "TRANSITION": "null only when no prior accepted journal exists; otherwise exact prior accepted journal head Hash",
          "FINAL_CLOSEOUT": "exact prior accepted journal head Hash"
        },
        "bootstrap": {
          "type": "object",
          "requiredKeysRef": "journal.bootstrapRequiredKeys"
        },
        "genesisHash": {
          "type": "Hash",
          "ruleRef": "journal.genesisHashRule"
        },
        "entries": {
          "type": "object[]"
        },
        "closeoutSeal": {
          "type": "object|null",
          "BOOTSTRAP_IMPORT": null,
          "TRANSITION": null,
          "FINAL_CLOSEOUT": "non-null"
        }
      },
      "headerBindingRules": [
        "journal.schemaId MUST equal schema.schemaId",
        "journal.finalPackPayloadSha256 MUST be Hash(SHA-256, schema.authority.finalPackPayloadSha256)",
        "journal.authorityCommit MUST equal schema.authority.authorityCommit",
        "BOOTSTRAP_IMPORT requires candidateSha=null, validationScopeDigest=null, previousAcceptedJournalHead=null, entries=[], closeoutSeal=null, and asOf=2026-07-17T00:00:00.000Z",
        "TRANSITION and FINAL_CLOSEOUT require non-null candidateSha and validationScopeDigest",
        "journal candidateSha and validationScopeDigest MUST bind entries, affected rows, evidence, accepted blockers, and closeout seal where present",
        "generationMetadata.asOf and generatedAt MUST equal journal.asOf",
        "previousAcceptedJournalHead refers only to an already accepted prior journal and is never derived from the current journal"
      ],
      "bootstrapRequiredKeys": [
        "bootstrapId",
        "sourcePlanSha256",
        "selectedTupleSha256",
        "imported110Hashes",
        "rowCount",
        "exactIdSetSha256",
        "orderedRowIds",
        "orderedRowSetSha256",
        "statusCounts",
        "baseOverrides",
        "baseOverridesSha256"
      ],
      "bootstrapFieldContract": {
        "bootstrapId": {
          "type": "string",
          "exactValue": "PACK-R14-02-BOOTSTRAP-117"
        },
        "rowCount": {
          "type": "safe-integer",
          "exactValue": 117
        },
        "orderedRowIds": {
          "type": "string[117]",
          "exactValueRef": "schema.bootstrap.orderedRowIds",
          "unique": true,
          "reorderingForbidden": true
        },
        "orderedRowSetSha256": {
          "type": "Hash",
          "algorithm": "SHA-256",
          "exactValue": "64228240f540c1687d08fe3ac10de23ad7093d04f446d48e0580ce19c8649d8c",
          "preimage": "AMIC-CJSON-1 of bootstrap.orderedRowIds with array order preserved"
        },
        "exactIdSetSha256": {
          "type": "Hash",
          "algorithm": "SHA-256",
          "exactValue": "eb3fe63aaad2c86ed2b58f7bcf752f7ea5ac9b6d266fb7ba79564a8d3d0e1a82",
          "preimage": "AMIC-CJSON-1 of a JavaScript UTF-16 lexical ascending copy of bootstrap.orderedRowIds"
        },
        "baseOverrides": {
          "type": "object",
          "binding": "baseOverrides.unitOverrides MUST contain exactly the 117 unique IDs in bootstrap.orderedRowIds; no missing or extra ID"
        },
        "baseOverridesSha256": {
          "type": "Hash",
          "preimage": "AMIC-CJSON-1 of bootstrap.baseOverrides only"
        }
      },
      "genesisHashPreimage": [
        "schemaVersion",
        "hashAlgorithm",
        "canonicalization",
        "authorityMode",
        "schemaId",
        "finalPackPayloadSha256",
        "authorityCommit",
        "candidateSha",
        "validationScopeDigest",
        "asOf",
        "previousAcceptedJournalHead",
        "bootstrap"
      ],
      "genesisHashRule": "SHA-256 of the AMIC-CJSON-1 object containing exactly genesisHashPreimage keys and their journal values; genesisHash, entries, and closeoutSeal are excluded",
      "genesisCircularityForbidden": true,
      "journalHeadRule": "closeoutSeal.sealHash when closeoutSeal is non-null; otherwise final entry.entryHash when entries is non-empty; otherwise genesisHash",
      "snapshotSemantics": {
        "acceptedSnapshotImmutable": true,
        "phaseAdvanceCreatesNewSnapshot": true,
        "newSnapshotRecomputesGenesisAndEntryChain": true,
        "previousAcceptedJournalHeadSource": "journalHeadRule evaluated on the immutable prior accepted snapshot",
        "currentSnapshotHashReferenceForbidden": true
      },
      "entryRequiredKeys": [
        "sequence",
        "transitionId",
        "packId",
        "tuwId",
        "transitionKind",
        "candidateSha",
        "validationScopeDigest",
        "recordedAt",
        "reasonCode",
        "reason",
        "beforeOverrideSha256",
        "afterOverride",
        "afterOverrideSha256",
        "previousEntryHash",
        "entryHash"
      ],
      "transitionKindEnum": [
        "ADJUDICATE",
        "PROMOTE",
        "DEMOTE",
        "BLOCK",
        "UNBLOCK",
        "REVALIDATE"
      ],
      "transitionIdPattern": "^TR-[0-9]{6}$",
      "reasonCodePattern": "^[A-Z][A-Z0-9_]{2,63}$",
      "entryHashRule": "SHA-256 of AMIC-CJSON-1 entry excluding entryHash",
      "entryBindingRules": [
        "entry.candidateSha MUST equal journal.candidateSha",
        "entry.validationScopeDigest MUST equal journal.validationScopeDigest",
        "entry.afterOverride.validatedCandidateSha MUST equal journal.candidateSha",
        "entry.afterOverride.validationScope.aggregateSha256 MUST equal journal.validationScopeDigest",
        "every entry.afterOverride evidence.validationScopeDigest and acceptedBlocker.validationScopeDigest MUST equal journal.validationScopeDigest"
      ],
      "firstPreviousEntryHash": "genesisHash",
      "laterPreviousEntryHash": "previous entry.entryHash",
      "sequenceStartsAt": 1,
      "sequenceContiguous": true,
      "recordedAtStrictlyIncreasing": true,
      "recordedAtMustEqualContainingGitCommitCommitterTimestamp": true,
      "replay": {
        "base": "embedded bootstrap.baseOverrides",
        "beforeHashMustMatch": true,
        "rowReplacementCountPerEntry": 1,
        "topLevelUpdatedAtBecomesRecordedAt": true,
        "validateEntireStateAfterEveryEntry": true,
        "regenerateJsonAndMarkdownAfterEveryEntry": true,
        "finalReplayMustEqualMaterializedOverridesAndBothLedgers": true
      },
      "aggregate": {
        "minTuws": 3,
        "maxTuws": 8,
        "productChangesCommittedBeforeFreeze": true,
        "oneCandidateShaPerPack": true,
        "evidenceCollectedAgainstFrozenCandidate": true,
        "oneJournalEntryAndOneRowOverridePerTransitionCommit": true,
        "controlPlaneOnlyAfterCandidateFreeze": true,
        "noRepeatedRowWithinPack": true,
        "everyPrefixMustValidate": true,
        "promotionsDependencyTopological": true,
        "demotionsReverseDependencySafe": true,
        "candidateToHeadNonControlPlaneDiffForbidden": true
      },
      "closeoutSeal": {
        "requiredKeys": [
          "recordedAt",
          "candidateSha",
          "validationScopeDigest",
          "disposition",
          "entryCount",
          "finalEntryHash",
          "finalOverridesSha256",
          "finalRowsSha256",
          "statusCounts",
          "unresolvedDependenciesSha256",
          "blockersSha256",
          "validationFindingsSha256",
          "previousEntryHash",
          "sealHash"
        ],
        "dispositionEnum": [
          "COMPLETE",
          "BLOCKED"
        ],
        "sealHashRule": "SHA-256 of AMIC-CJSON-1 closeout seal excluding sealHash",
        "bindingRules": [
          "candidateSha MUST equal journal.candidateSha",
          "validationScopeDigest MUST equal journal.validationScopeDigest",
          "recordedAt MUST equal journal.asOf",
          "entryCount MUST equal journal.entries.length",
          "finalEntryHash and previousEntryHash MUST equal the final replay chain head",
          "statusCounts MUST equal the replayed 117-row status counts"
        ],
        "separateControlPlaneOnlyCommit": true
      },
      "selfReferenceAvoidance": [
        "journal entries and closeout seal contain no generated ledger hash",
        "generated ledger may contain exact journal file hash",
        "schema wrapper hash covers schema subobject only",
        "genesisHash preimage contains exactly declared immutable header fields and bootstrap, excluding genesisHash, entries, and closeoutSeal",
        "bootstrap.baseOverridesSha256 hashes bootstrap.baseOverrides only",
        "bootstrap.orderedRowSetSha256 hashes bootstrap.orderedRowIds only",
        "previousAcceptedJournalHead is an external prior accepted head and never the current genesisHash, entryHash, closeout sealHash, or generated ledger hash"
      ]
    },
    "phases": {
      "derivedRules": {
        "BOOTSTRAP_IMPORT": "entries.length=0 and closeoutSeal=null",
        "TRANSITION": "entries.length>0 and closeoutSeal=null",
        "FINAL_CLOSEOUT": "closeoutSeal is valid"
      },
      "unadjudicatedRules": [
        "allowed only for B15,B16,B17,C16,B18,B19,B20",
        "allowed only while validationState=BOOTSTRAP_PREIMAGE",
        "forbidden in every afterOverride",
        "count must be zero at FINAL_CLOSEOUT"
      ],
      "currentCompleteRules": [
        "remainingGaps is empty",
        "blockerClass is NONE",
        "acceptedBlockers is empty",
        "current durable evidence exists",
        "all gating dependencies are satisfied",
        "statusRationale is non-empty",
        "candidate and validation-scope digests match"
      ],
      "currentNonCompleteRules": [
        "remainingGaps is non-empty",
        "statusRationale is non-empty",
        "nextAction is non-empty"
      ],
      "closeoutRules": {
        "allRowsCurrentValidated": true,
        "rowCount": 117,
        "unadjudicatedCount": 0,
        "COMPLETE": "every row is COMPLETE_CANDIDATE",
        "BLOCKED": "honest non-complete rows allowed only with gaps, rationale, and next action"
      },
      "bootstrapDefectRules": [
        "bootstrap A6/A7 and A10/A9 labels are inert",
        "CURRENT_VALIDATED COMPLETE_CANDIDATE A7 with blocked A6 is rejected",
        "CURRENT_VALIDATED COMPLETE_CANDIDATE A10 with non-complete A9 is rejected"
      ]
    },
    "checkMode": {
      "cli": "node tools/execution/build-tuw-status-ledger.mjs --check",
      "pipeline": [
        "parse",
        "normalize",
        "verify bootstrap",
        "replay journal",
        "validate entire state",
        "render JSON and Markdown in memory",
        "compare exact bytes independently"
      ],
      "forbiddenOperations": [
        "mkdir",
        "write",
        "rename",
        "temporary-file creation",
        "chmod",
        "touch",
        "utimes"
      ],
      "forbiddenOnMissingFileOrFailure": true,
      "contentInvariant": true,
      "mtimeInvariant": true,
      "directoryEntryInvariant": true,
      "gitStateInvariant": true
    },
    "validatorContract": {
      "output": "exactly one safe JSON line",
      "failureShape": {
        "ok": false,
        "code": "E_*",
        "rowId": null,
        "sequence": null,
        "path": null,
        "writes": 0
      },
      "successShape": {
        "ok": true,
        "code": "CHECK_OK",
        "phase": "BOOTSTRAP_IMPORT|TRANSITION|FINAL_CLOSEOUT",
        "rowCount": 117,
        "journalEntries": 0,
        "writes": 0
      },
      "schemaDecisionArtifactValidator": {
        "implementation": "validate-task5-technical-schema-decision-v1.mjs",
        "successCode": "TASK5_SCHEMA_VALID",
        "adversarialSelfTestCount": 7,
        "adversarialSelfTestIds": [
          "EVIDENCE_SCOPE_REQUIRED_KEY_REMOVED",
          "EVIDENCE_SCOPE_BINDING_CHANGED",
          "ACCEPTED_BLOCKER_SCOPE_REQUIRED_KEY_REMOVED",
          "JOURNAL_HEADER_REQUIRED_KEY_REMOVED",
          "JOURNAL_HEADER_AUTHORITY_CHANGED",
          "JOURNAL_GENESIS_SCOPE_BINDING_REMOVED",
          "JOURNAL_ASOF_METADATA_BINDING_CHANGED"
        ],
        "readOnly": true,
        "writes": 0
      },
      "exitCodeClasses": {
        "30": "E_SCHEMA_*",
        "31": "E_BOOTSTRAP_*",
        "32": "E_METADATA_*",
        "33": "E_EVIDENCE_*",
        "34": "E_DEPENDENCY_*",
        "35": "E_BLOCKER_*",
        "36": "E_JOURNAL_*",
        "37": "E_REPLAY_*",
        "38": "E_TRANSITION_*|E_PHASE_*",
        "39": "E_DRIFT_*",
        "40": "E_SCOPE_*"
      },
      "validationOrder": [
        "schema",
        "bootstrap",
        "metadata",
        "alias registry",
        "dependencies",
        "blockers",
        "evidence",
        "journal chain",
        "prefix replay",
        "phase",
        "rendered-byte drift"
      ],
      "errorCodes": [
        "E_SCHEMA_SHAPE",
        "E_SCHEMA_TIMESTAMP",
        "E_SCHEMA_HASH",
        "E_SCHEMA_GIT_SHA",
        "E_BOOTSTRAP_IDENTITY",
        "E_BOOTSTRAP_NOT_CURRENT",
        "E_METADATA_CLOCK",
        "E_EVIDENCE_LEGACY_CURRENT",
        "E_EVIDENCE_SCHEMA",
        "E_EVIDENCE_STALE",
        "E_EVIDENCE_WRONG_SHA",
        "E_EVIDENCE_SCOPE_DRIFT",
        "E_EVIDENCE_NON_DURABLE",
        "E_EVIDENCE_TEST_COUNTS",
        "E_DEPENDENCY_ALIAS",
        "E_DEPENDENCY_DUPLICATE",
        "E_DEPENDENCY_SELF",
        "E_DEPENDENCY_UNKNOWN",
        "E_DEPENDENCY_CYCLE",
        "E_DEPENDENCY_CAPABILITY_UNRESOLVED",
        "E_DEPENDENCY_CONDITION_UNKNOWN",
        "E_DEPENDENCY_GATE",
        "E_BLOCKER_ACCEPTANCE",
        "E_BLOCKER_HARD_NOT_ACCEPTABLE",
        "E_BLOCKER_POLICY_CONFLICT",
        "E_BLOCKER_SCOPE_DRIFT",
        "E_BLOCKER_NOT_COMPLETE",
        "E_JOURNAL_HEADER",
        "E_JOURNAL_GENESIS",
        "E_JOURNAL_SEQUENCE",
        "E_JOURNAL_CHAIN",
        "E_JOURNAL_HASH",
        "E_TRANSITION_MULTI_ROW",
        "E_TRANSITION_INVALID",
        "E_REPLAY_MISMATCH",
        "E_PHASE_UNADJUDICATED",
        "E_PHASE_CLOSEOUT",
        "E_DRIFT_JSON",
        "E_DRIFT_MARKDOWN",
        "E_CHECK_WRITE",
        "E_SCOPE_COMMIT",
        "E_SCOPE_PACK_SIZE"
      ],
      "adversarialSelfTests": {
        "executionMode": "IN_MEMORY_ONLY_NO_FILESYSTEM_WRITE",
        "allMutationsMustReject": true,
        "mutations": [
          {
            "id": "EVIDENCE_SCOPE_REQUIRED_KEY_REMOVED",
            "target": "evidence.requiredKeys.validationScopeDigest",
            "expectedCheck": "evidence_required_keys"
          },
          {
            "id": "EVIDENCE_SCOPE_BINDING_CHANGED",
            "target": "evidence.validationScopeDigest.mustEqualRowValidationScopeAggregateSha256",
            "expectedCheck": "evidence_scope_row_binding"
          },
          {
            "id": "ACCEPTED_BLOCKER_SCOPE_REQUIRED_KEY_REMOVED",
            "target": "blockers.acceptedBlocker.requiredKeys.validationScopeDigest",
            "expectedCheck": "accepted_blocker_required_keys"
          },
          {
            "id": "JOURNAL_HEADER_REQUIRED_KEY_REMOVED",
            "target": "journal.topLevelRequiredKeys.schemaId",
            "expectedCheck": "journal_top_level_required_keys"
          },
          {
            "id": "JOURNAL_HEADER_AUTHORITY_CHANGED",
            "target": "journal.headerFieldContract.authorityCommit.exactValue",
            "expectedCheck": "journal_authority_commit_binding"
          },
          {
            "id": "JOURNAL_GENESIS_SCOPE_BINDING_REMOVED",
            "target": "journal.genesisHashPreimage.validationScopeDigest",
            "expectedCheck": "journal_genesis_preimage"
          },
          {
            "id": "JOURNAL_ASOF_METADATA_BINDING_CHANGED",
            "target": "generationMetadata.asOfMustEqualJournalAsOf",
            "expectedCheck": "metadata_journal_asof_binding"
          }
        ]
      },
      "deterministicFirstFailure": "canonical 117 row order, source dependency order, fixed validationOrder"
    },
    "prohibitions": [
      "no product behavior authorization",
      "no external operation authorization",
      "no product, migration, dependency, deployment, or runtime change",
      "no evidence fabrication or synthetic provenance",
      "no private evidence dereference",
      "no legacy evidence as current proof",
      "no hard or conditional dependency blocker acceptance",
      "no auto-promotion",
      "no unexplained auto-demotion",
      "no arbitrary override as proof",
      "no hard or active-conditional CAP completion",
      "no EXTERNAL_BLOCKED completion claim",
      "no generated or temporary-only completion support",
      "no check-mode mutation",
      "no docs/package change",
      "no change outside the two governance paths when this decision is registered"
    ],
    "remainingNonDelegableChoices": [
      "CAP-CLAUSE-BANK-PARSED-CORPUS remains hard-unsatisfied until a later registered product decision",
      "CAP-DOCUMENT-DRAFT-VERSION-PERSISTENCE remains hard-unsatisfied until a later registered product decision",
      "CAP-AI-STRUCTURED-STRONG-ROUTING remains external and default-blocked",
      "real evidence values, hashes, approvals, and environment receipts cannot be synthesized",
      "Task 6B must provide exact validation-scope entries",
      "future E7 canonical graph mutation requires activation and resolution of CAP-GRAPH-CANDIDATE-CONFIRMATION"
    ],
    "decisionLedgerAppend": "- 2026-07-17 PACK-R14-02 Task 5 technical-schema decision: under the owner's recorded technical-gates-only authority, `PACK-R14-02-TASK5-SCHEMA-V1` adopts deterministic SHA-256/RFC3339 evidence and metadata, opaque no-dereference provenance, 30-day deterministic journal-asOf freshness, scope-digest candidate binding, dependency-order-only accepted blockers that never satisfy hard completion, the exact 17-entry dependency-alias registry with fail-closed unresolved `CAP-*` identifiers, a Git-commit-authorized SHA-256 transition-journal v1 with one-row prefix replay and 3-8-row aggregate validation, and derived BOOTSTRAP_IMPORT/TRANSITION/FINAL_CLOSEOUT phases; legacy 110 evidence is preserved only as historical evidence and the fixed 19/80/11/7 snapshot is a sealed inert bootstrap preimage, never current completion; no Claude review, human review, human approval, product behavior, external operation, evidence fabrication, private-evidence dereference, dependency implementation, promotion, or completion is authorized by this schema decision."
  }
}
```


### PACK governance, verification, and rollback

Predecessors are G001 completion; G002 C001/C002/C003 PASS and checkpoint
completion; the exact registration token and its earlier registration-only PR
changing exactly two files whose exact-head technical gates passed; merge of
that earlier registration PR; this additional Task 5 technical-schema
registration and its schema-registration PR whose exact-head technical gates
passed; merge of that schema-registration PR; and an implementation branch
based or rebased on the exact schema-registration merge SHA in a clean
worktree. The recorded PACK-R14-02 execution and technical-gates-only directives
authorize implementation without a separate review or approval gate.

PACK-level NOT-modify paths are `docs/package/**`, `db/migrations/**`,
`apps/**`, `packages/**`, `workers/**`, `infra/**`, `.github/**`, `tests/**`,
`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`,
`AGENTS.md`, this registry and the Decision Ledger on the implementation branch,
every other ledger path/hunk, every `.omo/**` Git path, every non-selected G002
overlay path, all private analysis artifacts, and the four 110 files after
import. Product, migration, dependency, deployment, runtime, and external-state
changes are not registered.

Focused verification is exact:

```bash
node --test tools/execution/build-tuw-status-ledger.spec.mjs
node tools/execution/build-tuw-status-ledger.mjs
node tools/execution/build-tuw-status-ledger.mjs --check
```

Clean-candidate regression is exact:

```bash
corepack pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm backlog:validate
pnpm docs:frozen
python3 -m pip install -e 'workers/ingestion[test]'
python3 -m pytest workers/ingestion/tests
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback
pnpm db:migrate
pnpm db:seed
pnpm test:integration
git diff --check
```

Scope validation requires exactly fourteen `A` paths and the sole EOF-only `M`
path, zero `docs/package/**` and migration diff, immutable 110 hashes, a clean
staged secret/private-data scan, original dirty-worktree invariance, and cleanup.
Required adversarial cases cover missing/duplicate/extra IDs, boundary bleed,
bare or invalid dependencies, A10-before-A9, A7-with-blocked-A6, generated drift,
missing/stale/wrong-SHA/tmp-only provenance, invalid blockers, unordered
transitions, one extra overlay path, frozen-package/migration drift, and a
changed legacy byte.

Before merge, rollback means close or block the isolated implementation PR and
leave the original checkout, main, registration, frozen package, database, and
runtime untouched. After merge but before descendants, a separately reviewed
rollback PR reverts the exact PACK as one unit, removes all fourteen added paths,
and appends rollback truth while retaining this historical authorization. If
Task 6B or descendants started, invalidate/replan them before rollback. Database
rollback is not applicable because database scope is zero.

Stop the PACK on any of these exact conditions:

- owner approval token absent, changed, or narrower than this exact proposal
- Decision Ledger or live extension registration absent or unmerged
- implementation branch not based on the exact clean registration merge SHA
- frozen G002 manifest, tuple aggregate, path digest, fingerprint, content hash,
  or original invariance mismatch
- required change outside semantic hunk or path allowlists
- required change to docs/package, AGENTS, product code, migration, dependency,
  deployment, or external state
- missing fixture, unclear schema, unresolved dependency, invalid evidence, or
  policy conflict
- Risk=C required automated or deterministic technical gate absent, failing,
  stale, or invalidated by a later push
- same failure repeated three times

## PACK-R14-03 — Post-R14 recovery execution manifest

Status: authorized technical-gates-only Task 6B registration. This PACK records
the complete downstream execution map; it does not execute any mapped product
change or migration.

Registration authority and immutable anchors:

- Authority ref: `TASK6B-TECHNICAL-GATES-AUTHORITY-20260717`, derived from the
  operator's recorded sequential-execution, no-Claude, merge, and
  no-human-approval directives for this aggregate goal.
- Exact base: `566fd7399d2a22946a621f37e8f452bd444a9cc8`.
- Branch: `feat/pack-r14-03-recovery-manifest`.
- Canonical machine-readable manifest:
  `docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json`.
- Human-readable index:
  `docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md`.
- Canonical payload SHA-256:
  `7ef34a0e7d0198df621b49d7bd6e2d39e76f8521c0a7799101e443dd47e7eda6`.
- Sealed source hashes and original-overlay preservation anchors are embedded in
  the canonical manifest and checked by its validator without publishing the
  private source artifacts.

This registration PACK contains exactly three TUWs, executed in order:

1. `RECOVERY-MANIFEST-SCHEMA-TUW-001` — generate the repo-safe schema and exact
   mapping from the sealed G002 sources.
2. `RECOVERY-MANIFEST-VALIDATION-TUW-002` — enforce complete coverage,
   dependency, overlap, migration, trigger, review, and authority invariants.
3. `RECOVERY-MANIFEST-REGISTRATION-TUW-003` — register the validated payload and
   append its Decision/Execution Ledger receipts.

The payload maps exactly 117 primary TUW IDs once, all 893 dirty paths, all
4,801 ownership records, and all 86 source migrations. It defines 43 unique
downstream PACKs, `PACK-R14-04` through `PACK-R14-46`; every PACK has 3-8 TUWs,
a unique `feat/pack-r14-NN-*` branch, exact predecessor edges, files and shared
hunk selectors, migration source/target ordinals, risk/reviewer policy, focused
and regression commands, evidence targets, and stop conditions. The JSON
manifest is canonical when this prose and the JSON differ.

Migration filenames in the dirty overlay are not topologically mergeable as
written because source `0094` belongs to H11 while H11 hard-depends on C11. The
manifest therefore preserves all 86 source mappings but plans contiguous target
ordinals `0094` through `0179` in dependency/PACK order; 84 filenames require
renumbering. This is a planning decision only. Each later migration PACK must
land its assigned migrations with reference updates and fresh isolated
up/down/up, seed, and full integration proof. PACK-R14-03 neither changes nor
lands a migration and performs no downstream or production migration execution;
disposable isolated verification of the already committed migrations is an
allowed technical gate.

Conditional units D9, H14, and B20 remain `INACTIVE` with null approval refs.
They may not execute or promote until a separate manifest amendment records
`ACTIVE` and a nonempty approval ref. Risk C/H PACKs require independent Codex
review and exact-head automated/deterministic gates; other PACKs require their
recorded deterministic gates. Claude and human waits are waived only under the
recorded aggregate-goal authority. Any later push invalidates the review and
gate receipts.

PACK-R14-03 may create only:

- `docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json`
- `docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md`
- `tools/execution/build-post-r14-recovery-pack-manifest.mjs`
- `tools/execution/build-post-r14-recovery-pack-manifest.spec.mjs`

It may modify only this registry plus `docs/ledger/decision.md` and the EOF of
`docs/ledger/execution.md`. It may not change `docs/package/**`, `AGENTS.md`,
product code, migrations, dependencies, tests outside the direct validator,
infrastructure, runtime, deployment, external state, the original dirty
checkout, private G001/G002 evidence, or any unlisted path.

Focused verification is exact:

```bash
node tools/execution/build-post-r14-recovery-pack-manifest.mjs --check \
  --source-dir "$G002_SOURCE_DIR"
node --test tools/execution/build-post-r14-recovery-pack-manifest.spec.mjs
```

`G002_SOURCE_DIR` is supplied outside Git and points to the machine-local sealed,
read-only G002 directory; its absolute path is never recorded in committed
artifacts. Exact-head regression also requires frozen
install, lint, typecheck, workspace tests, build, backlog validation, frozen
docs, secret/private-data scan, `git diff --check`, zero `docs/package/**` or
migration diff, original-overlay invariance, and CI success.

Stop on any source hash, base, authority, coverage, PACK-size, branch,
dependency, hunk, path, migration, trigger, reviewer, evidence, allowlist, or
claim-boundary mismatch; on any missing/failing/stale gate; on private evidence
publication; or when the same failure repeats three times. Rollback before
merge closes the isolated PR. Rollback after merge reverts this seven-path
registration as one unit and invalidates every unstarted descendant; no
database rollback applies because PACK-R14-03 has zero database scope.

## PACK-R14-03-AMENDMENT-01 — Recovery manifest v2 correction

Status: authorized technical-gates-only correction required by the Task 7
preflight. This amendment changes the execution map only; it does not execute a
downstream payload or row transition, land a migration, execute a migration
against downstream or production state, deploy, perform an external operation,
release, or go live. Disposable isolated migration verification remains an
allowed technical gate.

Registration authority and immutable anchors:

- Authority ref: `DIRECT-OPERATOR-AGGREGATE-EXECUTION-20260717`, derived from
  the operator's recorded sequential-execution, no-Claude, merge, and
  no-human-approval directives for this aggregate goal.
- Preflight evidence:
  `.omo/evidence/ulw/amic-vault-117-recovery-20260716/G004-g04-complete-tasks-7-12-after-g03-re/a1/PACK-R14-04-MANIFEST-V1-PREFLIGHT-STOP-20260717.md`.
- Exact preimage: `5c722f8a4b1f0a4c99b41089664c98ad151db2b8`.
- Branch: `feat/pack-r14-03-recovery-manifest-v2`.
- Canonical manifest ID: `POST-R14-RECOVERY-PACK-MANIFEST-V2`.
- Canonical payload SHA-256:
  `33b17f509f5bf7e893dbf27ecfe2bf484e5abb5ba1ebe673fe0858224fb5a344`.
- Sealed raw test-anchor source contract SHA-256:
  `b1d4ae82dceb1b337905f725167cef001007c18643be4d985f4d1909fbd99e20`.
- Sealed exact-base collision source contract SHA-256:
  `0a13126c84eb30f53095b4aae2ac0d530419d00fa56aa2a92b6901b7aa524467`.

The v1 validator proved complete coverage of the preserved 893-path overlay,
but Task 7 preflight exposed a separate source class that v1 did not model.
PACK-R14-04 had 19 stale `historical_base` overlay paths and zero overlap with
the five paths changed by the required 19 commits `55f61f0` through `aa50fbc`.
Two of those stale paths were already superseded on main by the 117-row control
plane. PACK-R14-05 also had no registered transition-bookkeeping paths, and
PACK-R14-09 omitted two paths from exact source commit `0b39414`.

Candidate rollover preserves the immutable accepted prefix and its original
validation scopes. Entries introduced after the seal retain the same candidate
binding but carry their own recomputed TUW-specific validation scope digest;
reusing the inherited prefix digest for a different TUW is forbidden.

This amendment contains exactly three TUWs, executed in order:

1. `RECOVERY-MANIFEST-HISTORY-SOURCE-TUW-004` — register the exact 19-commit,
   five-path release-history source and the exact one-commit, four-path LawOS
   source without reclassifying the preserved overlay.
2. `RECOVERY-MANIFEST-CONTROL-PLANE-TUW-005` — separate effective payload,
   overlay, source, candidate-bookkeeping, and four-file one-row transition
   paths; require receipt plus exact EOF execution-ledger append before any
   transition commit and forbid non-control-plane changes afterward.
3. `RECOVERY-MANIFEST-AMENDMENT-VALIDATION-TUW-006` — reject commit/path
   substitution, stale historical-base reactivation, missing receipt/ledger or
   transition paths, wrong ordering, stale evidence routing, and amendment
   authority drift.

The 19 stale historical-base hunks are now quarantined under
`STALE_HISTORICAL_BASE_REPLACED_BY_REGISTERED_GIT_HISTORY_SOURCE`; they remain
losslessly preserved by G001/G002 and may not enter a PACK. Exact-base
reconciliation also proves that six overlay paths originally classified as
untracked creates already exist at the amendment preimage. Four are
byte-identical and two are stale 110-row variants: the H1-H3 plan would replace
the active 117-row pointer with the legacy 110-row pointer, and the 448-line
legacy ledger builder would replace the merged 3,648-line 117-row control-plane
builder. All six are therefore sealed as preservation-only quarantine rather
than recreated or overwritten. Their raw test anchors remain represented by the
collision contract but are not execution commands. Hunk ownership that is
exclusively conditional on inactive D9, H14, or B20 is also quarantined as
`INACTIVE_CONDITIONAL_TRIGGER`. Total quarantine is 196 hunks across 79 dirty
paths while the manifest retains exact 893-path/4,801-hunk coverage. H14 source
migrations 0102 and 0159 remain registered but blocked with no target ordinal;
the 84 active migrations receive contiguous target ordinals 0094 through 0177
in dependency-valid PACK and same-PACK unit-topological order.

Non-overlay Git sources are dependency providers, not informational references.
Every PACK that consumes a Task 7 or Task 8 source path has an explicit
predecessor edge to its source-owning PACK; for example, PACK-R14-29 depends on
PACK-R14-04 for its three Task 7-created documents. Task 8 is PACK-R14-08 and
must finish before Task 12 at PACK-R14-09. Both name A14, but PACK-R14-08 performs
no A14 control-plane transition and PACK-R14-09 performs the single A14
transition only after the LawOS source is present.

PACK-R14-03-AMENDMENT-01 creates no file. It may modify only:

- `docs/execution/PACKS_R4_R14.md`
- `docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json`
- `docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.md`
- `docs/ledger/decision.md`
- the EOF of `docs/ledger/execution.md`
- `tools/execution/build-tuw-status-ledger.mjs`
- `tools/execution/build-tuw-status-ledger.spec.mjs`
- `tools/execution/build-post-r14-recovery-pack-manifest.mjs`
- `tools/execution/build-post-r14-recovery-pack-manifest.spec.mjs`

Standalone validation pins the registered canonical payload SHA-256 and the
sealed 19-row historical-base source contract, derives every PACK TUW role and
transition row from the static blueprint plus the sealed 117-ID universe, and
compares both generated JSON and Markdown in explicit `--committed-only` mode.
A source-bound check additionally rebuilds from the sealed G002 inputs. Bare
`--check`, a missing/empty/nonexistent `--source-dir`, duplicate or unknown
options, multiple action modes, and a `--source-dir`/`--committed-only` conflict
all fail closed; neither valid mode may accept a re-signed, internally
self-consistent drift. Primary hunk ownership remains unique, but transition
authorization is separately sealed in plan order because a TUW can require
fresh adjudication after later evidence, implementation, or authority work.
Task 9 therefore moves all seven Appendix-2 rows out of `UNADJUDICATED`, and
Tasks 15 and 31-38 retain their exact repeated row transitions. An inactive
conditional trigger blocks its hunks, migrations, implementation, and completion
claim; it does not block a journal entry to a non-complete conditional state.
Every raw G002 test anchor is retained with one deterministic disposition:
available at the exact base, supplied by the current PACK, assigned as an exact
planned create of the current owning PACK, supplied by a transitive predecessor,
deferred to another registered provider PACK, an explicitly planned but
not-yet-created acceptance-test gap, blocked behind an inactive conditional
trigger, or a non-executable helper/config anchor. Only the first four
dispositions may enter focused commands. A recognized
executable anchor with no base, provider PACK, alias, or sealed planned-gap entry
fails manifest generation. A mixed active/inactive test file or integration
directory remains executable when the exact base or an active current/predecessor
provider supplies a runnable spec; only an unavailable anchor supplied solely by
an inactive trigger is blocked. Focused paths are routed
one-to-one through their actual workspace/root Vitest, Node test, pytest, or
integration runner. Each path first passes a fail-closed regular-file or
integration-directory assertion, including no-symlink, at-least-one-spec, and
static skip/todo/only/conditional/expected-failure checks, and then receives its
own dedicated runner invocation; OR-style batching is forbidden. Vitest explicitly disables
`passWithNoTests`; Node test, Vitest, pytest, and integration output must report
at least one executed test, every executed test passing, and zero failed,
cancelled, skipped, pending, todo, xfail, xpass, or deselected tests. Focused
runner startup failure also fails closed. Helper-only integration directories
are non-executable. Package commands use the repository-selected pnpm 9.15.9;
an unavailable binary or Node/pnpm engine mismatch fails closed.
Every earlier provider is an explicit predecessor and an owned planned gap is
classified as predecessor-provided in successor PACKs. Frozen dependency
installation and any required Python bootstrap must precede focused execution.
Every generated path is POSIX single-quoted and its exact command must parse
under both Bash and zsh before registration.

Any PACK with integration selectors uses a deterministic PACK-specific compose
project, a single-writer lock, a temporary Compose override that binds every
published PostgreSQL/MinIO/ingestion port to `127.0.0.1`, non-default ports,
database and ingestion worker URLs, and fresh volumes with the canonical
isolated bucket `amic-vault-dev`. It pre-cleans only its exact project, builds
and force-recreates the services with renewed anonymous volumes, applies
migrations and seed data, and runs its focused integration commands. A
status-preserving Bash EXIT trap always runs exact-project
`down -v --remove-orphans --rmi local`, removes the override and lock, preserves
the main failure status, and makes cleanup failure fatal after an otherwise
successful run. A migration-bearing PACK additionally preserves the
exact `migrate -> rollback -> migrate -> seed -> focused integration -> full
integration` order before cleanup. The second migrate is a required duplicate,
not a command subject to deduplication; missing cleanup on either success or
failure is a stop condition.

The seven normative acceptance tests explicitly named as new and absent from
the base and preserved overlay are assigned as exact `plannedTestCreate` paths
of their owning implementation PACK. Before that PACK they remain registered
gaps, not false-green commands; in the owning PACK they become mandatory focused
commands:

- D8 / PACK-R14-13: `tests/integration/search-permission/search-email.spec.ts`
- E12 / PACK-R14-21: `apps/api/src/modules/dd/dd-ai-mapping.service.spec.ts`
- B13 / PACK-R14-32: `tests/integration/document-access/comparison-ai.spec.ts`
- C14 / PACK-R14-31: `tests/integration/document-access/email-egress-dlp.spec.ts`
- E13 / PACK-R14-32: `apps/api/src/modules/ai/features/ai-drafting.service.spec.ts`
- E13 / PACK-R14-32: `tests/integration/ai-drafting.spec.ts`
- B19 / PACK-R14-30: `tests/integration/redline.spec.ts`

Each gap blocks a `COMPLETE` claim for its TUW until its owning implementation
PACK creates and passes the exact test. An earlier status-adjudication PACK may
record the gap and retain a non-complete status; it may not report the missing
test as executed, skipped, or passing evidence.

Focused verification is exact:

```bash
node tools/execution/build-post-r14-recovery-pack-manifest.mjs --check \
  --source-dir "$G002_SOURCE_DIR"
node tools/execution/build-post-r14-recovery-pack-manifest.mjs --check \
  --committed-only
node --test tools/execution/build-post-r14-recovery-pack-manifest.spec.mjs
```

Exact-head regression also requires frozen install, direct lint for the two
validator files, workspace lint/typecheck/tests/build, backlog and frozen-docs
validation, secret/private-data scan, `git diff --check`, zero
`docs/package/**` or migration diff, original-overlay invariance, independent
Codex review, and CI success. Claude and human waits are waived; no technical,
security, scope, evidence, or stop gate is waived. Version 1 remains historical
registration evidence but is superseded by version 2 for every unstarted
PACK-R14-04 through PACK-R14-46 execution.

## PACK-LAI Local AI Operating Layer Family

Status: post-R14 extension family, registered for implementation after the
operator adopts `docs/execution/TUW_LOCAL_AI_OPERATING_LAYER.md` as the active
execution contract. This family preserves DEC-11: product routes remain
`local_gemma` only, external model calls remain blocked, and `docs/package/`
remains read-only.

| PACK | Branch | TUW count | TUW range |
|---|---|---:|---|
| PACK-LAI-00 | `feat/pack-lai-00-local-ai-plan` | 2 | `AI-LOCALPLAN-SCOPE-TUW-001` through `AI-LOCALPLAN-REVIEW-TUW-002` |
| PACK-LAI-01 | `feat/pack-lai-01-gemma-runtime` | 6 | `AI-GEMMAGATE-HEALTH-TUW-001` through `AI-GEMMAGATE-CITESCHEMA-TUW-006` |
| PACK-LAI-02 | `feat/pack-lai-02-post-upload-ai-prep` | 7 | `AI-PREP-SCHEMA-TUW-001` through `AI-PREP-INVALIDATE-TUW-007` |
| PACK-LAI-03 | `feat/pack-lai-03-local-ai-workflows` | 6 | `AI-WORK-DOCSUMMARY-TUW-001` through `AI-WORK-QA-TUW-006` |
| PACK-LAI-04 | `feat/pack-lai-04-ai-prep-ui` | 4 | `AI-UI-STATUS-TUW-001` through `AI-UI-FEEDBACK-TUW-004` |
| PACK-LAI-05 | `feat/pack-lai-05-ai-ops-eval` | 5 | `AI-OPS-HEALTH-TUW-001` through `AI-OPS-GATE-TUW-005` |
| PACK-LAI-06 | `feat/pack-lai-06-local-model-bench` | 3 | `AI-BENCH-CATALOG-TUW-001` through `AI-BENCH-DECISION-TUW-003` |

## PACK-LAI Gemma4 Hardening Continuation Family

Status: active continuation family registered by
`docs/execution/TUW_GEMMA4_HARDENING_CONTINUATION.md`. This family starts from
the already implemented local-only Gemma/upload-prep baseline and closes the
remaining schema, adapter, stale/rebuild, quality, UI/ops, and production-gate
gaps without enabling production Gemma runtime.

| PACK | Branch | TUW count | TUW range |
|---|---|---:|---|
| PACK-LAI-13 | `feat/pack-lai-13-hardening-plan` | 3 | `AI-HARDEN-BASELINE-TUW-001` through `AI-HARDEN-REVIEW-TUW-003` |
| PACK-LAI-14 | `feat/pack-lai-14-prep-schema-decision` | 4 | `AI-HARDEN-SCHEMADEC-TUW-001` through `AI-HARDEN-PREPSUMMARY-TUW-004` |
| PACK-LAI-15 | `feat/pack-lai-15-evidencepack-v2-adapter` | 3 | `AI-HARDEN-EVIDENCEV2-TUW-001` through `AI-HARDEN-EVIDSCAN-TUW-003` |
| PACK-LAI-16 | `feat/pack-lai-16-prep-lifecycle` | 4 | `AI-HARDEN-STALECONTRACT-TUW-001` through `AI-HARDEN-REBUILD-TUW-004` |
| PACK-LAI-17 | `feat/pack-lai-17-retrieval-orchestration` | 4 | `AI-HARDEN-RETRIEVEPLAN-TUW-001` through `AI-HARDEN-PLAYBOOKBOUND-TUW-004` |
| PACK-LAI-18 | `feat/pack-lai-18-quality-eval` | 4 | `AI-HARDEN-EVAL100-TUW-001` through `AI-HARDEN-BENCHSAFE-TUW-004` |
| PACK-LAI-19 | `feat/pack-lai-19-product-ops` | 4 | `AI-HARDEN-UISTATE-TUW-001` through `AI-HARDEN-RUNBOOK-TUW-004` |
| PACK-LAI-20 | `feat/pack-lai-20-production-readiness` | 4 | `AI-HARDEN-TECHREADY-TUW-001` through `AI-HARDEN-CLOSEOUT-TUW-004` |

Trigger conditions:

- R14 technical completion remains intact.
- The local Gemma runtime is available on a local/private endpoint or the
  gateway degrades safely.
- `packages/shared/src/types/ai-policy.ts` keeps `aiModelRouteKeys` restricted
  to `local_gemma`.
- Bench-only candidate models never add product routes or tenant-table output.

## PACK-OA Outlook Add-in / Desktop Integration Family

Status: planning extension registered after ADR-015 proposal. This family
preserves ADR-014's desktop boundary: the Outlook add-in is a thin Office.js
client over Vault APIs, not a desktop shell embed, local runtime, local cache, or
audit authority. Live Microsoft 365, Graph, NAA, Smart Alert, folder mapping,
auto-file, and tenant deployment behavior remain blocked until their explicit
integration gates open.

| PACK | Branch | TUW count | TUW range |
|---|---|---:|---|
| PACK-OA-00 | `codex/outlook-oa11-plan` | 4 | `OUTLOOK-ADR-TUW-001` through `OUTLOOK-EVIDENCE-TUW-001` |
| PACK-OA-01 | future | 5 | `OUTLOOK-SERVERMAP-TUW-001` through `OUTLOOK-SERVERMAP-TUW-005` |
| PACK-OA-02 | future | 5 | `OUTLOOK-API-CONTRACT-TUW-001` through `OUTLOOK-AUDIT-CONTRACT-TUW-001` |
| PACK-OA-03 | `codex/outlook-oa03-oa04-skeleton` | 5 | `OUTLOOK-MAILBOX-TUW-001` through `OUTLOOK-AUDIT-META-TUW-001` |
| PACK-OA-04 | `codex/outlook-oa03-oa04-skeleton` | 6 | `OUTLOOK-FILEAPI-TUW-001` through `OUTLOOK-IDEMP-TUW-002` |
| PACK-OA-05 | `codex/outlook-addin-client` | 6 | `OUTLOOK-ADDIN-SHELL-TUW-001` through `OUTLOOK-ADDIN-ERROR-TUW-001` |
| PACK-OA-06 | `codex/outlook-auth-graph-gate` | 5 | `OUTLOOK-AUTH-TUW-001` through `OUTLOOK-GRAPH-AUDIT-TUW-001` |
| PACK-OA-07 | `codex/outlook-send-file-smart-alerts` | 5 | `OUTLOOK-SMART-TUW-001` through `OUTLOOK-SENDFILE-TUW-003` |
| PACK-OA-08 | `codex/outlook-insert-from-vault` | 5 | `OUTLOOK-INSERT-TUW-001` through `OUTLOOK-INSERT-TUW-005` |
| PACK-OA-09 | `codex/outlook-folder-mapping-autofile` | 5 | `OUTLOOK-FOLDERMAP-TUW-001` through `OUTLOOK-AUTOFILE-TUW-002` |
| PACK-OA-10 | `codex/outlook-deployment-rollback` | 4 | `OUTLOOK-DEPLOY-TUW-001` through `OUTLOOK-DEPLOY-TUW-004` |
| PACK-OA-11 | `codex/outlook-verification-evidence` | 8 | `OUTLOOK-VERIFY-TUW-001` through `OUTLOOK-VERIFY-TUW-008` |
| PACK-OPS-OA-01 | `codex/outlook-operational-gates` | 10 | `OPS-OA-01` through `OPS-OA-08`, `OPS-OA-10`, `OPS-OA-11` |

Planning contract: `docs/execution/TUW_OUTLOOK_ADDIN_OA00_OA11.md`.

## Gate Reports

Each release closes with a `docs/ledger/gates/R{N}_gate.md` report and an
append-only `docs/ledger/execution.md` summary row. Human sign-off and Claude
review fields are recorded as waived only for this active goal; technical
evidence remains mandatory.
