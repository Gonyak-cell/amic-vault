# Launch Evidence Register

Status: OPEN - NO PRIVATE EVIDENCE COMMITTED

Evidence refs may point to external systems. Do not commit raw evidence when it
contains private endpoints, provider metadata, secrets, screenshots with private
URLs, real customer documents, cookies, or tokens.

| Evidence ID | Gate | Status | Owner Role | External Ref | Notes |
|---|---|---|---|---|---|
| EV-RC-001 | RC freeze | pending | Operator | TBD | Decide the exact frozen release SHA; default application candidate is `9e346d9e48c962448bcccbbef9e30d9c3e468e4f`. |
| EV-RC-002 | RC validation | ready | Codex | PR #66, PR #67, PR #68, PR #69, CI refs | Candidate code has merged to `main`. |
| EV-STAGE-001 | Staging open | blocked | Operator | LRB-001 | Cloud provider and region approval. |
| EV-STAGE-002 | Staging open | blocked | Operator | LRB-002 | DNS/TLS endpoint approval. |
| EV-STAGE-003 | Staging open | blocked | Operator | LRB-003 | Registry/signing approval. |
| EV-STAGE-004 | Staging open | blocked | Security | LRB-004 | Secret manager and secret refs. |
| EV-STAGE-005 | Staging open | blocked | Security/Ops | LRB-008 | Monitoring and incident response. |
| EV-SMOKE-001 | Staging smoke | prepared | Codex/Ops | `pnpm release:smoke -- --dry-run` | Smoke automation is repo-local and endpoint-configurable. |
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
