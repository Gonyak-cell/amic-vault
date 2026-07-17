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

### PACK governance, verification, and rollback

Predecessors are G001 completion; G002 C001/C002/C003 PASS and checkpoint
completion; the exact registration token; a registration-only PR changing
exactly two files whose exact-head technical gates passed; merge of that PR; and
an implementation branch based on the exact registration merge SHA in a clean
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
