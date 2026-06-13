# Release Notes Template - RC `a0c1e60`

Status: DRAFT - AWAITS RC FREEZE APPROVAL

## Summary

AMIC Vault post-R14 release candidate `a0c1e60` contains the technical R14
completion baseline plus launch-readiness UI and release-control preparation.
It is not a production approval and does not deploy staging or production.

## Included Changes

| Area | Notes |
|---|---|
| Activity console | `/dashboard` presents the internal activity-console surface with matter profile, live activity, inspector, summary, diagnostics, and data-quality panels. |
| App shell | Protected app routes use the shared AMIC shell with top navigation, rail navigation, search affordance, language toggle, and logout. |
| Internationalization | Login and app shell use explicit key-based Korean/English copy. DOM-wide mutation translation is not used. |
| Launch control | Launch execution plan, operator decision sheet, UAT template, staging smoke plan, and launch validators are present. |
| API hardening | CORS is explicitly bound to the web origin, with test coverage for local/prod behavior. |
| Migration hardening | R14 scale audit actions remain allowed on rollback because `audit_events` is append-only after R14 evidence exists. |

## Security And Boundary Notes

- No `docs/package/` changes.
- No production deploy, staging deploy, cloud provider binding, DNS/TLS binding,
  registry push, secret manager write, customer data use, or external API/model
  call is included.
- External model routes remain closed by the R14 gate baseline.
- External portal behavior remains inside the R11 controlled-sharing boundary.

## Required Before Staging

- LRB-001, LRB-002, LRB-003, LRB-004, and LRB-008 approved with evidence refs.
- RC freeze decision recorded for `a0c1e60`.
- Staging smoke environment values supplied outside the repository.
