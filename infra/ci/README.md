# CI Overview

GitHub Actions is the selected CI platform for the private GitHub repository
recorded in `docs/ledger/decision.md`.

Required PR checks:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm backlog:validate`
- `pnpm launch:readiness`
- frozen docs package check
- migration convention check
- database migration, rollback, seed, and integration suites
- container image build smoke checks for api, web, and ingestion
- Python ingestion worker tests

Launch readiness artifacts live outside `docs/package/`. The readiness check
verifies that staging and production deployment files remain disabled until
operator-approved targets, secrets, legal/commercial decisions, and production
release approval are recorded in the launch blocker ledger.
