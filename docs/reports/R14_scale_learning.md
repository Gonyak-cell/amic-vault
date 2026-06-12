# R14 Scale & Learning Gate Report

Date: 2026-06-12
Status: TECHNICAL PASS

## Scope

PACK-R14-01 implements the R14 scale, optimization, evaluation, migration, and
learning technical gate after the R13 enterprise hardening gate.

Implemented scope:

- Tenant-scoped performance evidence registry with bounded latency percentiles,
  target p95, measurement hash, and evidence reference.
- Tenant-scoped cost snapshot registry with unit counts, estimated cents,
  currency, cost model hash, and evidence reference.
- Tenant-scoped evaluation run registry with suite case/pass/fail counts,
  derived pass/fail status, metric hash, and evidence reference.
- Tenant-scoped migration drill registry with drill scope, schema hashes,
  duration, status, and evidence reference.
- Tenant-scoped learning event registry with pattern code and
  evidence/resolution references.
- Advanced AI gate review registry that keeps external model allowance hard
  false by schema, shared DTO, service contract, and integration test.
- Protected `/scale` administrator console and internal auth guard coverage.
- R14 technical completion evidence across report, gate, decision, execution,
  and learning ledgers.

R14-01 does not add external AI SDKs, external model calls, endpoint
configuration, API keys, vendor billing integrations, prompt/response/source
text storage, raw document body storage, raw incident body storage, external
sharing expansion, or destructive runtime grants.

## Technical Model

| Area | Implementation |
|---|---|
| Performance | `scale_performance_runs` stores scenario, sample count, p50/p95/p99, target p95, status, measurement hash, and evidence ref |
| Cost | `scale_cost_snapshots` stores scope, date range, units, estimated cents, currency, cost model hash, and evidence ref |
| Evaluation | `scale_eval_runs` stores suite, case/pass/fail counts, derived status, metric hash, and evidence ref |
| Migration | `scale_migration_drills` stores scope, duration, schema hashes, status, and evidence ref |
| Learning | `scale_learning_events` stores category, severity, pattern code, evidence ref, and resolution ref |
| Advanced AI gate | `scale_ai_gate_reviews.external_model_allowed` is constrained to false |
| Readiness | `/v1/scale/readiness` requires passing performance, cost, eval, migration, learning, AI gate, and zero external-model-open evidence |
| Audit | Scale audit actions record IDs, hashes, counts, status, enum values, and refs only |
| Tests | `tests/integration/scale-learning.spec.ts`, auth guard regression, AI boundary regression, shared schema tests |

## Permission, Sensitive Data, and Audit

- Scale evidence APIs require an authenticated internal user and tenant context.
- Scale evidence writes and reads are limited to `firm_admin` and
  `security_admin`.
- Non-admin scale writes return safe `PERMISSION_DENIED` without echoing
  rejected evidence refs.
- Performance evidence stores numeric latency summaries and a measurement hash
  only, not traces or request payloads.
- Cost evidence stores bounded unit/cost numbers and a cost model hash only, not
  vendor account identifiers, billing secrets, or external billing responses.
- Evaluation evidence stores case/pass/fail counts and metric hashes only, not
  prompts, responses, document bodies, snippets, or raw source text.
- Migration evidence stores schema hashes, duration, status, and refs only.
- Learning evidence stores pattern and evidence/resolution refs only, not
  incident body or sensitive source text.
- Advanced AI gate evidence rejects `externalModelAllowed=true`; no external
  model endpoint, API key, or SDK path exists in R14.
- Scale audit metadata uses allow-listed IDs, hashes, counts, enum states,
  status values, and refs only.

