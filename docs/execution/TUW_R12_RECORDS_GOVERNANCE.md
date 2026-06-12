# PACK-R12-01 Records Governance TUW Contract

Status: active extension after R11 Gate technical pass
Release: R12 Records Management
Branch: `feat/pack-r12-01-records-governance`

Source constraints:

- `docs/package/codex/00_Master_Brief.md` constitution and absolute bans.
- `docs/package/codex/30_Release_Roadmap.md` R12 scope: retention policy,
  full LegalHold workflow, archive, disposal workflow, and certificate.
- `docs/package/codex/50_Verification_Security_Gates.md` Records Governance
  Gate: hold blocks deletion, disposal workflow cannot be bypassed, and
  `DISPOSAL_EXECUTED` audit exists.

PACK-R12-01 opens controlled records governance while keeping automatic deletion
disabled. Hard delete is available only inside the approved disposal executor.

## TUW Inventory

### RECORD-RETENTION-TUW-001

- Title: Retention policy schema
- Risk: C
- Objective: Add tenant-scoped retention policy records with indefinite
  retention as the default. No automatic deletion or scheduler is introduced.
- Verification: `retention_policies` has tenant RLS/FORCE RLS and default
  indefinite policy semantics.

### RECORD-HOLD-TUW-001

- Title: Legal hold table workflow
- Risk: C
- Objective: Add legal hold records that synchronize the R2 matter/document
  `legal_hold` flags. Hold create/release is audited with reference-only
  metadata.
- Verification: active hold sets the target flag, release clears the flag only
  when no active hold remains, and held records block soft/hard delete.

### RECORD-ARCHIVE-TUW-001

- Title: Archive workflow
- Risk: H
- Objective: Add a permission-checked document archive workflow that moves
  documents into immutable `archived` status without mutating file objects or
  versions.
- Verification: archived documents reject normal metadata/version/delete
  mutations and preserve original file/version rows.

### RECORD-DISPOSAL-TUW-001

- Title: Disposal request workflow
- Risk: C
- Objective: Add disposal request, approval, and execution states. Requests are
  denied when an active hold exists. Execution is denied until approval.
- Verification: unapproved execution fails, active holds block requests and
  execution, and direct document delete remains a soft-delete path only.

### RECORD-DISPOSAL-TUW-002

- Title: Disposal certificate
- Risk: C
- Objective: Create a certificate row at execution time with IDs, hashes,
  approver, executor, and time only.
- Verification: certificate contains no document body, title, filename, snippet,
  or raw extracted text.

### RECORD-DISPOSAL-TUW-003

- Title: Controlled hard delete executor
- Risk: C
- Objective: Add a hard delete path only inside the approved disposal executor.
  Downstream business references such as DD, litigation, external links,
  contract intelligence, graph, AI session chunks, and email links block
  disposal instead of being silently removed.
- Verification: the executor can delete a simple approved document and fails
  closed for held or externally/business-referenced records.

### RECORD-AUDIT-TUW-001

- Title: Records audit coverage
- Risk: C
- Objective: Add records audit actions and coverage for retention policy change,
  legal hold apply/release, archive, disposal request/approval/execution, and
  certificate creation.
- Verification: audit metadata uses reference IDs, hashes, counts, reason/status
  codes, approver/executor IDs, and no sensitive source text.

### RECORD-GATE-REPORT-TUW-001

- Title: Records Governance Gate report
- Risk: C
- Objective: Record R12 Gate evidence for hold block, disposal bypass denial,
  controlled hard delete, audit coverage, RLS, and release-boundary scans.
- Verification: `docs/reports/R12_records_governance.md`,
  `docs/ledger/gates/R12_gate.md`, decision ledger, and execution ledger all
  reflect the current technical state.

## Release Boundary

R12-01 MUST NOT create:

- automatic retention deletion scheduler.
- hard delete path outside `RecordsService.executeDisposal`.
- body/text/title/snippet/filename audit metadata.
- silent cascade cleanup of business references.
- external AI, OpenSearch, Neo4j, webhook, email delivery, or notification
  dependencies.

If any of the above is needed, stop and append escalation to
`docs/ledger/execution.md`.
