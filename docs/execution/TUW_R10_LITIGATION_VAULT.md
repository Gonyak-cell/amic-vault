# PACK-R10-01 Litigation Vault TUW Contract

Status: active extension after R9 Gate
Release: R10 Litigation Vault
Branch: `feat/pack-r10-01-litigation-vault`

Source constraints:

- `docs/package/codex/00_Master_Brief.md` constitution and absolute bans.
- `docs/package/codex/30_Release_Roadmap.md` R10 scope: evidence, fact ledger, issue tree, pleading management.
- External filing, e-filing package delivery, external transmission, external users, secure links, portal, VDR, and watermark delivery remain R11+ only.

## TUW Inventory

### LIT-EVID-REG-TUW-001

- Title: Litigation evidence register
- Risk: C
- Objective: Create tenant-scoped evidence records linked to authorized matter documents without exposing document body, title, or snippets through audit.
- Files create/modify: `db/migrations/0057_create_litigation_vault.sql`, `packages/shared/src/litigation/*`, `apps/api/src/modules/litigation/*`
- NOT-modify: `docs/package/**`, existing document storage semantics.
- Verification: RLS/FORCE RLS SQL, denied document create negative test, reference-only audit metadata.

### LIT-FACT-LEDGER-TUW-002

- Title: Fact ledger
- Risk: H
- Objective: Record matter facts with optional evidence refs and bounded citation refs, preserving permission-scoped reads.
- Verification: create/list positive, hidden evidence not returned, audit metadata excludes fact body.

### LIT-ISSUE-TREE-TUW-003

- Title: Litigation issue tree
- Risk: H
- Objective: Manage parent-child issue nodes per matter with tenant RLS and matter permission enforcement.
- Verification: parent belongs-to-matter validation, read/write permission negative test, audit event.

### LIT-PLEAD-MGMT-TUW-004

- Title: Pleading management
- Risk: C
- Objective: Track pleading draft/status/deadline refs against authorized documents without implementing e-filing, external service calls, or external delivery.
- Verification: document permission negative test, release-boundary scan proving no external filing/sharing implementation.

### LIT-CASEMAP-API-TUW-005

- Title: Permission-scoped case map
- Risk: C
- Objective: Return evidence-fact-issue-pleading trace refs using query-stage document permission scope, not post-filtered document leakage.
- Verification: denied document id absent from response, body/snippet/title strings absent, `LIT_CASE_MAP_VIEWED` audit.

### LIT-WEB-WORKBENCH-TUW-006

- Title: Litigation workbench UI
- Risk: M
- Objective: Add `/litigation` workbench for internal evidence/fact/issue/pleading operations.
- Verification: component smoke test, no external filing/share wording in rendered UI.

### LIT-INTEG-SEC-TUW-007

- Title: Litigation integration and security regression
- Risk: C
- Objective: Prove R10 keeps tenant isolation, permission-before-document reads, audit-by-default, and R11 boundary intact.
- Verification: targeted integration, full integration, release-boundary greps, destructive grant SQL.

### LIT-GATE-REPORT-TUW-008

- Title: Litigation Vault Gate report
- Risk: C
- Objective: Record R10 technical Gate evidence with blockers=0 and append-only execution ledger row.
- Verification: `docs/ledger/gates/R10_gate.md`, `docs/reports/R10_litigation_case_map.md`, `docs/ledger/execution.md` append.

## Release Boundary

R10 MUST NOT create or call:

- `external_*` runtime sharing tables or endpoints.
- secure link, external workspace, VDR, external portal, external user session, invitation, watermark delivery, or Q&A flows.
- e-filing submission, court upload, external service/API, or outbound package delivery.
- hard delete or disposal execution.

If any of the above is required to satisfy a TUW, stop and append escalation to `docs/ledger/execution.md`.

## Gate Evidence Requirements

- Evidence, fact, issue tree, and pleading tables have `tenant_id NOT NULL`, RLS enabled, and FORCE RLS enabled.
- Runtime role has no DELETE/TRUNCATE/destructive grants on R10 tables.
- Case map hides denied document ids and all document body/snippet/title strings.
- Audit metadata is reference-only: ids, hashes, counts, status enums, bounded filter refs.
- `docs/package/` remains unchanged.
