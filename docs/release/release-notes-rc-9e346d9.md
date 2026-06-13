# Release Notes Template - RC `9e346d9`

Status: DRAFT - AWAITS RC FREEZE APPROVAL

## Summary

AMIC Vault post-R14 release candidate
`9e346d9e48c962448bcccbbef9e30d9c3e468e4f` contains the technical R14
completion baseline plus launch-readiness UI, launch-control preparation, and
pre-launch quality hardening through PR #69. It is not a production approval and
does not deploy staging or production.

## Included Changes

| Area | Notes |
|---|---|
| Activity console | `/dashboard` presents the internal activity-console surface with matter profile, live activity, inspector, summary, diagnostics, and data-quality panels. |
| Launch control | `/launch` presents the read-only launch control surface for staging, UAT, pilot, production, and monitoring status. |
| App shell | Protected app routes use the shared AMIC shell with top navigation, rail navigation, search affordance, language toggle, launch navigation, and logout. |
| Internationalization | Login and app shell use explicit key-based Korean/English copy. DOM-wide mutation translation is not used. |
| Launch execution | Launch execution plan, operator decision sheet, UAT template, staging smoke plan, staging input checklist, synthetic UAT matrix, launch control sheet, and launch validators are present. |
| Smoke automation | `pnpm release:smoke` covers API health, login, protected redirects, static assets, authenticated dashboard/search, protected API, negative role denial, audit reference-only metadata, and launch control rendering. |
| API hardening | CORS is explicitly bound to the web origin, with test coverage for local/prod behavior. |
| Migration hardening | R14 scale audit actions remain allowed on rollback because `audit_events` is append-only after R14 evidence exists. |

## Included PR Baseline

| PR | Merge Commit | Notes |
|---|---|---|
| #66 | `93f96ca` | Activity-console dashboard UI and launch execution planning artifacts. |
| #67 | `a0c1e60` | UI shell i18n hardening, API CORS/DI hardening, R14 rollback audit allow-list hardening. |
| #68 | `2e66ad1` | Release-completion prep, evidence register, launch blocker ledger, smoke automation, local synthetic UAT walkthrough. |
| #69 | `9e346d9` | Launch control UI, staging input checklist, synthetic UAT scenarios, CI launch execution validator, `SMOKE-011`. |

## Security And Boundary Notes

- No `docs/package/` changes.
- No production deploy, staging deploy, cloud provider binding, DNS/TLS binding,
  registry push, secret manager write, customer data use, or external API/model
  call is included.
- External model routes remain closed by the R14 gate baseline.
- External portal behavior remains inside the R11 controlled-sharing boundary.
- Launch blockers LRB-001 through LRB-014 remain unresolved until approved
  external evidence refs exist.

## Required Before Staging

- RC freeze decision recorded for
  `9e346d9e48c962448bcccbbef9e30d9c3e468e4f`.
- LRB-001, LRB-002, LRB-003, LRB-004, and LRB-008 approved with evidence refs.
- Staging smoke environment values supplied outside the repository.
- `pnpm launch:readiness`, `pnpm launch:execution`, and staging smoke are green
  for the approved target.
