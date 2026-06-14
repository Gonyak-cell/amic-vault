# Synthetic UAT Technical Evidence

Status: ACCEPTED - SYNTHETIC TECHNICAL UAT
Evidence ref: SYNTH-UAT-TECH-2026-06-14-001
Date: 2026-06-14

This file records Codex-executable technical evidence for UAT-001 through
UAT-020. Product acceptance is recorded under
`APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`; actual production deployment still
requires following `docs/release/production-release-runbook.md`.

No raw screenshots, private endpoints, tokens, cookies, account identifiers, or
customer documents are committed. Evidence is limited to repository-safe command
refs, existing non-secret staging refs, and synthetic-data validation paths.

## Evidence Command Set

```bash
pnpm release:uat
pnpm release:smoke -- --dry-run
pnpm test:integration
pnpm search:eval:korean
pnpm eval:contract-gate
pnpm docs:frozen
pnpm launch:readiness
pnpm launch:execution
```

Run `pnpm release:uat -- --run` when a local database, seeded synthetic data,
and normal development dependencies are available. The default
`pnpm release:uat` command performs a repository-safe evidence consistency check
for CI.

## UAT Technical Evidence Matrix

| UAT ID | Evidence ID | Result | Technical Evidence | Acceptance Boundary |
|---|---|---|---|---|
| UAT-001 | EV-UAT-001 | accepted | `STAGE-MAIN-MERGE-AWS-001` plus `pnpm release:smoke -- --dry-run` covers health, auth redirect, login path, tenant-scoped API response, and negative role denial. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-002 | EV-UAT-002 | accepted | `pnpm test:integration` covers client, matter core, matter lifecycle, party, matter team audit, and matter permission denial specs. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-003 | EV-UAT-003 | accepted | `pnpm test:integration` covers ethical wall, permission matrix, permission-before-search, AI policy, and external portal gate denial specs. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-004 | EV-UAT-004 | accepted | `pnpm test:integration` covers document access, hash, metadata, upload, immutable original, preview, download, soft-delete, legal hold, and document audit specs. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-005 | EV-UAT-005 | accepted | `pnpm test:integration` plus `pnpm search:eval:korean` covers search permission, filters, metadata leakage, Korean search evaluation, and pre-result authorization. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-006 | EV-UAT-006 | accepted | `pnpm test:integration` covers email filing, email raw storage, cross-tenant email RLS, and email audit specs. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-007 | EV-UAT-007 | accepted | `pnpm test:integration` covers DLP audit, DLP finding RLS, metadata leakage, and external portal gate enforcement. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-008 | EV-UAT-008 | accepted | `pnpm test:integration` covers break-glass request, scoped search, revocation, permission audit, and fail-closed injection specs. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-009 | EV-UAT-009 | accepted | `pnpm test:integration` covers local-only AI citations, retrieval, policy, session, summaries, model routing, feedback, and schema-only controls. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-010 | EV-UAT-010 | accepted | `pnpm test:integration` covers permission-scoped graph behavior and graph consistency fixtures. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-011 | EV-UAT-011 | accepted | `pnpm test:integration` plus `pnpm eval:contract-gate` covers deterministic contract intelligence and reproducible rule evidence. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-012 | EV-UAT-012 | accepted | `pnpm test:integration` covers DD vault RFI, internal data-room mapping, issue/risk trace, and external exposure gates. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-013 | EV-UAT-013 | accepted | `pnpm test:integration` covers litigation vault evidence, facts, issue tree, and internal draft references without court filing. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-014 | EV-UAT-014 | accepted | `pnpm test:integration` covers external core, portal gate, token hashing, NDA/manifest/Q&A boundaries, and DLP warning enforcement. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-015 | EV-UAT-015 | accepted | `pnpm test:integration` covers records governance, legal hold, active-hold disposal blocks, certificates, and audit references. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-016 | EV-UAT-016 | accepted | `pnpm test:integration` covers enterprise hardening, SSO/BYOK/SIEM/backup reference-only registries, and no-secret storage boundaries. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-017 | EV-UAT-017 | accepted | `pnpm test:integration` covers scale-learning readiness, performance/cost/eval/migration/learning evidence, and external model route closure. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-018 | EV-UAT-018 | accepted | `pnpm test:integration` covers audit console, audit immutability, audit logger, audit coverage, and allow-listed metadata behavior. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`. |
| UAT-019 | EV-UAT-019 | accepted | `RESTORE-DRILL-AWS-001`, `EV-PROD-004`, and `pnpm test:integration` cover non-production restore invariants for tenant isolation, append-only audit, records hold, and search permission. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`; restore accepted under `APPROVAL-LRB-012-RESTORE-2026-06-14`. |
| UAT-020 | EV-UAT-020 | accepted | `pnpm release:smoke -- --dry-run`, migration round-trip evidence, `pnpm docs:frozen`, `pnpm launch:readiness`, and `pnpm launch:execution` cover rollback-readiness invariants without executing production rollback. | Accepted under `APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`; production release approval recorded under `APPROVAL-LRB-013-PROD-RELEASE-2026-06-14`. |

## Stop Conditions

- Any command in the evidence command set fails.
- Any UAT path requires real customer data, raw document content, or private
  deployment evidence to be committed.
- Any permission, tenant isolation, audit, DLP, records, external portal, graph,
  search, or AI invariant fails.
- Product or production approval is requested without resolving LRB-011 and the
  other production blockers.
