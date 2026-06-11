# R0 Gate Report — Foundation Completion

Status: BLOCKED / approval waiting
Date: 2026-06-12
Operator: Codex
Scope: R0 after PACK-R0-05 merge
Main evidence head before Gate remediation: `631d13f1a1350d7ae4153eade591835994a9e47a`
Main CI evidence: https://github.com/Gonyak-cell/amic-vault/actions/runs/27356314263

## Runtime Evidence

- Local OS: macOS 26.5.1 build 25F80
- Node: v22.22.3
- pnpm: 9.15.9
- Docker: 29.5.3
- Docker Compose: v5.1.4

## R0-G1. New Clone Reproducibility

Machine evidence is green, but final Gate pass is pending human approval.

- GitHub Actions `verify` passed: install, lint, typecheck, test, build, backlog validation, docs-package frozen check, migration convention check.
- GitHub Actions `db-integration` passed: docker compose up, migration convention check, migrate, rollback, migrate, seed, audit-immutability, cross-tenant, fail-closed, full integration.
- GitHub Actions `docker-build` passed: api, web, ingestion images.
- Local supplemental verification after Gate remediation:
  - `pnpm db:migrate`: pass
  - `pnpm db:rollback`: pass
  - `pnpm db:migrate`: pass
  - `pnpm db:seed`: pass
  - `pnpm lint`: pass
  - `pnpm typecheck`: pass
  - `pnpm test`: pass
  - `pnpm build`: pass
  - `pnpm test:integration -- fail-closed cross-tenant audit-immutability rls`: pass, 5 files / 16 tests
  - `pnpm test:integration`: pass, 9 files / 28 tests

## R0-G2. Cross-Tenant Endpoint Blocking

Machine status: PARTIAL / blocked by Gate wording.

Passing evidence:

- `pnpm test:integration -- cross-tenant`: pass in CI and local Gate run.
- Current protected tenant route collection:
  - `/v1/tenant/settings`
  - `/v1/tenant/workspaces`
  - `/v1/tenant/workspaces/:workspaceId`
- Public routes at R0:
  - `/v1/health/live`
  - `/v1/health/ready`
  - `/metrics`
  - `/v1/auth/login`
  - `/v1/auth/password-reset/request`
  - `/v1/auth/password-reset/confirm`
- `POST /v1/auth/logout` is authenticated, but has no tenant resource ID parameter.

SQL evidence after Gate remediation:

```sql
SELECT t.tablename
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = t.schemaname
      AND p.tablename = t.tablename
  )
  AND t.tablename NOT IN ('tenants')
ORDER BY t.tablename;
```

Result: `0 rows`.

```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT IN ('tenants')
ORDER BY c.relname;
```

Result: `audit_events`, `password_reset_tokens`, `schema_migrations`, `sessions`, `users`, and `workspaces` all have `relrowsecurity = true` and `relforcerowsecurity = true`.

Blocking ambiguity:

- The R0-G2 checklist requires this SQL:

```sql
SET app.current_tenant_id = '<tenant-beta-uuid>';
SELECT count(*) FROM matters WHERE tenant_id = '<tenant-alpha-uuid>';
```

- At R0, `matters` is not present; Matter Core is R1 scope. Direct execution returns:

```text
ERROR: relation "matters" does not exist
```

- Equivalent R0 table check was run against `workspaces`:

```sql
SET app.current_tenant_id = '22222222-2222-4222-8222-222222222222';
SELECT count(*) AS alpha_workspaces_visible_to_beta
FROM workspaces
WHERE tenant_id = '11111111-1111-4111-8111-111111111111';
```

Result: `0`.

Required human decision: confirm whether R0-G2 should accept the R0-equivalent `workspaces` SQL, or whether the Gate checklist should be clarified because `matters` starts in R1.

## R0-G3. Audit UPDATE/DELETE DB Failure

Machine status: PASS.

- `pnpm test:integration -- audit-immutability`: pass in CI and local Gate run.
- App role mutation grants:

```text
grantee | privilege_type
--------+---------------
(0 rows)
```

- Audit mutation triggers:

```text
trg_audit_events_block_truncate
trg_audit_events_block_update_delete
```

## R0-G4. Fail-Closed Behavior

Machine status: PASS after Gate remediation.

- `pnpm test:integration -- fail-closed`: pass.
- Covered cases:
  - FC-01 evaluator exception -> `PERMISSION_DENIED`
  - FC-02 protected tenant endpoint without session -> `AUTH_REQUIRED`
  - FC-03 session repository failure -> `AUTH_REQUIRED`
  - FC-04 undefined / unparseable permission decision -> `PERMISSION_DENIED`
  - FC-05 blocked response body excludes stack/internal/session/token strings

## R0-G5. ADR Approval

Machine status: BLOCKED / approval waiting.

- `node tools/backlog/validate.mjs docs/package/codex/data/backlog_r0_r3.csv`: pass, 174 TUWs
- `node infra/ci/scripts/check-docs-package-frozen.mjs`: pass, 51 files
- `node tools/db/check-migration-conventions.mjs`: pass
- `docs/adr/ADR-001.md` through `docs/adr/ADR-012.md` exist, but all remain `Status: Proposed for R0 Gate`.
- Per `50_Verification_Security_Gates.md` §2.0, every Gate requires human approval signature; Codex cannot mark the Gate passed.

Required human approval:

- Approve ADR-001 through ADR-012 as `Accepted`, or provide exact edits.
- Sign R0 Gate below.

## Approval

Gate approver: PENDING
Decision: PENDING
Approval date: PENDING

## Result

R0 Gate is not passed. R1 PACK work must not begin until:

1. R0-G2 `matters` vs R0 `workspaces` SQL ambiguity is resolved.
2. ADR-001 through ADR-012 receive human approval or exact correction instructions.
3. A human Gate approver signs this report.
