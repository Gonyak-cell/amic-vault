# R6 Gate Report - AI MVP

Status: TECHNICAL PASS / human sign-off waived by operator
Date: 2026-06-12
Operator: Codex
Scope: R6 after PACK-R6-10 local validation, including AI policy, local-only vector retrieval, Evidence Pack, citations, AI sessions, AI audit, model routing, degraded summaries, feedback store, and AI gate metric harness.
Base main head before PACK-R6-10: `92444bf38b573bb9357afb13d7fb0984f79ee78e`

## Waiver

Human Gate sign-off, Claude review, Risk=C human review, and human merge approval are waived by the active R14 technical completion goal and the 2026-06-12 operator decision in `docs/ledger/decision.md`.

The waiver does not waive technical evidence, security invariants, release order, Gate checklist coverage, or append-only ledger records.

## Runtime Evidence

- PACK-R6-01 through PACK-R6-09 are merged to `main`.
- PACK-R6-10 branch local validation:
  - `pnpm install --frozen-lockfile`: pass.
  - `pnpm lint`: pass.
  - `pnpm typecheck`: pass.
  - `pnpm test`: pass. API 92 files / 229 tests, shared 16 / 50, web 20 / 32, domain 7 / 15, packages/ai 1 / 3.
  - `pnpm build`: pass.
  - `docker compose -f infra/docker-compose.dev.yml down -v`: pass.
  - `docker compose -f infra/docker-compose.dev.yml up -d --wait`: pass.
  - Clean DB `pnpm db:migrate`: pass.
  - Clean DB `pnpm db:rollback`: pass.
  - Clean DB `pnpm db:migrate`: pass after rollback.
  - Clean DB `pnpm db:seed`: pass.
  - `pnpm test:integration`: pass, 72 files / 173 tests.
  - Bundled Python worker pytest: pass, 15 tests, 1 existing Starlette/httpx warning.
  - `pnpm backlog:validate`: pass, 174 R4-R14 TUWs and package backlog validation.
  - `pnpm docs:frozen`: pass, 51 files.
  - `node tools/db/check-migration-conventions.mjs`: pass.
  - `pnpm evalset:load -- --tenant-id 11111111-1111-4111-8111-111111111111`: pass, loaded=2 with existing below-target warning.
  - `pnpm search:eval:korean`: pass, precision 100.0%, recall 55.0%, false-positive rate 0.0%.
  - `pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111`: pass, technicalPass=true.

## R6-G1. Permission-before-AI and Permission Accuracy

Machine status: PASS.

- AI retrieval uses the R6 five-stage contract: matter/policy precheck, `documents.ai_allowed`, query-stage permission scope, Evidence Pack leakage stripping, and response citation permission recheck.
- `tests/integration/ai-retrieval.spec.ts`, `tests/integration/ai-summaries.spec.ts`, `tests/integration/ai-citations.spec.ts`, and `tests/integration/ai-feedback.spec.ts` passed in full integration.
- Gate metric harness result:
  - `permissionLeakageViolations=0`
  - `permissionAccuracyPercent=100.0%`
- Denied, `ai_allowed=false`, and explicit-denied sources are absent from summary responses and `AI_CITED_DOCUMENT` audit rows.

## R6-G2. Citation, Hallucination, and Retrieval Metrics

Machine status: PASS.

- `docs/reports/R6_ai_gate_metrics.md` records the metric snapshot:
  - Citation accuracy: 100.0%.
  - Hallucination rate: 0.0%.
  - Retrieval recall proxy: 100.0%.
  - Approved subset: 2 / 2 deidentified evaluation cases.
- Current committed evalset is a technical MVP synthetic subset. The harness emits the expected warning that the future operational target is ~1,000 approved cases; no real data is committed.

## R6-G3. AI Audit Coverage and Sensitive Data Boundary

Machine status: PASS.

- AI audit actions now cover:
  - `AI_QUERY_SUBMITTED`
  - `AI_RETRIEVAL`
  - `AI_RESPONSE`
  - `AI_CITED_DOCUMENT`
  - `AI_RETRIEVAL_EXCLUDED`
  - `AI_FEEDBACK_RECORDED`
- Gate metric harness result:
  - `totalSessions=7`
  - `sessionsWithQueryAudit=7`
  - `sessionsWithResponseAudit=7`
  - `auditCoveragePercent=100.0%`
- AI session, citation, summary, and feedback tests assert prompt text, response text, source text, title/snippet leakage, comments, passwords, tokens, and raw content are absent from audit metadata.

## R6-G4. Local-only Model Route and Release Boundary

Machine status: PASS.

- R6 model route remains `local_gemma` / `local` only.
- `packages/ai` keeps local/private gateway health behavior only.
- No external AI SDK, API key, external model endpoint config, OpenSearch/Elasticsearch client, Neo4j client, external sharing, secure link, external portal, or hard delete implementation is introduced in R6.
- Gate metric harness result: `externalModelCallAttempts=0`.

## R6-G5. Feedback Store and Shadow Pilot Metrics

Machine status: PASS.

- `feedback_items` is tenant-scoped with `tenant_id NOT NULL`, RLS enabled, and FORCE RLS enabled.
- Feedback capture is limited to session owner or firm/security admin.
- Metrics endpoint is firm/security admin only and returns aggregate values only.
- Stored feedback fields are structured and bounded: rating, helpful flag, correction code, error codes, and edit distance. No prompt/response/source/comment text columns exist.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12
Remaining blockers: 0

## Result

R6 AI MVP Gate technical evidence is passed for the current technical MVP baseline. R7 work may begin only after the PACK-R6-10 branch passes PR CI and is merged under the active R14 technical completion goal.
