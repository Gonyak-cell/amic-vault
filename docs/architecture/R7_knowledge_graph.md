# R7 Knowledge Graph Technical Contract

Status: active R7 implementation detail for PACK-R7-01. This extends the frozen package without modifying `docs/package/`.

## Scope

PACK-R7-01 implements the eight R7 `GRAPH-*` TUWs in `docs/backlog/backlog_r4_r14.json`:

| TUW | Implementation contract | Verification |
|---|---|---|
| GRAPH-TAXO-NODEEDGE-TUW-001 | Shared taxonomy for Client, Matter, Document, Version, Clause, Issue, Risk and edge types `HAS_*` / `RELATED_TO`. | Shared schema tests cover taxonomy and ID-only fact shape. |
| GRAPH-TAXO-NODEEDGE-TUW-002 | Graph store adapter is isolated behind API graph services. Active adapter is PostgreSQL/RLS-backed derived graph tables. | No Neo4j driver or external graph service dependency is introduced. |
| GRAPH-PERM-QUERY-TUW-001 | Graph query must first pass `PermissionService.canReadMatter`, then inject the existing search permission SQL scope before traversing document-linked edges. | Integration tests cover membership, explicit document deny, wall isolation, and no denied IDs in facts. |
| GRAPH-MAPPER-RDB-TUW-001 | Sync maps Client, Matter, non-deleted Document, current Version, and parent chunk-backed Clause nodes idempotently. | Sync can be run twice without duplicates; deleted documents are marked stale, not deleted. |
| GRAPH-SYNC-EVENT-TUW-001 | `POST /v1/graph/sync` creates a sync run, refreshes derived nodes/edges, and records `GRAPH_SYNCED`. | Sync audit metadata contains only IDs/counts/hash refs. |
| GRAPH-CONSIST-CHECK-TUW-001 | `tools/graph/check-consistency.ts` and `GET /v1/graph/consistency` report drift by IDs only. | Consistency output has no title, body, snippet, raw, or source text. |
| GRAPH-AI-EVID-TUW-001 | Evidence Pack `graphFacts` is enabled from authorized graph query output only, restricted to document IDs already admitted by R6 AI retrieval. | AI summary integration verifies graph query audit and no ai-denied document facts. |
| GRAPH-GATE-REPORT-TUW-001 | `docs/ledger/gates/R7_gate.md` records permission, wall, consistency, deleted-sync, audit, rollback, and regression evidence. | R7 Gate report is append-only evidence outside `docs/package/`. |

## Store Choice

R7 is the first release where Neo4j/GraphSync is allowed, but the R7 TUW does not require adding a graph database dependency. The active adapter is PostgreSQL-backed to preserve RLS, transactionality, and existing permission filter reuse. The tables are derived indexes:

- `graph_nodes`
- `graph_edges`
- `graph_sync_runs`

Graph sync never hard-deletes derived rows. Missing or deleted source objects are represented by `stale=true`.

## Permission Contract

Graph query follows Permission-before-graph:

1. Validate matter readability through `PermissionService.canReadMatter`.
2. Build the existing `SEARCH_PERMISSION_SCOPE_PROVIDER` SQL scope for the actor.
3. Create an `idx` CTE with document/matter/version scope columns.
4. Join graph edges to `idx` before traversal and only return non-stale source/target nodes.

Matter-level `HAS_MATTER` facts are returned only after step 1 succeeds. Document-linked facts additionally require step 2 and are filtered before traversal.

## AI Contract

Evidence Pack graph facts are enabled in R7, but rule findings remain forced empty until R8. AI summary code passes only retrieval-admitted document IDs into graph facts. Therefore graph facts cannot introduce documents blocked by permissions, ethical walls, or `ai_allowed=false`.

## Sensitive Data Rule

Graph nodes, edges, facts, consistency output, and audit metadata must not contain document body, title, snippets, raw headers, extracted source text, free-form comments, prompt text, or response text. They may contain UUIDs, source hashes, counts, statuses, and bounded scope labels only.
