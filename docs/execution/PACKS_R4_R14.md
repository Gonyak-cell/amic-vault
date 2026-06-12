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
| PACK-R14-01 | `feat/pack-r14-01-scale-learning` | 8 | `SCALE-*` R14 rows |

## Gate Reports

Each release closes with a `docs/ledger/gates/R{N}_gate.md` report and an
append-only `docs/ledger/execution.md` summary row. Human sign-off and Claude
review fields are recorded as waived only for this active goal; technical
evidence remains mandatory.
