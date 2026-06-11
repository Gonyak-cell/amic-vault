# Migration Conventions

Every row-level table must be tenant-scoped at creation time:

- `tenant_id uuid NOT NULL`
- `ENABLE ROW LEVEL SECURITY`
- `FORCE ROW LEVEL SECURITY`
- policy name `rls_<table>_tenant`
- policy predicate based on `current_setting('app.current_tenant_id', true)::uuid`

The only allowed R0 exception is `tenants`, because it is the global tenant
registry. Future global reference tables must include a migration-local comment:

```sql
-- RLS-EXEMPT: <short reason>
```

The CI checker rejects new `CREATE TABLE` blocks that omit tenant scope, RLS, or
the exception comment.

Audit metadata must never contain document body text, snippets, raw content,
passwords, tokens, or free-form confidential text. Use reference IDs, hashes,
code values, and bounded booleans only.
