# UAT Evidence Template

Status: TECHNICAL PASS - PRODUCT ACCEPTANCE REQUIRED

Use approved synthetic data unless LRB-007 explicitly approves pilot customer
data and controls. Evidence refs may point to external systems when they include
private deployment metadata or screenshots.

Local development walkthrough evidence may be collected with
`docs/release/local-synthetic-uat-walkthrough.md`, but local evidence does not
accept UAT for staging or production.
Synthetic technical evidence is recorded in
`docs/release/synthetic-uat-evidence.md` under
`SYNTH-UAT-TECH-2026-06-14-001`. Product acceptance remains blocked by LRB-011.

| UAT ID | Result | Evidence Ref | Notes |
|---|---|---|---|
| UAT-001 | technical-pass | EV-UAT-001 / STAGE-MAIN-MERGE-AWS-001 | Auth, tenant context, unauthenticated redirect, authenticated dashboard, tenant-scoped API response, and negative role denial passed in current main-merge staging smoke. |
| UAT-002 | technical-pass | EV-UAT-002 / SYNTH-UAT-TECH-2026-06-14-001 | Client, matter, party, team, audit, and non-member denial covered by integration evidence. |
| UAT-003 | technical-pass | EV-UAT-003 / SYNTH-UAT-TECH-2026-06-14-001 | Ethical wall denial across search, document, email, graph, AI, and external gates covered by integration evidence. |
| UAT-004 | technical-pass | EV-UAT-004 / SYNTH-UAT-TECH-2026-06-14-001 | Upload, version, preview, download, soft-delete, legal hold, immutability, and audit covered by integration evidence. |
| UAT-005 | technical-pass | EV-UAT-005 / SYNTH-UAT-TECH-2026-06-14-001 | Keyword, metadata, semantic, Korean search, metadata leakage, and authorization covered by integration/eval evidence. |
| UAT-006 | technical-pass | EV-UAT-006 / SYNTH-UAT-TECH-2026-06-14-001 | EML import, metadata extraction, attachment filing, raw storage, RLS, and audit covered by integration evidence. |
| UAT-007 | technical-pass | EV-UAT-007 / SYNTH-UAT-TECH-2026-06-14-001 | Synthetic DLP-positive fixture, reference-only finding, metadata leakage, and egress/external gate covered by integration evidence. |
| UAT-008 | technical-pass | EV-UAT-008 / SYNTH-UAT-TECH-2026-06-14-001 | Break-glass request, scoped use, audit, fail-closed injection, and revocation covered by integration evidence. |
| UAT-009 | technical-pass | EV-UAT-009 / SYNTH-UAT-TECH-2026-06-14-001 | Local-only AI evidence, citations, warnings, model routing, schema-only controls, and audit covered by integration evidence. |
| UAT-010 | technical-pass | EV-UAT-010 / SYNTH-UAT-TECH-2026-06-14-001 | Matter-scoped graph facts and consistency fixtures covered by integration evidence. |
| UAT-011 | technical-pass | EV-UAT-011 / SYNTH-UAT-TECH-2026-06-14-001 | Contract parsing and deterministic rules covered by integration and contract gate evidence. |
| UAT-012 | technical-pass | EV-UAT-012 / SYNTH-UAT-TECH-2026-06-14-001 | DD RFI, internal data room mapping, issue/risk trace, and external exposure gate covered by integration evidence. |
| UAT-013 | technical-pass | EV-UAT-013 / SYNTH-UAT-TECH-2026-06-14-001 | Litigation evidence, facts, issue tree, and internal pleading draft covered by integration evidence. |
| UAT-014 | technical-pass | EV-UAT-014 / SYNTH-UAT-TECH-2026-06-14-001 | External token, NDA, manifest, Q&A, token hash, and DLP warning covered by integration evidence. |
| UAT-015 | technical-pass | EV-UAT-015 / SYNTH-UAT-TECH-2026-06-14-001 | Records hold, archive, disposal request, approved disposal, and certificate refs covered by integration evidence. |
| UAT-016 | technical-pass | EV-UAT-016 / SYNTH-UAT-TECH-2026-06-14-001 | SSO, BYOK, SIEM, backup, and compliance reference registries covered by enterprise hardening evidence. |
| UAT-017 | technical-pass | EV-UAT-017 / SYNTH-UAT-TECH-2026-06-14-001 | Scale evidence and `/v1/scale/readiness` covered by scale-learning evidence. |
| UAT-018 | technical-pass | EV-UAT-018 / SYNTH-UAT-TECH-2026-06-14-001 | Audit query/export, immutability, logger, coverage, and allow-listed metadata covered by integration evidence. |
| UAT-019 | technical-pass | EV-UAT-019 / RESTORE-DRILL-AWS-001 / SYNTH-UAT-TECH-2026-06-14-001 | Backup restore rehearsal technical evidence exists; LRB-012 acceptance remains pending. |
| UAT-020 | technical-pass | EV-UAT-020 / SYNTH-UAT-TECH-2026-06-14-001 | Rollback-readiness evidence exists through smoke dry-run, migration/docs gates, and launch validators; production rollback is not executed. |

## Acceptance Rule

UAT is accepted only when:

- all rows are `pass` or `technical-pass`,
- all rows have evidence refs,
- no high or critical finding remains unresolved,
- LRB-011 is accepted by an operator or product owner before pilot or
  production entry,
- no raw document body, customer data, secret, token, or private endpoint is
  committed to this repository.
