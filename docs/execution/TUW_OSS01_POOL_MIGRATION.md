# PACK-OSS01-02 — authority-critical direct Pool migration

Status: canonical post-R14 extension under `USER-UMBRELLA-AUTONOMY-20260721`.
This is the just-in-time canonical form of `PROPOSED-PACK-OSS01-02`; frozen
`docs/package/**` remains unchanged.

## Scope and invariants

- Reuse the existing Vault-owned `DatabaseService`, `TenantAwareDataSource`,
  `AuditService` transaction client, and process-role assertion. This is L0:
  no upstream source, test fixture, dependency, fork, or vendored code is
  introduced.
- Every tenant-scoped query keeps a transaction-local tenant GUC and explicit
  `tenant_id` predicate where present. Query-stage permission/search scope,
  deny-overrides, ethical walls, and safe-denied behavior do not change.
- Audit remains in the business transaction. A direct-pool removal cannot
  create a second audit transaction or weaken audit failure rollback.
- Runtime application code uses `DATABASE_RUNTIME_URL` only through the
  central provider. Owner migration/maintenance tooling is not changed.

## TUW inventory

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS01-DBM-TUW-001` | C | DBA-004 | migrate Audit/Tenant/Permission core direct pools |
| 2 | `DEVOPS-OSS01-DBM-TUW-002` | C | DBM-001 | migrate Auth/User session direct pools via bounded adapter |
| 3 | `DEVOPS-OSS01-DBM-TUW-003` | C | DBM-002 | migrate Matter/Client/Party/Wall/Break-glass direct pools |
| 4 | `DEVOPS-OSS01-DBM-TUW-004` | C | DBM-003 | migrate Document/Storage/Search direct pools and close PACK gate |

## `DEVOPS-OSS01-DBM-TUW-001`

- **Files create:** none.
- **Files modify:** `apps/api/src/modules/audit/audit.service.ts`,
  `audit-anchor-job.service.ts`, `apps/api/src/modules/tenant/tenant.store.ts`,
  `apps/api/src/modules/permission/permission.service.ts`,
  `document-permission.service.ts`, `wall-membership.reader.ts`,
  `apps/api/src/common/guards/require-roles.guard.ts`, and only their
  colocated specs; `security/oss-source-map.yml` OSS-01 constructor rows only.
- **Files NOT-modify:** permission evaluation rules, audit metadata/action
  schema, RLS/migrations, dependencies/locks, `docs/package/**`.
- **Implementation:** replace module-level pool/getPool access with injected
  existing database interfaces. Tenant queries use the central tenant
  transaction/client. Any tenant-less lookup is limited to the already
  allowlisted stored-function path; no generic query escape hatch is added.
- **Verification:** affected unit specs; `permission-matrix`, `cross-tenant`,
  `fail-closed`, `audit-immutability`, relevant `audit-coverage`; audit insert
  failure rollback; authority checker shows the listed sites removed.
- **Stop:** PermissionService bypass, audit transaction split, or a required
  generic tenant-less table query.

## `DEVOPS-OSS01-DBM-TUW-002`

- **Files create:** only if necessary,
  `apps/api/src/common/db/auth-runtime-query.service.ts` and its spec, with
  explicit token-hash lookup/revoke/consume methods and no generic query API.
- **Files modify:** `apps/api/src/modules/auth/session.repository.ts`,
  `mfa.service.ts`, `password-reset.service.ts`,
  `apps/api/src/modules/user/user.service.ts`, auth/user modules and their
  colocated specs; source-map constructor rows only.
- **Files NOT-modify:** password/MFA algorithms, cookie/token format, role
  issuance policy, SECURITY DEFINER SQL body, migrations/RLS, dependencies,
  `docs/package/**`.
- **Verification:** affected unit specs, `auth-session`, `auth-mfa`,
  `fail-closed`, cross-tenant, disabled-user and token-replay negatives.
- **Stop:** owner credential or tenant-less generic table scan required.

## `DEVOPS-OSS01-DBM-TUW-003`

- **Files create:** none.
- **Files modify:** listed Matter member/conflict/dashboard/issue services,
  Client, Party, Ethical-wall, Break-glass reader, their modules/specs, and
  source-map constructor rows only.
- **Files NOT-modify:** Matter state machine, role matrix, wall
  deny-overrides, break-glass approval semantics, migrations/RLS,
  dependencies, `docs/package/**`.
- **Verification:** affected specs, matter core/access/lifecycle,
  permission-matrix wall, ethical-wall, break-glass, cross-tenant and matter
  audit coverage. Confirm wall A→B, B→A and nearest unauthorized negative.
- **Stop:** query-stage filter becomes a post-filter or audit loses atomicity.

## `DEVOPS-OSS01-DBM-TUW-004`

- **Files create:** none.
- **Files modify:** bulk-upload batch, edit-session sweeper, duplicate
  detector, zip-child service, FileObject service, search permission scope
  provider, their modules/specs, and source-map constructor rows only.
- **Files NOT-modify:** storage object semantics, immutable triggers, search
  scope SQL meaning, result post-filtering, migrations/RLS, dependencies,
  `docs/package/**`.
- **Verification:** affected specs; document-access, storage-isolation,
  search-permission, metadata-leakage, cross-tenant and audit-coverage; final
  `pnpm lint`, typecheck, test, build, owner DB up/down/up, seed, full
  integration, frozen-doc/backlog/source-map/reuse-first/diff checks.
- **Stop:** storage rollback or queue atomicity breaks, or search needs result
  post-filtering.

## Evidence and completion boundary

Each TUW records source SHA/tree, exact changed constructor inventory,
focused/negative/audit commands, synthetic-only evidence, and truth state in
`artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS01-02/<tuw>/`. The final
TUW additionally records the before/after direct-pool delta and full
regression receipt. CI, PR/push/merge, deployment, external mutation, release,
and go-live remain distinct and unclaimed.
