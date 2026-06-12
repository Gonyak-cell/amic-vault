# Production Gate

Production deployment is intentionally disabled until the Launch Readiness Pack
blockers are resolved.

Before this gate can be replaced with a real deployment, the release must have:

- Passed the relevant checklist in `docs/package/codex/50_Verification_Security_Gates.md`.
- Completed all Risk=C review requirements.
- Recorded PACK and Gate results in `docs/ledger/execution.md`.
- Passed `pnpm launch:readiness`.
- Completed staging deployment and UAT using `docs/release/uat-checklist.md`.
- Reviewed `docs/release/security-evidence-index.md`.
- Resolved every `approval-required` row in `docs/release/launch-blocker-ledger.md`.
- Rehearsed `docs/release/rollback-runbook.md`.

No workflow may deploy automatically to production while `infra/ci/prod-gate.yml`
has `deploy.enabled: false`.
