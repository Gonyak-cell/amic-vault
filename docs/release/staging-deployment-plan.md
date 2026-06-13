# Staging Deployment Plan

Status: PREPARED - DISABLED UNTIL APPROVALS

## Purpose

Staging proves that AMIC Vault can be deployed, migrated, smoke-tested, and used
with approved non-production data before any production release attempt.

## Required Decisions

| Decision | Blocker |
|---|---|
| Cloud provider and region | LRB-001 |
| DNS and TLS naming | LRB-002 |
| Container registry | LRB-003 |
| Secret manager and runtime secret refs | LRB-004 |
| Monitoring sink | LRB-008 |

## Preflight

- Main CI green.
- `pnpm launch:readiness` green.
- `pnpm docs:frozen` green.
- Database migration roundtrip green.
- Release-boundary scans green.
- No real data or secret committed.
- Staging target values recorded outside the repository through approved secret
  management.

## Deployment Flow

1. Build api, web, and ingestion images from the same Git SHA.
   - The web image must include `.next/standalone`, `.next/static`, and
     `public`; `apps/web/Dockerfile` copies all three.
2. Push images to the approved registry.
3. Take a pre-migration staging database snapshot.
4. Acquire the migration lock.
5. Run `pnpm db:migrate`.
6. Deploy the api service.
7. Deploy the web service.
8. Deploy the ingestion worker.
9. Run `pnpm release:smoke` against the approved staging target, including
   static asset, unauthenticated redirect, authenticated dashboard/search,
   protected API, negative role, and audit checks.
10. Run the UAT checklist in `docs/release/uat-checklist.md`.

## Exit Criteria

- All smoke checks pass.
- UAT evidence is recorded.
- Permission, tenant isolation, audit, DLP, external portal, records disposal,
  and AI evidence checks have no critical failures.
- Any failed item is either fixed or recorded as a launch blocker.
