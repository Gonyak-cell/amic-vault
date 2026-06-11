# Migration Rollback

Rollback is a development and CI safety mechanism. Production rollback that
destroys durable records, especially `audit_events`, requires an explicit human
approval and a written recovery plan.

## Full Round Trip

```bash
pnpm db:migrate
pnpm db:rollback
pnpm db:migrate
```

The CI helper `infra/ci/scripts/migration-roundtrip.sh` captures a schema hash
after the first migrate, rolls all migrations back, reapplies them, and compares
the resulting schema hash.

## Step Rollback

The default `pnpm db:rollback` command rolls back all applied migrations in the
current database. To roll back fewer migrations during local investigation, run
`pnpm exec node-pg-migrate down <count>` with the same flags used by
`tools/db/migrate.mjs`.

## Append-Only Exception

`0006_audit_append_only.sql` intentionally removes mutation privileges and adds
mutation-blocking triggers. Its down path is present for dev/CI schema round
trips only; using it to make audit rows mutable in a shared or production
environment is prohibited without human approval.
