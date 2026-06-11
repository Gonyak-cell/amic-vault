# Database Migrations

AMIC Vault uses `node-pg-migrate` in SQL-file mode. Migration files live in this
directory and use the `NNNN_name.sql` naming convention. Each file must contain
both markers:

```sql
-- Up Migration

-- Down Migration
```

The runner stores history in `schema_migrations` and executes migrations in a
single transaction.

## Commands

```bash
pnpm db:migrate
pnpm db:rollback
pnpm db:seed
```

`DATABASE_URL` is the migration-owner connection string. `APP_DATABASE_URL` is
the runtime app role used by integration tests.

## Current Tables

- `tenants`: global tenant registry. This table is RLS-exempt and every
  migration that creates or changes it must include an `RLS-EXEMPT:` comment.
- `users`: tenant-scoped user rows with `tenant_id NOT NULL`, `ENABLE ROW LEVEL
  SECURITY`, `FORCE ROW LEVEL SECURITY`, and tenant-context policies.
- `audit_events`: tenant-scoped append-only audit log with metadata key
  constraints, tenant RLS, lookup indexes, and DB-level mutation blocking.

Changing the migration tool requires an ADR update and human approval before
the change is implemented.
