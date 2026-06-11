# Production Gate

Production deployment is intentionally a no-op in R0.

Before this gate can be replaced with a real deployment, the release must have:

- Passed the relevant checklist in `docs/package/codex/50_Verification_Security_Gates.md`.
- Completed all Risk=C review requirements.
- Recorded PACK and Gate results in `docs/ledger/execution.md`.

No workflow in R0 may deploy automatically to production.
