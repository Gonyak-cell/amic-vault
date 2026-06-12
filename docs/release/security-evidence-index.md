# Security Evidence Index

Status: PREPARED

This index maps launch security claims to existing technical evidence. It is not
a substitute for operational security approval.

| Claim | Evidence |
|---|---|
| R14 technical completion is green. | `docs/ledger/gates/R14_gate.md`, `docs/reports/R14_scale_learning.md` |
| Tenant RLS/FORCE RLS is enforced across release tables. | R0-R14 gate reports; integration suites `cross-tenant`, `permission-matrix` |
| Audit events are append-only and reference-only. | `docs/ledger/gates/R0_gate.md`, `tests/integration/audit-immutability`, R14 report |
| Permission-before-search remains query-stage. | `docs/ledger/gates/R3_gate.md`, search permission/filter suites |
| Permission-before-AI remains enforced. | `docs/ledger/gates/R6_gate.md`, AI gate metrics, matter-scoped AI gate |
| External model routes remain closed. | `docs/ledger/decision.md` DEC-27, `docs/reports/R14_scale_learning.md` |
| External portal is controlled by token hash, expiry/revoke, NDA, DLP, and audit. | `docs/ledger/gates/R11_gate.md`, `docs/reports/R11_external_portal_gate.md` |
| Records disposal is controlled and hard delete is gated. | `docs/ledger/gates/R12_gate.md`, `docs/reports/R12_records_governance.md` |
| Enterprise SSO/BYOK/SIEM/backup/compliance are reference-only. | `docs/ledger/gates/R13_gate.md`, `docs/reports/R13_enterprise_readiness.md` |
| Launch deployment remains disabled until approvals. | `infra/ci/staging-deploy.yml`, `infra/ci/prod-gate.yml`, `docs/release/launch-blocker-ledger.md` |
| Package docs remain frozen. | `pnpm docs:frozen` |
| Launch readiness artifacts are present and internally consistent. | `pnpm launch:readiness` |

## Operational Review Required

Before production, security owner review must cover:

- Runtime network boundaries.
- Secret manager policy.
- Database backup and restore controls.
- Object storage encryption and tenant-prefix enforcement in the chosen cloud.
- Monitoring, alert routing, retention, and incident response.
- Approved data handling for pilot or production data.
- Release rollback authority and communications.
