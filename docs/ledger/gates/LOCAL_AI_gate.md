# LOCAL AI Gate

Status: technical baseline, local-only.

## Scope

This gate covers PACK-LAI-01 through PACK-LAI-06:

- Local Gemma runtime gateway
- Post-upload AI prep queue and artifacts
- Lawyer-facing grounded local AI summaries
- AI prep UI/status/feedback
- Local AI operations health, metrics, eval, and runbook
- Bench-only candidate model catalog, default-off harness, and no-route-change decision

## Required Evidence

| Evidence | Status |
|---|---|
| Local-only route key remains `local_gemma` | PASS |
| No external AI SDK/API key/model route added | PASS |
| Upload prep artifacts store hashes, refs, and bounded file-organization payload only | PASS |
| Upload prep artifact kinds exclude issue/risk/clause analysis | PASS |
| Artifact JSON raw top-level key scan | PASS; forbidden key count 0 |
| Admin-only local AI ops health/metrics | PASS |
| Structured prep feedback has no free-form comments | PASS |
| Local AI eval suite fails on leakage | PASS |
| Existing R6 AI gate | PASS; external model call attempts 0 |
| Bench-only candidate lane default-off and local/private only | PASS |
| Gemma 4 12B local baseline bench | PASS; 2/2 synthetic cases completed |
| Non-Gemma product route proposal | NOT PROPOSED |
| Full unit/build/integration validation | PASS; integration 85 files / 212 tests |

## Gate Commands

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm lint
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm typecheck
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm test
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm build
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm db:migrate
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm db:seed
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm evalset:load -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm eval:local-ai -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm exec vitest run tools/bench/local-model-bench.spec.ts
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm bench:local-models -- --models gemma4-12b-baseline,qwen3-8b
AI_BENCH_HARNESS_ENABLED=true PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm bench:local-models -- --models gemma4-12b-baseline
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm test:integration -- ai-schema-only
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm test:integration
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm docs:frozen
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm backlog:validate
git diff --check
```

## Current Limitations

- `pnpm db:rollback` down-all remains unsuitable on a dirty dev DB after append-only AI audit rows exist; new migrations are verified with targeted down/up roundtrips.
- The committed eval set is still the deidentified technical subset and not the future operational corpus.
- `pnpm eval:local-ai` currently passes the technical gate with no completed live local AI outputs observed; live Gemma output sampling remains a production-readiness task.
- PACK-LAI-06 benchmark used the same 2-case synthetic fixture, so it proves harness safety and Gemma runtime availability but not model superiority.
- Post-upload Gemma prep is scoped to file organization: document profile, key fields, date facts, people/organizations, keyword tags, filing suggestions, source outline, and retrieval hints.
- This gate is not production authorization and does not approve external AI models.
