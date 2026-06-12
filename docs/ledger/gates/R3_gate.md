# R3 Gate Report - Permission-bound Search

Status: TECHNICAL PASS / human sign-off waived by operator
Date: 2026-06-12
Operator: Codex
Scope: R3 after PACK-R3-05 merge, including PostgreSQL FTS indexing, query-time permission scope injection, leakage prevention, Korean search evaluation, and search UI publication
Base main head: `5dce3c38286c10588eda2bc426309a52cf50045d`
R3 PACK main CI evidence: https://github.com/Gonyak-cell/amic-vault/actions/runs/27387070651

## Waiver

Human Gate sign-off, Claude review, and human merge approval are waived by the active R14 technical completion goal and the 2026-06-12 operator decision in `docs/ledger/decision.md`.

The waiver does not waive technical evidence, security invariants, release order, Gate checklist coverage, or append-only ledger records.

## Runtime Evidence

- PACK-R3-05 was merged to `main` as merge commit `5dce3c38286c10588eda2bc426309a52cf50045d`.
- Main CI run `27387070651`: pass.
  - `verify`: pass (`pnpm install --frozen-lockfile`, lint, typecheck, unit tests, build, backlog validation, docs-package frozen check, migration convention check).
  - `db-integration`: pass (compose up, migration convention check, migrate, rollback, migrate, seed, audit-immutability, cross-tenant, fail-closed, permission-matrix, search-filter, search-permission, metadata-leakage, full integration).
  - `docker-build`: pass (api, web, ingestion images).
  - `python-worker`: pass (ingestion worker tests).
- Local PACK-R3-05 validation evidence before merge: `pnpm install`, lint, typecheck, test, build, compose down/up, clean DB `db:migrate && db:rollback && db:migrate && db:seed`, `search-filter`, `search-permission`, `metadata-leakage`, full integration, backlog validation, docs frozen check, migration convention check, Korean search eval, Next `/search` redirect smoke, and `git diff --cached --check` were green.
- `docker compose -f infra/docker-compose.dev.yml ps`: postgres, minio, minio-init, and ingestion are healthy.

## R0/R1/R2 Gate Regression

Machine status: PASS.

- Main CI `db-integration` reran R0/R1/R2 regression coverage in the R3 head:
  - `pnpm test:integration -- audit-immutability`: pass.
  - `pnpm test:integration -- cross-tenant`: pass.
  - `pnpm test:integration -- fail-closed`: pass.
  - `pnpm test:integration -- permission-matrix`: pass.
  - `pnpm test:integration`: pass, including R2 document-access, storage-isolation, legal-hold, and audit-coverage tests.
- All non-global public tables have at least one RLS policy:

```text
tablename
---------
(0 rows)
```

## R3-G1. Unauthorized Documents Not Exposed in Title, Snippet, Metadata, Counts, or Facets

Machine status: PASS.

- Covered by `tests/integration/metadata-leakage/search-metadata-leakage.spec.ts`.
- Denied-only query result: `total=0`, `results=[]`, and empty facet buckets.
- Mixed allowed/denied query result: total and facet counts include only authorized rows.
- Hidden document IDs, hidden titles, denied-only tokens, snippets, and facet counts are absent from serialized responses.
- PACK-R3-05 added endpoint-level attacker-supplied `matterId`/`clientId` filter leakage regression in `tests/integration/search-permission/search-filter-endpoint.spec.ts`.
- Main CI evidence:
  - `pnpm test:integration -- metadata-leakage`: pass.
  - `pnpm test:integration -- search-filter`: pass.
  - `pnpm test:integration -- search-permission`: pass.

## R3-G2. Wall Isolation in Both Directions

Machine status: PASS.

- Covered by:
  - `tests/integration/search-permission/search-wall.spec.ts`
  - `tests/integration/search-permission/search-wall-bidirectional.spec.ts`
  - `tests/integration/search-permission/search-permission-regression.spec.ts`
- Excluded wall subjects receive 0 search hits.
- Reverse-side wall exclusion is separately verified.
- Firm Admin role allow does not override wall exclusion.
- Wall changes are reflected on the next query without reindexing.
- Direct document access remains governed by R2 document PermissionService tests in full integration.

## R3-G3. Deleted and Superseded Rows Excluded

Machine status: PASS.

