# Local AI Operating Layer Report

Date: 2026-06-15

## Summary

The Local AI Operating Layer is implemented as a local-only Gemma route with permission-scoped retrieval, post-upload prep artifacts, UI status surfaces, structured feedback, and operations/eval checks.

## Implemented Controls

| Control | Evidence |
|---|---|
| Permission-before-AI | Prep and summaries reuse policy, DLP, and scoped retrieval decisions before generation. |
| Local-only model route | `local_gemma` remains the only production route. |
| No raw AI persistence | Prep artifacts and audit metadata store hashes, refs, statuses, bounded generated payloads. |
| Post-upload async prep | Search indexing success enqueues `ai.prep` jobs without blocking upload. |
| User visibility | Document detail shows prep status/artifacts; matter detail shows admin readiness and retry. |
| Structured feedback | Prep artifact feedback stores reason codes only. |
| Operations surface | Admin health/metrics expose endpoint class and aggregate counts only. |
| Eval gate | `pnpm eval:local-ai` checks deidentified cases, leakage, citations, unsupported claims, Korean output heuristic, and latency. |

## Verification Snapshot

- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS; API 104 files / 262 tests, shared 27 files / 88 tests, web 37 files / 55 tests
- `pnpm build`: PASS
- `pnpm db:migrate`: PASS; no pending migrations
- `pnpm db:seed`: PASS; tenants=2 users=11
- `pnpm test:integration`: PASS; 85 files / 212 tests
- `pnpm eval:local-ai`: PASS; permission leakage 0, citation accuracy 100.0%, unsupported claim rate 0.0%
- `pnpm eval:ai-gate`: PASS; external model call attempts 0, audit coverage 100.0%
- `ai_prep_artifacts` payload scan: PASS; forbidden top-level key count 0, max payload bytes 0 in current seeded DB
- `pnpm docs:frozen`: PASS
- `pnpm backlog:validate`: PASS
- `git diff --check`: PASS

## Boundaries

- No external model calls.
- No external AI SDKs.
- No prompt, raw source, or raw model response in audit metadata.
- No prompt, raw source, or raw model response top-level keys in AI prep artifacts.
- No free-text prep feedback comments.
- No production authorization implied by this report.

## Open Readiness Items

- Full `pnpm db:rollback` still fails on the dirty dev database because existing append-only AI prep audit rows block the older 0065 down constraint; PACK-LAI migrations were verified with targeted down/up roundtrips.
- The local eval technical pass currently has no completed live Gemma outputs in the seeded DB, so live model quality sampling is not claimed by this report.
