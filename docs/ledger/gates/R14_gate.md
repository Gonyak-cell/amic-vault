# R14 Gate - Scale & Learning

Date: 2026-06-12

Status: TECHNICAL PASS

Gate approver: WAIVED by operator instruction

Scope:

- PACK-R14-01 Scale & Learning: performance evidence, cost snapshots,
  evaluation run evidence, migration drill evidence, learning event records,
  advanced AI gate re-evaluation with external model allowance hard-closed,
  protected scale administrator UI, and final R14 gate evidence.

## Validation Evidence

Machine status: PASS.

- `pnpm install --frozen-lockfile`: pass.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: pass, 154 files / 370 tests across apps and packages.
- `pnpm build`: pass.
- `docker compose -f infra/docker-compose.dev.yml up -d --wait`: pass.
- `pnpm db:migrate`: pass, applied `0062_scale_learning`.
- Isolated clean compose DB roundtrip on project `amic-vault-r14-roundtrip`,
  port 55446: `db:migrate -> db:rollback -> db:migrate -> db:seed` pass.
- `pnpm db:seed`: pass.
- `pnpm test:integration -- tests/integration/scale-learning.spec.ts tests/integration/auth-guard.spec.ts`: pass, 2 files / 5 tests.
- `pnpm test:integration -- tests/integration/ai-schema-only.spec.ts tests/integration/scale-learning.spec.ts`: pass, 2 files / 4 tests.
- `pnpm test:integration`: pass, 81 files / 204 tests.
- `/Users/jws/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m pytest workers/ingestion/tests`: pass, 17 tests. Existing Starlette/httpx deprecation warning only.
- `pnpm backlog:validate`: pass, 174 TUWs.
- `pnpm docs:frozen`: pass, 51 files.
- `node tools/db/check-migration-conventions.mjs`: pass.
- Shared scale schema/audit tests: pass, 10 files / 30 tests.
- API targeted unit tests: pass, 7 files / 20 tests.
- `pnpm --filter @amic-vault/web build`: pass, `/scale` route built.
- `pnpm evalset:load -- --tenant-id 11111111-1111-4111-8111-111111111111`: pass, loaded=2 with existing R3 target warning.
- `pnpm search:eval:korean`: pass, precision 100.0%, recall 55.0%, false-positive rate 0.0%.
- `pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111`: pass, technicalPass=true.
- `pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111 --matter-id 4c2a5696-4e57-44c1-8b8f-1b50e580b6af`: pass, technicalPass=true with no-citation/no-feedback scope warnings.
- `pnpm graph:check -- --tenant-id 11111111-1111-4111-8111-111111111111 --matter-id 53f8ad3f-a97b-4096-9333-207ea0ec2c7f`: pass, driftCount=0.
- `pnpm eval:contract-gate`: pass, technicalPass=true.
- API/web/ingestion docker build smoke: pass.
- R14 release-boundary scans: pass, expected-only matches.
- Dependency delta scan: pass, no package or lockfile change.
- `git diff -- docs/package`: no changes.
- `git diff --check`: pass.

Dirty DB note: full all-history rollback on the seeded/integration dev database
is not used as R14 evidence because durable append-only audit rows from later
releases can block older audit action constraint downs. The isolated clean
compose project passed the full all-history roundtrip.

## R14-G1. Performance and Cost Evidence

Machine status: PASS.

- `scale_performance_runs` is tenant scoped with RLS and FORCE RLS.
- Performance evidence stores bounded p50/p95/p99 summaries, target p95,
  measurement hash, status, and evidence ref only.
- Performance status is derived from p95 <= target p95.
- `scale_cost_snapshots` is tenant scoped with RLS and FORCE RLS.
- Cost evidence stores unit count, estimated cents, currency, cost model hash,
  and evidence ref only.
- No vendor account, billing secret, billing API response, or external billing
  API call was introduced.

## R14-G2. Evaluation and Migration Drill Evidence

Machine status: PASS.

- `scale_eval_runs` is tenant scoped with RLS and FORCE RLS.
- Eval evidence stores suite, case/pass/fail counts, derived status, metric hash,
  and evidence ref only.
- Eval rows require pass_count + fail_count = case_count.
- `scale_migration_drills` is tenant scoped with RLS and FORCE RLS.
- Migration evidence stores drill scope, schema hashes, duration, status, and
  evidence ref only.
- Clean isolated migration roundtrip evidence is recorded for the final R14 gate.

## R14-G3. Learning Ledger Evidence

Machine status: PASS.

- `scale_learning_events` is tenant scoped with RLS and FORCE RLS.
- Learning DB evidence stores category, severity, pattern code, evidence ref,
  and resolution ref only.
- `docs/ledger/learning.md` records R14 learning outcomes append-only.
- No incident body, raw document body, prompt, response, snippet, or sensitive
  source text is stored in the learning ledger tables or audit metadata.

## R14-G4. Advanced AI Gate Re-evaluation

Machine status: PASS.

- `scale_ai_gate_reviews` is tenant scoped with RLS and FORCE RLS.
- `scale_ai_gate_reviews.external_model_allowed` has a database CHECK requiring
  false.
- Shared schemas require `externalModelAllowed: false`.
- Integration tests verify external model open count remains zero.
- R14 records advanced AI re-evaluation evidence without adding external AI SDK,
  endpoint, API key, model route, or model call.

## R14-G5. Scale Console and Readiness

Machine status: PASS.

- `/v1/scale/*` APIs require firm/security administrator role and tenant
  context.
- Non-admin scale evidence writes return safe `PERMISSION_DENIED`.
- `/v1/scale/readiness` requires all R14 evidence categories plus zero external
  model open rows.
- `/scale` is protected by the internal auth guard and builds under the app
  shell.

## R14-G6. Tenant Isolation, Grants, and Sensitive Columns

Machine status: PASS.

```text
scale_ai_gate_reviews:true:true
scale_cost_snapshots:true:true
scale_eval_runs:true:true
scale_learning_events:true:true
scale_migration_drills:true:true
scale_performance_runs:true:true
destructive_grants:none
unsafe_columns:none
external_model_open:0
```

- All R14 scale tables have tenant RLS and FORCE RLS.
- Runtime role has no DELETE/TRUNCATE grant on scale tables.
- Scale tables have no unsafe raw secret, token, password, private key, key
  material, endpoint URL, metadata XML, assertion XML, prompt, response, body,
  or raw columns.

## R14-G7. Release Boundary and Regression

Machine status: PASS.

- No new package or lockfile dependency was introduced.
- No external AI model opening or DEC-11 override was introduced.
- No OpenSearch/Elasticsearch, Neo4j, SMTP, webhook delivery, billing API,
  vendor account, queue/cache, or external notification dependency was
  introduced.
- No external sharing expansion, hard delete expansion, or release boundary
  bypass was introduced.
- No `docs/package/` changes were made.
- R6 AI gate, R7 graph consistency, R8 contract gate, R11 external, R12 records,
  and R13 enterprise regressions remain technical-pass.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12
Remaining blockers: 0

## Result

R14 Scale & Learning technical evidence is passed. The R0 through R14 technical
completion goal has no remaining technical blockers after PACK-R14-01 PR CI is
green and merged.