- Covered by `tests/integration/search-permission/search-core.spec.ts` and `tests/integration/search-permission/search-filter.spec.ts`.
- Default search excludes `document_status='deleted'` and `version_status='superseded'`.
- Explicit `versionStatus` filters still pass through the same permission-filtered SQL scope.
- Current integration DB contains deleted and superseded rows, proving exclusion is query behavior rather than fixture absence:

```text
document_status | version_status | count
----------------+----------------+------
deleted         | current        | 5
draft           | current        | 33
draft           | superseded     | 4
```

## R3-G4. Search Index Cross-tenant Blocked

Machine status: PASS.

- Covered by cross-tenant integration and search-index tenant isolation tests.
- R3 search tables have RLS and FORCE RLS enabled:

```text
relname                | relrowsecurity | relforcerowsecurity | policy_count
-----------------------+----------------+---------------------+-------------
document_search_index  | t              | t                   | 1
evaluation_cases       | t              | t                   | 1
```

- App role RLS session for tenant beta cannot read tenant alpha search-index rows:

```text
beta_rls_alpha_index_rows
-------------------------
0
```

## R3-G5. Permission Change and Index Reflection SLA

Machine status: PASS.

- Permission change search visibility SLA: immediate next query, independent of index mutation.
  - Covered by `tests/integration/search-permission/search-permission-sla.spec.ts`.
  - The test removes matter membership, reruns the same indexed-token search, observes `total=0`, and asserts `indexed_at` did not change.
- Wall change visibility SLA: immediate next query without reindexing.
  - Covered by `tests/integration/search-permission/search-permission-regression.spec.ts`.
- Index non-permission attribute reflection SLA target: metadata/status update to processed search-index row within 60 seconds in the R3 queue processor path.
  - Covered by `tests/integration/search-permission/search-index.spec.ts`.
  - The test measures metadata update plus `IndexingProcessor.handle(...)` elapsed time and asserts `elapsedMs < 60_000`.
  - Main CI full integration passed this path.

## R3-G6. Search Audit Coverage 100%

Machine status: PASS.

- Covered by `tests/integration/audit-coverage/search-audit.spec.ts` and full integration.
- Normal searches, zero-result searches, and provider-denied searches create `SEARCH_EXECUTED` audit rows.
- Audit metadata stores `query_hash`, `query_length`, `filter_refs`, `result_count`, and `duration_ms`; raw query, title, snippet, body, content, password, and token keys are not stored.
- Current local full integration evidence:

```text
search_events | unsafe_search_metadata
--------------+-----------------------
28            | 0
```

```text
action          | count
----------------+------
SEARCH_EXECUTED | 28
```

## R3-G7. No Post-filtering Bypass

Machine status: PASS.

- Search execution path uses `SEARCH_PERMISSION_SCOPE_PROVIDER` before query construction.
- `SearchQueryBuilder.build(...)` and `SearchQueryBuilder.buildFacets(...)` both receive the same permission scope and inject it into SQL before FTS predicates, pagination, totals, and facet aggregation.
- Static grep for post-filter patterns in `apps/api/src/modules/search`:

```text
rg -n "results?\\.filter|\\.filter\\(.*canRead|canRead(Document|Matter)|permissionService" apps/api/src/modules/search
Result: 0 matches
```

- Provider binding integration verifies the active provider is permission-backed and applies matter membership, document permission, and ethical wall filter rules.
- No client-side facet aggregation or result post-filtering exists; the web UI renders only server response fields.

## Search Quality and R3 Technology Decision

Machine status: PASS.

- `pnpm search:eval:korean`:

```json
{
  "cases": 30,
  "documents": 90,
  "precisionPercent": "100.0%",
  "recallPercent": "55.0%",
  "falsePositiveRatePercent": "0.0%"
}
```

- ADR-006 remains updated for the R3 decision: PostgreSQL FTS continues through R3; OpenSearch/Elasticsearch transition is not implemented before the R3 Gate.
- No vector, embedding, semantic search, external AI SDK/model call, Neo4j/graph, external sharing, VDR, external portal, secure-link, or hard delete implementation exists in R3.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12

## Result

R3 Gate technical evidence is passed. DLP 선행 work and R4 work may begin only after this Gate report branch passes PR CI and is merged under the active R14 technical completion goal.
