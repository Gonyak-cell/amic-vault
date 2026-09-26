# B08 provider native PDF/EML document-copy evidence

Date: 2026-09-25 (Asia/Seoul)

Repository/worktree: `/Users/jws/.codex/worktrees/amic-vault-issue-470-provider-20260925`

Scope: provider-side code and local automated verification only. No deployment, production data, Windows host, or external account was used.

## Implemented surface

- Added strict provider request parsing for immutable `application/pdf` and `message/rfc822` copies, with exact document/version/file/hash/size/MIME binding and a 25 MiB bound.
- Added `prepare`, `complete`, `list`, `read`, and `commit` endpoints under `/v1/integrations/amic-os/vault/edit/document-copy/*`.
- Reused authoritative provider permission, DLP-gated download, quarantine storage, upload, audit, and tenant transaction primitives.
- Preserved the original exact source and published a new document only from the retained, hash-verified snapshot.
- Kept storage locators and quarantine references out of responses.
- Serialized one copy/snapshot preparation through the complete bounded I/O and retained-state checkpoint with a PostgreSQL transaction advisory lock.
- Deleted newly created snapshot bytes before transaction rollback and lock release when finalization failed.
- Kept transient storage and database failures retryable; only typed missing/integrity failures become `snapshot_unavailable`.
- Filtered copy lists by the source document's currently authorized provider Matter and LawOS Matter binding, preventing historic Matter metadata disclosure after reassignment.
- Added tenant-forced RLS storage with limited runtime-role grants in migration 0216.

## Scenario evidence

| Scenario | Invocation | Binary observable | Artifact |
| --- | --- | --- | --- |
| PDF and EML exact contract, immutable mismatch rejection, strict keys, read offset/cursor bounds | Focused Vitest command recorded in log | `2 passed`, `16 passed`, `EXIT_CODE: 0` | `focused-unit.log` |
| PDF/EML prepare-read-commit-replay, ACL revoke, stale source, compensation-before-rollback, same-attempt serialization, reassignment filtering, database/storage error classification | Same focused Vitest run | All named scenarios show `✓`; `EXIT_CODE: 0` | `focused-unit.log` |
| Real PostgreSQL same-binding prepare and commit contention plus RLS | `pnpm test:integration -- amic-os-vault-document-copy` against dedicated fresh local database | Integration spec `4 tests`, `4 passed`; `EXIT_CODE: 0` | `postgres-integration.log` |
| Real PostgreSQL ACL revocation after snapshot write | Same integration run | Request denied, newly written object removed, transaction row absent; scenario included in `4 passed` | `postgres-integration.log` |
| Real PostgreSQL retained-state update failure | Same integration run with a scoped trigger that raises on the fixture copy | HTTP 500 is intentionally emitted; row remains `prepared`, `blocked_reason` remains null, bytes remain; scenario included in `4 passed` | `postgres-integration.log` |
| Real document reassignment | Same integration run | List returns no historic item and does not contain the old LawOS Matter ID; scenario included in `4 passed` | `postgres-integration.log` |
| Migration/RLS/grants | `psql` readback against dedicated database after fresh 0000-0216 migration | Migration 0216 present; `relrowsecurity=t`; `relforcerowsecurity=t`; runtime table grants only INSERT/SELECT plus six UPDATE columns; `EXIT_CODE: 0` | `migration-readback.log` |
| TypeScript | `pnpm --filter @amic-vault/api typecheck` | `EXIT_CODE: 0` | `typecheck.log` |
| ESLint | Focused ESLint over all B08 TypeScript files | `EXIT_CODE: 0` | `eslint.log` |
| Whitespace | Focused `git diff --check` | `EXIT_CODE: 0` | `diff-check.log` |
| Frozen source identity | SHA-256 over eight B08 source/test/migration files | Eight non-empty SHA-256 rows | `source-manifest.sha256` |

The one `ErrorTracker unhandled_exception` line in `postgres-integration.log` is the expected observable from the deliberately injected retained-state database failure. The test verifies that the failure is returned as an error and does not mutate the durable copy to `snapshot_unavailable`.

## Files owned by B08

- `apps/api/src/modules/integrations/amic-os-vault-provider/amic-os-vault-document-copy.contract.ts`
- `apps/api/src/modules/integrations/amic-os-vault-provider/amic-os-vault-document-copy.contract.spec.ts`
- `apps/api/src/modules/integrations/amic-os-vault-provider/amic-os-vault-document-copy.service.ts`
- `apps/api/src/modules/integrations/amic-os-vault-provider/amic-os-vault-document-copy.service.spec.ts`
- `apps/api/src/modules/integrations/amic-os-vault-provider/amic-os-vault-editor.controller.ts`
- `apps/api/src/modules/integrations/amic-os-vault-provider/amic-os-vault-provider.module.ts`
- `db/migrations/0216_create_amic_os_native_document_copies.sql`
- `tests/integration/amic-os-vault-document-copy.spec.ts`

The concurrently modified `amic-os-vault-read.service.ts` and its spec are A04 work and are excluded from this evidence claim.

## Remaining cross-repository gate

The provider accepts and verifies EML, but code-level EML interoperability is complete only when the AMIC OS caller's strict document-copy MIME set also accepts `message/rfc822` and its request/result contract test passes. That AMIC OS file is owned by a separate worker. This provider evidence does not claim that cross-repository gate.

No commit or push was made.
