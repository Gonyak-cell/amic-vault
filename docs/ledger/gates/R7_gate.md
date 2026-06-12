# R7 Gate Report - Knowledge Graph

Status: TECHNICAL PASS / human sign-off waived by operator
Date: 2026-06-12
Operator: Codex
Scope: R7 after PACK-R7-01 local validation, including graph taxonomy, RDB-derived graph adapter, permission-scoped graph queries, graph sync/audit, graph consistency checks, and Evidence Pack `graphFacts` activation.
Base main head before PACK-R7-01: `3cc8c58dc297e7c3a0c114b9bfbae61c6ee56413`

## Waiver

Human Gate sign-off, Claude review, Risk=C human review, and human merge approval are waived by the active R14 technical completion goal and the 2026-06-12 operator decision in `docs/ledger/decision.md`.

The waiver does not waive technical evidence, security invariants, release order, Gate checklist coverage, or append-only ledger records.

## Runtime Evidence

- PACK-R6-10 is merged to `main`; PACK-R7-01 is the first R7 PACK.
- PACK-R7-01 branch local validation:
  - `pnpm install --frozen-lockfile`: pass.
  - `pnpm lint`: pass.
  - `pnpm typecheck`: pass.
  - `pnpm test`: pass. API 92 files / 230 tests, shared 17 / 53, web 20 / 32, domain 7 / 15, packages/ai 1 / 3.
  - `pnpm build`: pass.
  - `docker compose -f infra/docker-compose.dev.yml down -v`: pass.
  - `docker compose -f infra/docker-compose.dev.yml up -d --wait`: pass.
  - Clean DB `pnpm db:migrate`: pass through `0053_create_knowledge_graph`.
  - Clean DB `pnpm db:rollback`: pass.
  - Clean DB `pnpm db:migrate`: pass after rollback.
  - Clean DB `pnpm db:seed`: pass.
  - Targeted `pnpm test:integration -- graph ai-retrieval ai-summaries`: pass, 3 files / 12 tests.
  - `pnpm test:integration`: pass, 73 files / 177 tests.
  - Python worker pytest: pass, 15 tests, 1 existing Starlette/httpx warning.
  - `pnpm graph:check -- --tenant-id 11111111-1111-4111-8111-111111111111 --matter-id 53f8ad3f-a97b-4096-9333-207ea0ec2c7f`: pass, `driftCount=0`.
  - `pnpm backlog:validate`: pass, 174 TUWs.
  - `pnpm docs:frozen`: pass, 51 files.
  - `node tools/db/check-migration-conventions.mjs`: pass.
  - `pnpm evalset:load -- --tenant-id 11111111-1111-4111-8111-111111111111`: pass, loaded=2 with existing below-target warning.
  - `pnpm search:eval:korean`: pass, precision 100.0%, recall 55.0%, false-positive rate 0.0%.
  - `pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111 --matter-id 4c2a5696-4e57-44c1-8b8f-1b50e580b6af`: pass, technicalPass=true, citations 5/5 matched, audit coverage 100.0%.
  - Release-boundary grep: external AI SDK import 0, OpenSearch/Elasticsearch client 0, Neo4j dependency 0, external-sharing runtime implementation 0, graph raw/body/snippet/title/name columns 0, `docs/package` diff 0, `git diff --check` pass.

## R7-G1. Graph Taxonomy and Adapter

Machine status: PASS.

- `graph_nodes`, `graph_edges`, and `graph_sync_runs` are tenant-scoped RLS/FORCE RLS tables created by `0053_create_knowledge_graph`.
- R7 node taxonomy covers `client`, `matter`, `document`, `version`, `clause`, `issue`, and `risk`; R7 edge taxonomy covers `HAS_MATTER`, `HAS_DOCUMENT`, `HAS_VERSION`, `HAS_CLAUSE`, `HAS_ISSUE`, `HAS_RISK`, and `RELATED_TO`.
- R7 uses an RDB-derived graph adapter. No `neo4j-driver` or external graph dependency is added in PACK-R7-01.
- Graph tables store source IDs, scope IDs, hashes, stale flags, and timestamps only. They do not store document text, snippets, raw metadata, titles, or names.

## R7-G2. Permission-before-Graph Query

Machine status: PASS.

- `GraphQueryService` checks `PermissionService.canReadMatter` before query execution.
- Document-linked graph traversal injects the existing query-stage `SearchFilterBuilder` permission and ethical-wall scope before graph traversal.
- The graph facts API returns denied as `PERMISSION_DENIED` without leaking matter or document existence.
- `tests/integration/graph.spec.ts` confirms:
  - authorized graph facts are returned after sync,
  - wall-protected matter graph facts are denied,
  - `GRAPH_QUERY_EXECUTED` audit uses reference-only metadata.

## R7-G3. Graph Sync, Deleted Reflection, and Consistency

Machine status: PASS.

- `GraphSyncService` is firm/security admin only and records `GRAPH_SYNCED` audit events.
- Graph sync is idempotent and uses stale flags for derived-index lifecycle; it does not hard-delete domain records.
- Deleted documents are reflected by staling graph nodes/edges rather than returning stale active facts.
- `GraphConsistencyService` and `tools/graph/check-consistency.ts` detect missing document/version nodes and stale edge drift.
- Current CLI evidence: synced matter `53f8ad3f-a97b-4096-9333-207ea0ec2c7f` is `consistent` with `driftCount=0`.

## R7-G4. Permission-before-AI Graph Facts

Machine status: PASS.

- Evidence Pack `graphFacts` is active in R7 and accepts ID-backed graph facts only.
- AI summary graph facts are fetched only for document IDs that survived retrieval, permission scope, ethical wall checks, and `ai_allowed`/AI policy gates.
- Graph fact query audit scope for AI is `ai_evidence_pack` and uses reference-only metadata.
- The R6-era `GRAPH_FACTS_UNAVAILABLE_BEFORE_R7` warning code remains only as a shared schema legacy decoder value; no R7 runtime path emits it.
- R8 `ruleFindings` remains unavailable and `z.never()`-backed until the R8 rule engine PACKs.

## R7-G5. Release Boundary

Machine status: PASS.

- No external AI SDK or external model call path is introduced.
- No OpenSearch/Elasticsearch client is introduced.
- No Neo4j driver or external graph service is introduced; R7 GraphSync is implemented with existing PostgreSQL/RLS infrastructure.
- No external sharing, secure link, external portal, external user session, or VDR implementation is introduced.
- No hard-delete executor is introduced.
- `docs/package/` remains unchanged.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12
Remaining blockers: 0

## Result

R7 Knowledge Graph Gate technical evidence is passed for the RDB-derived graph implementation. R8 work may begin only after the PACK-R7-01 branch passes PR CI and is merged under the active R14 technical completion goal.
