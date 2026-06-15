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
| PACK-OA-03 | future | 5 | `OUTLOOK-MAILBOX-TUW-001` through `OUTLOOK-AUDIT-META-TUW-001` |
| PACK-OA-04 | future | 6 | `OUTLOOK-FILEAPI-TUW-001` through `OUTLOOK-IDEMP-TUW-002` |
| PACK-OA-05 | future | 6 | `OUTLOOK-ADDIN-SHELL-TUW-001` through `OUTLOOK-ADDIN-ERROR-TUW-001` |
| PACK-OA-06 | future | 5 | `OUTLOOK-AUTH-TUW-001` through `OUTLOOK-GRAPH-AUDIT-TUW-001` |
| PACK-OA-07 | future | 5 | `OUTLOOK-SMART-TUW-001` through `OUTLOOK-SENDFILE-TUW-003` |
| PACK-OA-08 | future | 5 | `OUTLOOK-INSERT-TUW-001` through `OUTLOOK-INSERT-TUW-005` |
| PACK-OA-09 | future | 5 | `OUTLOOK-FOLDERMAP-TUW-001` through `OUTLOOK-AUTOFILE-TUW-002` |
| PACK-OA-10 | future | 4 | `OUTLOOK-DEPLOY-TUW-001` through `OUTLOOK-DEPLOY-TUW-004` |
| PACK-OA-11 | future | 8 | `OUTLOOK-VERIFY-TUW-001` through `OUTLOOK-VERIFY-TUW-008` |

Planning contract: `docs/execution/TUW_OUTLOOK_ADDIN_OA00_OA11.md`.

## Gate Reports

Each release closes with a `docs/ledger/gates/R{N}_gate.md` report and an
append-only `docs/ledger/execution.md` summary row. Human sign-off and Claude
review fields are recorded as waived only for this active goal; technical
evidence remains mandatory.
