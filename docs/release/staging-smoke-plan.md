# Staging Smoke Plan

Status: READY - AWAITS STAGING TARGET

This plan defines smoke checks for an approved staging deployment. It does not
contain or require private endpoint values in the repository.

## Inputs

| Input | Source |
|---|---|
| Staging base URL | Approved evidence ref for LRB-002 |
| Smoke user/session | Approved test user or synthetic session controlled outside repo |
| Release SHA | Frozen staging candidate SHA |
| Image digests | Approved registry refs from LRB-003 |

## Public Smoke Checks

| ID | Check | Expected |
|---|---|---|
| SMOKE-001 | `GET /health` | 200 and healthy response |
| SMOKE-002 | `GET /login` | 200 and login UI renders |
| SMOKE-003 | `GET /dashboard` without session | redirect to `/login` |
| SMOKE-004 | Static asset load | CSS and JS response 200 |

## Authenticated Smoke Checks

Authenticated checks require approved non-production credentials or a controlled
synthetic session outside the repository.

| ID | Check | Expected |
|---|---|---|
| SMOKE-005 | Login with synthetic user | tenant-scoped session |
| SMOKE-006 | Open `/dashboard` | activity console renders |
| SMOKE-007 | Open `/search` | protected page renders after auth |
| SMOKE-008 | Call representative protected API | tenant-scoped response |
| SMOKE-009 | Permission negative check | denied response hides target existence |
| SMOKE-010 | Audit event check | reference-only event exists |

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