## Validation Summary

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS, 154 files / 370 tests |
| `pnpm build` | PASS |
| `docker compose -f infra/docker-compose.dev.yml up -d --wait` | PASS |
| `pnpm db:migrate` | PASS, applied `0062_scale_learning` |
| isolated clean DB `db:migrate -> db:rollback -> db:migrate -> db:seed` | PASS on compose project `amic-vault-r14-roundtrip`, port 55446 |
| `pnpm db:seed` | PASS |
| `pnpm test:integration -- tests/integration/scale-learning.spec.ts tests/integration/auth-guard.spec.ts` | PASS, 2 files / 5 tests |
| `pnpm test:integration -- tests/integration/ai-schema-only.spec.ts tests/integration/scale-learning.spec.ts` | PASS, 2 files / 4 tests |
| `pnpm test:integration` | PASS, 81 files / 204 tests |
| worker pytest | PASS, 17 tests, existing Starlette/httpx warning |
| `pnpm backlog:validate` | PASS, 174 TUWs |
| `pnpm docs:frozen` | PASS, 51 files |
| `node tools/db/check-migration-conventions.mjs` | PASS |
| shared scale schema/audit tests | PASS, 10 files / 30 tests |
| API targeted unit tests | PASS, 7 files / 20 tests |
| web build | PASS, `/scale` route built |
| evalset load | PASS, loaded=2 with existing R3 target warning |
| Korean search eval | PASS, precision 100.0%, recall 55.0%, false-positive 0.0% |
| AI gate | PASS, technicalPass=true |
| matter-scoped AI gate | PASS, technicalPass=true with no-citation/no-feedback scope warnings |
| graph consistency | PASS, driftCount=0 |
| contract gate | PASS, technicalPass=true |
| API/web/ingestion docker build smoke | PASS |
| R14 release-boundary scans | PASS, expected-only matches |
| dependency delta scan | PASS, no package or lockfile change |
| `git diff -- docs/package` | PASS, no changes |
| `git diff --check` | PASS |

Dirty DB note: full all-history rollback on a seeded/integration development
database is not used as R14 evidence because durable append-only audit rows from
later releases can block older audit action constraint downs. The isolated clean
compose project passed the full all-history roundtrip
`migrate -> rollback -> migrate -> seed`.

## SQL Evidence

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

The R14 scale tables all have RLS and FORCE RLS enabled. The runtime role has no
DELETE/TRUNCATE grant on scale tables. Scale tables do not include unsafe raw
secret, token, password, private key, key material, endpoint URL, metadata XML,
assertion XML, prompt, response, body, or raw columns. No external AI opening is
stored.

## Scale & Learning Gate Evidence

`tests/integration/scale-learning.spec.ts` verifies:

- Firm administrators can record performance, cost, eval, migration, learning,
  and AI-gate evidence.
- Performance pass/fail is derived from p95 target evidence.
- Eval pass/fail is derived from balanced pass/fail/case counts.
- Readiness becomes technical-pass only when all R14 evidence categories exist
  and external model open count is zero.
- Non-admin scale writes are denied safely.
- R14 tables have tenant RLS/FORCE RLS, no destructive runtime grants, no unsafe
  raw sensitive columns, and zero external-model-open rows.
- Scale audit metadata contains evidence IDs and excludes prompt, response, and
  secret-bearing strings.

Additional regressions verify:

- `/scale` is protected by the internal auth guard.
- Web scale console builds under the internal app shell.
- Shared schema validation rejects `externalModelAllowed=true`.
- R6 AI, R7 graph, R8 contract, R11 external, R12 records, and R13 enterprise
  regressions remain technical-pass.

## Release Boundary

Automated implementation scans passed for:

- No external AI SDK/client dependency, endpoint configuration, API key, or
  model call.
- No `externalModelAllowed=true` production storage path.
- No prompt, response, raw source, document body, snippet, billing secret,
  vendor account, endpoint URL, token, private key, or credential storage.
- No OpenSearch/Elasticsearch, Neo4j, new queue/cache, webhook, SMTP, outbound
  notification, or external billing dependency.
- No package or lockfile dependency change.
- No `docs/package/` change.

Remaining blockers: 0.
