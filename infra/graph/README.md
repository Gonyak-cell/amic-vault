# R7 Graph Adapter

PACK-R7-01 uses the built-in PostgreSQL graph adapter.

- No Neo4j service is required for local development.
- No `neo4j-driver` or external graph dependency is added.
- `graph_nodes` and `graph_edges` are derived tables protected by tenant RLS.
- Future Neo4j adoption must keep the same graph service interface and prove query-stage permission injection before traversal.

Local technical checks:

```bash
pnpm graph:check -- --tenant-id 11111111-1111-4111-8111-111111111111 --matter-id <matter_uuid>
```
