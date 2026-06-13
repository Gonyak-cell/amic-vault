# RC Freeze Decision Pack

Status: READY - OPERATOR DECISION REQUIRED
Date: 2026-06-13

## Candidate

| Field | Value |
|---|---|
| Candidate SHA | `a0c1e60` |
| Source branch | `main` |
| Included PRs | `#66`, `#67` |
| Local repo state at preparation | `main...origin/main` |
| Staging/prod deployment state | Disabled until LRB approvals |

## Included PR Scope

| PR | Merge commit | Scope | Migration impact | Security impact |
|---|---|---|---|---|
| #66 | `93f96ca` | Activity-console dashboard UI, shared app shell for protected routes, launch execution planning artifacts, launch validators. | No DB migration. | Preserves protected-route middleware and release-boundary blockers. |
| #67 | `a0c1e60` | UI shell i18n hardening, local AMIC fonts, API CORS/DI testability, R14 rollback audit allow-list hardening. | Updates `0062_scale_learning.sql` rollback allow-list to preserve append-only R14 audit actions. | Keeps CORS explicit, avoids DOM-wide translation mutation, no external model/API opening. |

## Freeze Decision Needed

The operator must decide whether `a0c1e60` is the first release-candidate SHA.
Until this is approved, staging image build and registry push remain blocked.
This is an operator decision and cannot be inferred from local validation alone.

Allowed evidence:

- PR URL or release note reference.
- CI run reference for the candidate SHA.
- Operator decision ref in the launch evidence register.

Forbidden evidence:

- Secrets, cookies, private endpoints, provider console screenshots, real
  customer data, or raw document content.

## Freeze Acceptance Criteria

- `main` points at `a0c1e60`.
- PR #66 and #67 are merged.
- `pnpm launch:readiness` and `pnpm launch:execution` are green.
- `docs/package/` remains frozen.
- LRB-001 through LRB-014 remain unresolved unless a responsible owner supplies
  an approved external evidence ref.
