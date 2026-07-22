# PACK-OSS01-01 — runtime DB role and central contract

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721`. This converts
`PROPOSED-PACK-OSS01-01` into four independently testable units without
modifying frozen `docs/package/**`.

## Scope and invariants

- `vault_app` is the only API/worker runtime database identity. Migration,
  seed, and schema ownership credentials never reach the runtime process.
- Tenant-local GUC, RLS, permission-before-search, AuditService atomicity and
  immutable-original authority are preserved. A central pool is not a bypass
  around `TenantAwareDataSource` or PermissionService.
- A direct constructor is migrated only after its process role, ownership,
  transaction/audit coupling, shutdown behavior and exact target file are
  inventoried. CLI-only construction is reported separately from runtime code.
- No upstream source is copied, vendored, forked, or run as a product service.
  PostgreSQL/pg Pool/pg-boss behavior is used only through existing installed
  dependencies and the accepted L0 authority map.

## TUW inventory

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS01-DBA-TUW-001` | H | OSS00A-03 | inventory direct Pool/PgBoss construction and freeze migration batches |
| 2 | `DEVOPS-OSS01-DBA-TUW-002` | C | DBA-001 | split owner/runtime URLs and assert fail-closed runtime role |
| 3 | `DEVOPS-OSS01-DBA-TUW-003` | C | DBA-002 | add the singleton DatabaseModule around existing common/db authority |
| 4 | `DEVOPS-OSS01-DBA-TUW-004` | C | DBA-003 | prove AppModule/worker runtime-role isolation in integration harness |

## `DEVOPS-OSS01-DBA-TUW-001`

- **Files create:** `tools/quality/check-database-authority.mjs`,
  `tools/quality/check-database-authority.spec.mjs`,
  `docs/architecture/oss-adoption-decisions/runtime-db-queue-inventory.md`.
- **Files modify:** `security/oss-source-map.yml` OSS-01 L0 inventory rows only.
- **Files NOT-modify:** runtime source, env, migrations, lockfile, workflows,
  `docs/package/**`.
- **Implementation:** reuse an existing parser if present; otherwise use a
  bounded lexer that excludes comments, strings and type-only imports. Inventory
  every direct `Pool`/`PgBoss` construction with owner module, process role,
  connection environment, tenant-GUC method, transaction/audit coupling,
  shutdown behavior, and one future migration batch (`DBA`, `DBM`, `DBR`, or
  `QUE`). Runtime and CLI paths are distinct.
- **Verification:** current count baseline is either reproduced with every
  drift explained OR explicitly updated with a source-bound report; synthetic
  alias/import/comment/string/type-only/CLI fixtures classify correctly; zero
  unclassified runtime sites; frozen-doc/backlog/diff checks pass.
- **Stop:** do not begin a migration batch if a site has unknown runtime role
  or transaction semantics.

## `DEVOPS-OSS01-DBA-TUW-002`

- **Files create:** `apps/api/src/common/db/runtime-role.assertion.ts`,
  `apps/api/src/common/db/runtime-role.assertion.spec.ts`.
- **Files modify:** `.env.example`, `infra/docker-compose.dev.yml`,
  `tools/db/config.mjs`, `apps/api/src/main.ts`, `apps/api/src/worker-main.ts`,
  `security/oss-adoption-decisions.yml` L0-ineligible path rows only.
- **Files NOT-modify:** migration ownership/grants, RLS policies,
  PermissionService, audit schema, dependencies/locks, `docs/package/**`.
- **Implementation:** define `DATABASE_MIGRATION_URL` and
  `DATABASE_RUNTIME_URL`; reject a production `DATABASE_URL` fallback; assert
  runtime `current_user`, superuser/BYPASSRLS flags and protected-table
  ownership before listen/worker work; split owner/runtime compose credentials;
  never log a URL or password. Before creating either assertion file, register
  its exact path as Vault-owned L0-ineligible code in the reuse-first decision
  manifest; this is not upstream source reuse.
- **Verification:** safe runtime role starts; owner/superuser/BYPASSRLS/table-
  owner/credential-swap fixtures fail before listen; migration up/down/up uses
  the owner URL; URL values are absent from output; required focused and DB
  regression checks pass.
- **Stop:** if role attributes cannot be inspected safely or the existing
  schema only works when owned by the runtime role, record `BLOCKED`.

## `DEVOPS-OSS01-DBA-TUW-003`

- **Files create:** `apps/api/src/common/db/database.module.ts`,
  `apps/api/src/common/db/database.tokens.ts`,
  `apps/api/src/common/db/database.service.ts`, and colocated `*.spec.ts`.
- **Files modify:** `apps/api/src/common/db/tenant-aware-datasource.ts`, its
  spec, `apps/api/src/app.module.ts`, `security/oss-source-map.yml` OSS-01
  direct-constructor baseline only, and
  `security/oss-adoption-decisions.yml` L0-ineligible path rows only.
- **Files NOT-modify:** PermissionService decisions, audit schema/RLS policy,
  migration runner, dependencies/locks, `docs/package/**`.
- **Implementation:** extend `common/db` rather than create a parallel data
  layer. One provider owns Pool connect/error/end; `tenantTransaction` performs
  BEGIN → transaction-local tenant setting → work → COMMIT/ROLLBACK → release;
  tenant-less auth is an allowlisted stored-function adapter; nested misuse is
  rejected or explicitly receives the existing client; close is idempotent.
  Before product files are created, register their exact paths as L0-ineligible
  (Vault-owned control code, no upstream source reuse); update only the locked
  constructor count/hash caused by the singleton provider.
- **Verification:** commit/rollback/GUC isolation/release tests; 50
  create/close loops with no connection delta; missing tenant/nested misuse and
  pool-error cases fail closed; AuditService transaction compatibility passes.
- **Stop:** do not migrate consumers if audit atomicity or tenant-local GUC is
  not preserved.

## `DEVOPS-OSS01-DBA-TUW-004`

- **Files create:** `tests/integration/fail-closed/runtime-role-startup.spec.ts`,
  `tests/integration/cross-tenant/runtime-role-rls.spec.ts`.
- **Files modify:** `tools/integration/run.mjs`,
  `tests/integration/helpers/db.ts`, `.github/workflows/ci.yml`, and compose
  environment wiring required for the isolated test process.
- **Files NOT-modify:** canonical suite-directory registry, test skip/quarantine
  configuration, RLS expected outcomes, dependencies/locks, `docs/package/**`.
- **Implementation:** keep migration/seed owner environment separate from the
  spawned API/worker environment; prove it cannot inherit owner credentials;
  expose only test-process identity evidence without URL values; inject DB
  unavailable/missing-GUC/wrong-role cases.
- **Verification:** owner migration up/down/up; runtime AppModule smoke;
  owner-credential negative boot; cross-tenant, fail-closed, and
  audit-immutability integration suites. CI workflow is wired but never run
  locally as a CI claim.
- **Stop:** if runner process/environment isolation cannot be proven, retain
  this TUW `BLOCKED` and do not claim runtime-role execution.

## Completion boundary

This PACK establishes an evidence-backed DB authority boundary and central
connection candidate. It neither deploys a database topology nor permits
PgBouncer, OpenSearch, external IdP, source vendoring, CI execution, push/PR,
merge, release, or go-live.
