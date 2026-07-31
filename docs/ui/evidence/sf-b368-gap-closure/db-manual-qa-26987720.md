# SF-B368-26987720 manual QA matrix

- source SHA: `269877204c75a43c47f193fdb96fa52e1ad6a0b0`
- evidence log:
  `docs/ui/evidence/sf-b368-gap-closure/final-fresh-db-integration-26987720.log.gz`

## manualQa

### surfaceEvidence

| scenario id                   | criterion reference              | surface                                       | exact invocation                                                                                                                                                                                               | verdict                                 | artifactRefs                     |
| ----------------------------- | -------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------- |
| DB-ROUNDTRIP-001              | migration round-trip             | PostgreSQL schema                             | `DATABASE_MIGRATION_URL=postgres://.../amic_vault_sf_b368_26987720_final pnpm db:migrate`, `pnpm db:rollback`, then `pnpm db:migrate`; queried `select count(*), max(name) from schema_migrations` with `psql` | PASS                                    | `ART-DB-LOG`, `ART-DB-INVENTORY` |
| STORAGE-PRIVATE-VERSIONED-001 | private/versioned object storage | MinIO bucket                                  | `docker exec amic-vault-dev-minio-init-1 sh -lc 'mc version info local/amic-vault-sf-b368-26987720-final; mc anonymous get local/amic-vault-sf-b368-26987720-final'`                                           | PASS                                    | `ART-DB-LOG`                     |
| INTEGRATION-FULL-001          | full integration regression      | PostgreSQL + MinIO + current ingestion worker | `DATABASE_MIGRATION_URL=.../amic_vault_sf_b368_26987720_final S3_BUCKET=amic-vault-sf-b368-26987720-final INGESTION_WORKER_URL=http://127.0.0.1:8000 pnpm test:integration`                                    | PASS (19 batches, 141 files, 458 tests) | `ART-DB-LOG`                     |

### adversarialCases

| scenario id          | criterion reference             | adversarial class                                                      | expected behavior                                                                                                        | verdict | artifactRefs                     |
| -------------------- | ------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- | -------------------------------- |
| DB-ROUNDTRIP-ADV-001 | migration rollback safety       | destructive-schema round trip                                          | rollback removes all migration rows, reapply restores the full 206-migration inventory without affecting other databases | PASS    | `ART-DB-LOG`, `ART-DB-INVENTORY` |
| STORAGE-ADV-001      | storage exposure boundary       | anonymous object access                                                | bucket remains private while version history is enabled                                                                  | PASS    | `ART-DB-LOG`                     |
| INTEGRATION-ADV-001  | fail-closed/security regression | permission, tenant, wall, ingestion and storage negative-path coverage | negative-path cases deny or contain as asserted; no suite failures or skips                                              | PASS    | `ART-DB-LOG`                     |

### artifactRefs

| id                 | kind                  | description                                                                                                                       | path                                         |
| ------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `ART-DB-LOG`       | terminal transcript   | Complete migrate/rollback/migrate/seed/bucket/full integration output for exact SHA                                               | `final-fresh-db-integration-26987720.log.gz` |
| `ART-DB-INVENTORY` | database query output | Exact final `schema_migrations=206`, last migration `0212_add_work_notification_audit_actions`, seed/final tenant and user counts | `final-fresh-db-integration-26987720.log.gz` |
