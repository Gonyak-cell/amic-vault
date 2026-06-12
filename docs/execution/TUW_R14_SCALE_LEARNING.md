# PACK-R14-01 Scale & Learning TUW Contract

Status: active extension after R13 Gate technical pass
Release: R14 Scale & Optimization
Branch: `feat/pack-r14-01-scale-learning`

Source constraints:

- `docs/package/codex/00_Master_Brief.md` constitution and absolute bans.
- `docs/package/codex/30_Release_Roadmap.md` R14 scope: performance, cost,
  evaluation pipeline hardening, advanced AI re-evaluation, migration tooling.
- `docs/package/codex/50_Verification_Security_Gates.md` verification
  semantics, release order, and learning ledger rules.

PACK-R14-01 implements technical evidence surfaces for Scale & Learning without
opening external model calls, external APIs, vendor billing integrations, or raw
prompt/response/source text storage. External model opening remains closed by
schema and service contract.

## TUW Inventory

### SCALE-PERF-BENCH-TUW-001

- Title: Performance evidence registry
- Risk: H
- Objective: Record bounded p50/p95/p99 performance evidence per scenario.
- Verification: tenant RLS/FORCE RLS, p95 target pass/fail, reference-only audit.

### SCALE-COST-METER-TUW-001

- Title: Cost snapshot registry
- Risk: H
- Objective: Record bounded cost snapshots with unit counts and cost model hash.
- Verification: no vendor account, billing secret, or external billing API call.

### SCALE-EVAL-PIPE-TUW-001

- Title: Evaluation pipeline run registry
- Risk: C
- Objective: Record eval suite case/pass/fail counts and metric hash.
- Verification: counts balance, pass/fail derived, no prompt/response/body text.

### SCALE-MIGR-TOOL-TUW-001

- Title: Migration drill evidence registry
- Risk: C
- Objective: Record migration roundtrip/schema-hash drill status and evidence.
- Verification: schema hashes and duration only; RLS and rollback evidence
  preserved.

### SCALE-LEARN-LEDGER-TUW-001

- Title: Learning ledger event registry
- Risk: H
- Objective: Add DB and append-only file evidence for learning events.
- Verification: pattern/evidence/resolution refs only, no incident body or
  sensitive text.

### SCALE-AI-GATE-TUW-001

- Title: Advanced AI gate re-evaluation record
- Risk: C
- Objective: Record R14 advanced AI gate review while keeping external model
  allowance hard-false.
- Verification: schema rejects `externalModelAllowed=true`; no external SDK,
  endpoint, API key, or model call is introduced.

### SCALE-ADMIN-UI-TUW-001

- Title: Scale and learning console
- Risk: M
- Objective: Add protected `/scale` admin console for R14 evidence state.
- Verification: route is protected and renders no secret-bearing fields.

### SCALE-GATE-REPORT-TUW-001

- Title: Scale & Learning Gate report
- Risk: C
- Objective: Record R14 Gate evidence and final technical completion state.
- Verification: `docs/reports/R14_scale_learning.md`,
  `docs/ledger/gates/R14_gate.md`, learning/decision/execution ledgers all
  reflect current state.

## Release Boundary

R14-01 MUST NOT create:

- external AI SDK/client dependency, API key, endpoint config, or model call.
- `externalModelAllowed=true` storage path.
- prompt, response, raw source, document body, snippet, billing secret, vendor
  account, endpoint URL, token, private key, or credential storage.
- destructive migration or rollback path that mutates `docs/package/`.

If any of the above is needed, stop and append escalation to
`docs/ledger/execution.md`.
