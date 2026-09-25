# Issue 470 E01/E03 latest authority race repair

Date: 2026-09-25 KST

Repository: `/Users/jws/.codex/worktrees/amic-vault-issue-470-provider-20260925`

Baseline HEAD: `94bc0ba0c991fb4c696f5433185395a48a227d4b`

## Implemented authority ordering

- `TenantAwareDataSource` and `DatabaseService` now support a tenant-local PostgreSQL `SERIALIZABLE` transaction. An outer serializable transaction satisfies nested repeatable-read callers; a weaker outer transaction cannot satisfy a stronger nested request.
- Migration `0217_lock_internal_latest_authority.sql` adds a tenant-GUC-bound, `SECURITY DEFINER` function that returns no authority data and acquires `FOR UPDATE` row locks for the exact actor, document, Matter membership, current version, file, promotion/scan, matching document-read ACL rows, actor group memberships, Matter walls/memberships, actor break-glass rows, current canonical row, and document DLP assessment/review rows.
- The migration contains no `LOCK TABLE`, `SHARE MODE`, or `ACCESS EXCLUSIVE` statement. The fence is scoped by tenant, actor, Matter, and document identifiers. Inserts that reference a locked actor/document/Matter/wall/assessment row wait on that exact parent row; absent-row predicates are ordered by the serializable snapshot.
- `latest()` acquires the row fence before the canonical `DocumentPermissionService` read, then runs permission, promotion, exact-version projection, and DLP policy under the same transaction. It projects only the first authorized version and policy reference; an independent review found and removed a redundant second full authorization pass that could duplicate DLP review audit work.
- PostgreSQL SQLSTATE `40001` is mapped to the same `403 PERMISSION_DENIED` fail-closed response. DLP assessment/audit writes associated with a forbidden decision are committed before the forbidden response is released.

## Acceptance evidence

| Criterion | Scenario and invocation | Binary observable | Artifact |
|---|---|---|---|
| Actual two-client latest-first ordering | `pnpm test:integration -- amic-os-vault-provider` against disposable PostgreSQL database `amic_vault_issue470_latest`; test pauses after the real `DocumentPermissionService.canReadDocument` ALLOW, starts the real authenticated `DELETE /v1/matters/:matterId/members/:userId`, and queries `pg_stat_activity` | `wait_event_type = 'Lock'` and non-empty `pg_blocking_pids(pid)` are required before release; latest returns 200, then DELETE returns 204 | `issue-470-e01-latest-postgres-integration.log`; test source `tests/integration/amic-os-vault-provider.spec.ts:285` |
| Revoke-first fail closed | Same integration test re-adds the read-only member, completes the real DELETE with 204, then calls provider latest | Latest returns 403 after both the prior race revoke and a completed-before-read revoke | `issue-470-e01-latest-postgres-integration.log`; test source `tests/integration/amic-os-vault-provider.spec.ts:395` |
| Ordinary reader and exact gates | Real provider HTTP request with a read-only Matter member; separate real fixture exercises a promoted clean current version, an unpromoted current version, and promoted passport-positive canonical content | Read-only user receives metadata while its request owns the fence; promoted clean returns 200; unpromoted and DLP-positive return 403; persisted DLP assessment is `findings` with one restricted finding | `issue-470-e01-latest-postgres-integration.log`; test source `tests/integration/amic-os-vault-provider.spec.ts:410` |
| 1 GiB type boundary | Focused Vitest suite | HWP, HWPX, EML, and Outlook metadata each pass at exactly `AMIC_OS_VAULT_MAX_UPLOAD_BYTES`; max + 1 returns 403 | `issue-470-e01-latest-unit.log`; source `apps/api/src/modules/integrations/amic-os-vault-provider/amic-os-vault-read.latest.service.spec.ts` |
| Serializable failure | Focused Vitest suite injects PostgreSQL code `40001` from the authority fence | Service returns 403 and never starts authorization | `issue-470-e01-latest-unit.log` |
| Migration down/up and grants | `node tools/db/migrate.mjs down 1`, absence query, `node tools/db/migrate.mjs up`, function/grant queries on disposable database | Down: function absent. Up: function present, `vault_app` EXECUTE true, PUBLIC EXECUTE false | `issue-470-e01-latest-migration-roundtrip.log` |
| Static verification | API TypeScript no-emit compile; ESLint over every owned TypeScript source/spec | Both commands exit 0 | `issue-470-e01-latest-typecheck.log`, `issue-470-e01-latest-lint.log` |
| Focused regression | Five focused spec files | 5 files, 45 tests passed | `issue-470-e01-latest-unit.log` |

The integration runner also rebuilt domain/shared/AI/API, prepared the queue with the migration role, and seeded the disposable database before running four provider integration scenarios. Final result: 1 file passed, 4 tests passed.

## Evidence checksums

- `issue-470-e01-latest-postgres-integration.log`: `de8b5725493592dc6006b525040d50f3282fb0b3bf5dbe9c957b95e1c0969a8c`
- `issue-470-e01-latest-unit.log`: `4a6e2a7fbcbef57fb26759952751338ae26830d1e681dc361919b9a3564b8fdf`
- `issue-470-e01-latest-typecheck.log`: `16834415285119a2b7a019b0ea8fcf21fe945de6d2efc45ab2d8ce0e87b02707`
- `issue-470-e01-latest-lint.log`: `16834415285119a2b7a019b0ea8fcf21fe945de6d2efc45ab2d8ce0e87b02707`
- `issue-470-e01-latest-migration-roundtrip.log`: `6ca3a66a8d7eac256f14945ed9ec63ebd5b46c4571a792a00da963eadd823e4e`

## Shared-worktree boundary

No commit, push, staging operation, branch switch, deployment, or production mutation was performed.

The pre-existing A02 search/controller changes remain present and were not reverted. The E01/E03 race repair owns:

- complete files `apps/api/src/common/db/tenant-aware-datasource.ts` and its spec;
- complete files `apps/api/src/common/db/database.service.ts` and its spec;
- migration `db/migrations/0217_lock_internal_latest_authority.sql`;
- `latest()` authority transaction and `lockLatestAuthority()` in `amic-os-vault-read.service.ts` (current lines 407-493), plus the latest-only imports/types/helper used by that block;
- `amic-os-vault-read.latest.service.spec.ts`;
- the latest-only integration additions in `tests/integration/amic-os-vault-provider.spec.ts` (current lines 101-166, 249-275, and 285-491).

The A02-owned search DTO/filter/controller and `search()` sections were left unchanged during this repair. Because `amic-os-vault-read.service.ts` is shared, stage its latest hunk selectively if A02 is not yet ready.
