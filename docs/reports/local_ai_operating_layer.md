# Local AI Operating Layer Report

Date: 2026-06-15

## Summary

The Local AI Operating Layer is implemented as a local-only Gemma route with permission-scoped retrieval, post-upload file-organization prep artifacts, UI status surfaces, structured feedback, operations/eval checks, and a bench-only lane for comparing newer local candidates without changing the product route.

## Implemented Controls

| Control | Evidence |
|---|---|
| Permission-before-AI | Prep and summaries reuse policy, DLP, and scoped retrieval decisions before generation. |
| Local-only model route | `local_gemma` remains the only production route. |
| No raw AI persistence | Prep artifacts and audit metadata store hashes, refs, statuses, bounded generated payloads. |
| Post-upload async prep | Search indexing success enqueues file-organization `ai.prep` jobs without blocking upload. |
| No legal prep analysis | Prep artifact kinds exclude issue, risk, clause analysis, and Gemma summary calls are limited to summary/file-organization tasks. |
| Prep claim hardening | Completed artifacts require source refs, artifact-specific claim kinds, and reject risk/issue/clause/legal-conclusion claims at shared schema, API parse, and DB check layers. |
| Safe invalid-output fallback | Invalid Gemma output is discarded and replaced with a deterministic bounded file-organization artifact, without storing raw prompt/source/response. New audits include bounded `generation_result` and `fallback_reason_code`. |
| User visibility | Document detail shows prep status/artifacts; matter detail shows admin readiness and retry. |
| Structured feedback | Prep artifact feedback stores reason codes only. |
| Operations surface | Admin health/metrics expose endpoint class and aggregate counts only. |
| Structured Gemma output | Local Ollama generation now receives a JSON Schema with exact source-ref enums and artifact claim-kind enums, reducing invalid JSON and source-ref typo fallbacks while preserving fail-closed citation checks. |
| Eval gate | `pnpm eval:local-ai` checks deidentified cases, completed outputs, non-fallback generated outputs, fallback count/rate, prep schema violations, leakage, generated-only citations, unsupported claims, Korean output heuristic, and latency. The technical fallbackRate threshold is 0.5. |
| Storage scan | `pnpm ai-prep:scan` checks raw payload/audit leakage, legal claim leakage, source-ref integrity, artifact allow-list, and external-route regression. |
| Bench-only candidates | `tools/bench` compares cataloged local candidates with default-off execution and hash-only ignored outputs. |

## Verification Snapshot

- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS; API 105 files / 269 tests, shared 27 files / 91 tests, web 37 files / 55 tests
- `pnpm build`: PASS
- `pnpm db:migrate`: PASS; includes `0068_harden_ai_prep_completed_payload.sql`
- targeted migration roundtrip: PASS; `node tools/db/migrate.mjs down 1 && node tools/db/migrate.mjs up`
- `pnpm db:seed`: PASS; tenants=2 users=11
- `pnpm test:integration`: PASS; 85 files / 212 tests
- `pnpm eval:local-ai`: PASS; completedOutputCount 25, fallbackArtifactCount 1, generatedOutputCount 24, fallbackRate 4.0%, prepSchemaViolationCount 0, permission leakage 0, generated-only citation accuracy 100.0%, unsupported claim rate 0.0%, warnings empty
- `pnpm eval:ai-gate`: PASS; external model call attempts 0, audit coverage 100.0%
- `pnpm ai-prep:scan`: PASS; completedCount 25, fallbackSignalCount 1, raw payload/audit key count 0, legal claim count 0, missing/mismatched source ref count 0, external model route count 0
- direct local Gemma JSON Schema smoke: PASS; `gemma4:12b` returned valid JSON with exact source refs for a synthetic one-chunk file-organization prompt
- `pnpm exec vitest run tools/bench/local-model-bench.spec.ts`: PASS; 4 tests
- `pnpm bench:local-models -- --models gemma4-12b-baseline,qwen3-8b`: PASS disabled/default-off
- `AI_BENCH_HARNESS_ENABLED=true pnpm bench:local-models -- --models gemma4-12b-baseline`: PASS; `gemma4:12b` 2/2 completed on synthetic deidentified fixture
- 20+ synthetic upload prep smoke: PASS; upload API -> search indexing -> `ai.prep` -> completed `document_profile` artifacts
- `ai_prep_artifacts` payload scan: PASS; forbidden top-level key count 0, prep schema violation count 0
- `pnpm docs:frozen`: PASS
- `pnpm backlog:validate`: PASS
- `git diff --check`: PASS

## Boundaries

- No external model calls.
- No external AI SDKs.
- No prompt, raw source, or raw model response in audit metadata.
- No prompt, raw source, or raw model response top-level keys in AI prep artifacts.
- No free-text prep feedback comments.
- No completed prep artifact may store `risk`, `issue`, `clause`, or legal-conclusion shaped claims.
- Invalid/unsupported Gemma prep output is not persisted; only the safe fallback artifact is persisted.
- Fallback reason telemetry is bounded to code metadata. New fallback detection uses `AI_PREP_COMPLETED` audit metadata first and payload warning markers as a historical compatibility signal.
- No production authorization implied by this report.
- No non-Gemma candidate is proposed as a product route by PACK-LAI-06.
- No post-upload AI prep artifact asks Gemma to extract legal issues, legal risks, or clause analysis.

## Open Readiness Items

- Full `pnpm db:rollback` still fails on the dirty dev database because existing append-only AI prep audit rows block the older 0065 down constraint; PACK-LAI migrations were verified with targeted down/up roundtrips.
- The 20+ completed-output smoke used synthetic/deidentified local documents. Production customer-data quality and deployment authorization are separate gates.
- The current executable eval corpus remains a technical subset; 100-case/1000-case operational corpus expansion remains a future quality gate, not a claim made by this report.
- Fallback quality is resolved for the current synthetic upload-prep evidence: reprocessing 18 fallback artifacts through the JSON Schema-hardened local Gemma path reduced fallback artifacts to 1 of 25 and `fallbackRate` to 4.0%, below the 0.5 technical threshold.
