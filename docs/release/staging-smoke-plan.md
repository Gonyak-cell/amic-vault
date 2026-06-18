# Staging Smoke Plan

Status: PASSED - CURRENT MAIN-MERGE STAGING TARGET

This plan defines smoke checks for an approved staging deployment. It does not
contain or require private endpoint values in the repository.

## Inputs

| Input              | Source                                                          |
| ------------------ | --------------------------------------------------------------- |
| Staging base URL   | Approved evidence ref for LRB-002                               |
| API base URL       | Approved evidence ref for LRB-002                               |
| Smoke user/session | Approved test user or synthetic session controlled outside repo |
| Release SHA        | Frozen staging candidate SHA                                    |
| Image digests      | Approved registry refs from LRB-003                             |
| Smoke env template | `docs/release/env.staging-smoke.example`                        |

## Public Smoke Checks

| ID        | Check                            | Expected                                                                                                |
| --------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| SMOKE-001 | `GET /health`                    | 200 and healthy response                                                                                |
| SMOKE-002 | `GET /login`                     | 200 and login UI renders                                                                                |
| SMOKE-003 | `GET /dashboard` without session | redirect to `/login`                                                                                    |
| SMOKE-004 | Static asset load                | CSS and JS response 200                                                                                 |
| SMOKE-012 | PWA manifest                     | app identity, same-origin scope/start path, standalone display, desktop icons                           |
| SMOKE-013 | Service worker cache policy      | `/sw.js` is no-store and denied sensitive routes are evaluated before static allow-list                 |
| SMOKE-014 | Offline shell                    | safe offline page renders without tenant, matter, document, search, audit, AI, token, or secret markers |
| SMOKE-015 | Desktop installability metadata  | standalone display, stable same-origin id, any+maskable icons, theme colors, offline fallback wiring    |

## Authenticated Smoke Checks

Authenticated checks require approved non-production credentials or a controlled
synthetic session outside the repository.

| ID        | Check                             | Expected                                            |
| --------- | --------------------------------- | --------------------------------------------------- |
| SMOKE-005 | Login with synthetic user         | tenant-scoped session                               |
| SMOKE-006 | Open `/dashboard`                 | activity console renders                            |
| SMOKE-007 | Open `/search`                    | protected page renders after auth                   |
| SMOKE-008 | Call representative protected API | tenant-scoped response                              |
| SMOKE-009 | Permission negative check         | denied response hides target existence              |
| SMOKE-010 | Audit event check                 | reference-only event exists                         |
| SMOKE-011 | Open `/launch`                    | launch control renders and remains approval-blocked |

## Automation

Use the repo-local smoke runner:

```bash
pnpm release:smoke -- --dry-run
pnpm release:smoke -- --local
pnpm release:smoke -- --json
pnpm release:local-preflight
```

For approved staging, provide `WEB_BASE_URL`, `API_BASE_URL`,
`SMOKE_TARGET_REF`, `RELEASE_SHA`, and approved non-production credentials from
outside the repository. `SMOKE_TENANT_ID` or `SMOKE_TENANT_SLUG` is optional for
email-only login and should be supplied only when an approved smoke identity is
intentionally tenant-disambiguated. Set `SMOKE_REQUIRE_AUTH=1` for gate
evidence.

Vault route mapping:

| Smoke item           | Vault route                              |
| -------------------- | ---------------------------------------- |
| API health           | `/v1/health/live` and `/v1/health/ready` |
| Login page           | `/login`                                 |
| Protected dashboard  | `/dashboard`                             |
| Protected search     | `/search`                                |
| Launch control       | `/launch`                                |
| PWA manifest         | `/manifest.webmanifest`                  |
| Service worker       | `/sw.js`                                 |
| Offline shell        | `/offline.html`                          |
| Protected tenant API | `/v1/tenant/settings`                    |
| Audit evidence API   | `/v1/audit-events?limit=1`               |

## Evidence Output

Smoke evidence should record:

- release SHA,
- deployment ref,
- check IDs,
- pass/fail,
- timestamps,
- non-secret evidence refs.

Do not record:

- cookies,
- passwords,
- private URLs,
- tokens,
- raw customer document content,
- raw audit metadata containing sensitive text.

`pnpm release:local-preflight` is the local rehearsal command. It starts an
isolated local database/object-storage/worker set, runs migration rollback and
reapply, starts API/Web on local-only ports, and executes the local smoke suite.
It does not resolve approved staging blockers.

## Current Staging Smoke Evidence

- Evidence ref: `STAGE-MAIN-MERGE-AWS-001`.
- Release SHA: `9ed101081484e0f1d0f417652549d4dea762c6de`.
- Result: SMOKE-001 through SMOKE-011 pass=11 fail=0 skip=0.
- Private endpoint values, cookies, tokens, credentials, screenshots, and
  provider-console metadata remain outside this repository.
- Desktop/PWA evidence ref: `EV-DESKTOP-002`.
- Next staging smoke run must include SMOKE-012 through SMOKE-015 and should
  record pass=15 fail=0 skip=0 when authenticated checks are enabled.
