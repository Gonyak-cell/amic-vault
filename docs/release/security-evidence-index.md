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
| Automatic deployment workflows remain disabled unless a future release path explicitly opens them. | `infra/ci/staging-deploy.yml`, `infra/ci/prod-gate.yml`, `docs/release/launch-blocker-ledger.md` |
| Production bootstrap and smoke used production-specific refs, not staging reuse. | `PROD-INFRA-AWS-001`, `PROD-DEPLOY-WORKFLOW-AWS-001`, `PROD-SMOKE-AWS-001`, `docs/release/production-execution-preflight.md` |
| Customer-document production launch remains governed and reference-only. | `APPROVAL-LRB-007-CUSTOMER-DATA-2026-06-15`, `EV-PILOT-005`, permission/DLP/audit/immutable-original gate evidence |
| Production operational alerting is configured for the customer launch. | `PROD-MONITOR-ALARMS-AWS-2026-06-15`, `EV-PROD-010`, SNS email confirmation pending outside repository evidence |
| Final production customer-launch smoke passed without exposing customer documents. | `PROD-CUSTOMER-LAUNCH-FINAL-SMOKE-2026-06-15`, `EV-PROD-011`, `docs/release/production-execution-preflight.md` |
| Package docs remain frozen. | `pnpm docs:frozen` |
| Launch readiness artifacts are present and internally consistent. | `pnpm launch:readiness` |
| Enterprise DMS UI release evidence is reference-only and covers rollout, rollback, monitor, route visibility, negative auth, and AI prep scope. | `docs/release/enterprise-dms-ui-release-evidence.md`, `docs/ui/enterprise-dms-release-hardening.md`, `pnpm ui:production-smoke`, `pnpm check:ui-pr-checklist` |

## Operational Review Status

Operational security approval is recorded under `APPROVAL-LRB-009-2026-06-14`.
Post-launch monitoring should continue to cover:

- Runtime network boundaries.
- Secret manager policy.
- Database backup and restore controls.
- Object storage encryption and tenant-prefix enforcement in the chosen cloud.
- Monitoring, alert routing, retention, and incident response.
- Approved data handling for pilot or production data.
- Release rollback authority and communications.
- Matter-first DMS UI upload, browse, search, governance, integration, and AI
  prep file-organization monitor signals.
- SNS alert subscription confirmation for `jws`.
