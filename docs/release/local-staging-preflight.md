# Local Staging Preflight

Status: PASSED - LOCAL SYNTHETIC ONLY
Date: 2026-06-14

This preflight rehearses the staging path on the operator machine before any
approved cloud staging target exists. It uses the frozen release SHA, isolated
local Docker Compose ports, seeded development data, and local smoke checks. It
does not open staging, does not resolve LRB-001 through LRB-014, and does not
authorize production.

## Command

```bash
FROZEN_RELEASE_SHA=9e346d9e48c962448bcccbbef9e30d9c3e468e4f pnpm release:local-preflight
```

Useful flags:

```bash
pnpm release:local-preflight -- --dry-run
pnpm release:local-preflight -- --skip-docker-images
pnpm release:local-preflight -- --skip-local-smoke
pnpm release:local-preflight -- --keep-compose
```

## What It Does

| Step | Check |
|---|---|
| PRE-001 | Verifies the frozen release SHA exists. |
| PRE-002 | Runs `pnpm install --frozen-lockfile`. |
| PRE-003 through PRE-006 | Runs lint, typecheck, unit tests, and build. |
| PRE-007 through PRE-010 | Runs launch readiness, launch execution, docs freeze, and backlog validators. |
| PRE-011 through PRE-013 | Builds API, Web, and ingestion Docker images with local-preflight tags. |
| PRE-014 | Starts isolated local Postgres, MinIO, and ingestion worker. |
| PRE-015 through PRE-018 | Runs migrate, rollback, migrate, and seed against the isolated local DB. |
| PRE-019 | Starts API and Web from built artifacts on isolated local ports. |
| PRE-020 | Runs `pnpm release:smoke -- --local` with the frozen release SHA. |

Default isolated local ports:

| Service | Port |
|---|---|
| Web | `3100` |
| API | `3101` |
| Postgres | `55432` |
| MinIO API | `9100` |
| MinIO console | `9101` |
| Ingestion worker | `8100` |

## Evidence Rules

- Record command status, release SHA, check IDs, and non-secret target ref only.
- Do not commit passwords, tokens, cookies, private URLs, provider screenshots,
  real customer data, or raw document content.
- Local preflight evidence is confidence evidence only.
- Approved staging still requires LRB-001, LRB-002, LRB-003, LRB-004, and
  LRB-008.
- Production still requires LRB-009 through LRB-013 and pilot/support blockers.

## Latest Local Result

| Item | Result |
|---|---|
| Evidence ref | `EV-SMOKE-002` |
| Frozen release SHA | `9e346d9e48c962448bcccbbef9e30d9c3e468e4f` |
| Target ref | `local-staging-preflight` |
| Result | pass |
| Smoke coverage | `SMOKE-001` through `SMOKE-011`, pass 11, fail 0, skip 0 |
| Docker images | API, Web, ingestion local-preflight images built |
| DB rehearsal | migrate, rollback, migrate, seed passed on isolated local DB |
| Standard verification | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration` 81 files / 204 tests, worker pytest 17 tests |
| Cleanup | local API/Web processes stopped and Docker Compose volumes removed |

First attempt found Docker Desktop was not running. Docker was started locally,
then the full preflight was rerun and passed. This is not staging approval.

## Stop Conditions

- Docker is unavailable or isolated dev services cannot become healthy.
- Migration rollback/reapply fails.
- Local smoke fails any permission, tenant isolation, audit, DLP, records,
  external portal, or AI invariant check.
- Any step requires committing a secret, private endpoint, or real customer
  data.
