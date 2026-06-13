# RC Freeze Decision Pack

Status: READY - OPERATOR DECISION REQUIRED
Date: 2026-06-13

## Candidate

| Field | Value |
|---|---|
| Candidate SHA | `9e346d9e48c962448bcccbbef9e30d9c3e468e4f` |
| Source branch | `main` |
| Included PRs | `#66`, `#67`, `#68`, `#69` |
| Local repo state at preparation | `main...origin/main` |
| Staging/prod deployment state | Disabled until LRB approvals |

## Included PR Scope

| PR | Merge commit | Scope | Migration impact | Security impact |
|---|---|---|---|---|
| #66 | `93f96ca` | Activity-console dashboard UI, shared app shell for protected routes, launch execution planning artifacts, launch validators. | No DB migration. | Preserves protected-route middleware and release-boundary blockers. |
| #67 | `a0c1e60` | UI shell i18n hardening, local AMIC fonts, API CORS/DI testability, R14 rollback audit allow-list hardening. | Updates `0062_scale_learning.sql` rollback allow-list to preserve append-only R14 audit actions. | Keeps CORS explicit, avoids DOM-wide translation mutation, no external model/API opening. |
| #68 | `2e66ad1` | Release-completion prep: RC pack, evidence register, launch blocker ledger, local synthetic UAT walkthrough, staging smoke env template, and endpoint-configurable smoke automation. | No DB migration. | Keeps staging/prod approvals blocked and records only non-secret refs. |
| #69 | `9e346d9` | Pre-launch quality hardening: `/launch` control surface, CI `pnpm launch:execution`, staging input checklist, synthetic UAT scenarios, launch control sheet, and `SMOKE-011`. | No DB migration. | Keeps `/launch` read-only, adds authenticated smoke coverage, and preserves release-boundary blockers. |

## Freeze Decision Needed

The operator must decide whether
`9e346d9e48c962448bcccbbef9e30d9c3e468e4f` is the first release-candidate SHA.
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

- `main` points at `9e346d9e48c962448bcccbbef9e30d9c3e468e4f`.
- PR #66, #67, #68, and #69 are merged.
- `pnpm launch:readiness` and `pnpm launch:execution` are green.
- `pnpm release:smoke -- --local` is green with seeded development data.
- `docs/package/` remains frozen.
- LRB-001 through LRB-014 remain unresolved unless a responsible owner supplies
  an approved external evidence ref.
