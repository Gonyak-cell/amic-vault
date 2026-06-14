# Launch Evidence Register

Status: OPEN - NO PRIVATE EVIDENCE COMMITTED

Evidence refs may point to external systems. Do not commit raw evidence when it
contains private endpoints, provider metadata, secrets, screenshots with private
URLs, real customer documents, cookies, or tokens.

| Evidence ID | Gate | Status | Owner Role | External Ref | Notes |
|---|---|---|---|---|---|
| EV-RC-001 | RC freeze | approved | Operator | CHAT-2026-06-14-RC-FREEZE | Frozen release SHA `9e346d9e48c962448bcccbbef9e30d9c3e468e4f` approved for staging image build, smoke, and UAT preparation; production still requires LRB-013. |
| EV-RC-002 | RC validation | ready | Codex | PR #66, PR #67, PR #68, PR #69, CI refs | Candidate code has merged to `main`. |
| EV-STAGE-001 | Staging open | approved | Operator | STAGE-CLOUD-AWS-001 | AWS Seoul `ap-northeast-2` staging-first cloud path approved; no resource provisioning or deploy executed. |
| EV-STAGE-002 | Staging open | approved | Operator | STAGE-DNS-AWS-001 | Route 53 and ACM-managed TLS approved; concrete domains/private endpoints remain outside repo until provisioned. |
| EV-STAGE-003 | Staging open | approved | Operator | STAGE-REGISTRY-ECR-001 | Amazon ECR approved for frozen-SHA tags, digest pinning, and lifecycle retention policy. |
| EV-STAGE-004 | Staging open | approved | Security | STAGE-SECRETS-AWS-001 | AWS Secrets Manager plus KMS approved; repository records secret names only, never values. |
| EV-STAGE-005 | Staging open | approved | Security/Ops | STAGE-MONITOR-AWS-001 | CloudWatch Logs, CloudWatch Alarms, and SNS/email alert routing approved for staging monitoring. |
| EV-SMOKE-001 | Staging smoke | prepared | Codex/Ops | `pnpm release:smoke -- --dry-run` | Smoke automation is repo-local and endpoint-configurable. |
| EV-SMOKE-002 | Local staging preflight | passed | Codex | `pnpm release:local-preflight` | Local-only rehearsal passed for frozen SHA `9e346d9e48c962448bcccbbef9e30d9c3e468e4f`: isolated infra, migration round trip, Docker image builds, SMOKE-001 through SMOKE-011 pass, full integration 81 files / 204 tests, and worker pytest 17 tests. |
| EV-UAT-001 | UAT | prepared | Product/QA | `docs/release/uat-evidence-template.md` | UAT rows remain unexecuted until staging is available. |
| EV-PILOT-001 | Pilot | blocked | Legal/Product | LRB-005 | Legal terms and privacy/DPA approvals. |
| EV-PILOT-002 | Pilot | blocked | Product/Finance/Ops | LRB-006 | Pricing, support, SLA, billing owner. |
| EV-PILOT-003 | Pilot | blocked | Operator/Customer Owner | LRB-007 | Customer data approval and controls. |
| EV-PROD-001 | Production gate | blocked | Security | LRB-009 | Operational security review. |
| EV-PROD-002 | Production gate | blocked | Operator/Security | LRB-010 | Historical Risk=C waiver treatment. |
| EV-PROD-003 | Production gate | blocked | Product/Operator | LRB-011 | UAT acceptance. |
| EV-PROD-004 | Production gate | blocked | Ops/Security | LRB-012 | Backup and restore rehearsal. |
| EV-PROD-005 | Production release | blocked | Operator | LRB-013 | Production release approval for frozen SHA. |

## Evidence ID Rules

- `EV-RC-*`: release candidate evidence.
- `EV-STAGE-*`: staging opening evidence.
- `EV-SMOKE-*`: smoke automation output refs.
- `EV-UAT-*`: UAT case refs.
- `EV-PILOT-*`: pilot entry evidence.
- `EV-PROD-*`: production gate and release evidence.

Evidence records may include status, owner role, date, check IDs, and non-secret
external references only.
