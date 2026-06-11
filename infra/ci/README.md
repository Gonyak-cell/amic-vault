# CI Overview

GitHub Actions is the selected CI platform for R0, matching the private GitHub repo decision in
`docs/ledger/decision.md`.

Required PR checks:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `node tools/backlog/validate.mjs docs/package/codex/data/backlog_r0_r3.csv`
- frozen docs package check
- container image build smoke checks for api, web, and ingestion

Python worker lint is a placeholder in R0. R2 extraction work will add real Python tests.
