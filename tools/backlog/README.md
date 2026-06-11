# Backlog Validator

`validate.mjs` checks the R0-R3 machine-readable backlog.

```bash
node tools/backlog/validate.mjs docs/package/codex/data/backlog_r0_r3.csv
```

It validates required fields, unique IDs, dependency existence, DAG acyclicity, release ordering,
CSV/JSON parity, and release-ban rules derived from the Master Brief:

- AI feature work before R6 is forbidden except `AI-AIPOLI-SCHEMAONLY-TUW-001`.
- VDR, external portal, secure links, and external sharing before R11 are forbidden.
- Neo4j or GraphSync before R7 is forbidden.
- Vector or semantic search before R6 is forbidden.
- Hard delete or disposal before R12 is forbidden.
