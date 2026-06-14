# UAT Evidence Template

Status: PARTIAL - UAT-001 PASSED, REMAINING ROWS TEMPLATE

Use approved synthetic data unless LRB-007 explicitly approves pilot customer
data and controls. Evidence refs may point to external systems when they include
private deployment metadata or screenshots.

Local development walkthrough evidence may be collected with
`docs/release/local-synthetic-uat-walkthrough.md`, but local evidence does not
accept UAT for staging or production.

| UAT ID | Result | Evidence Ref | Notes |
|---|---|---|---|
| UAT-001 | pass | EV-UAT-001 / STAGE-MAIN-MERGE-AWS-001 | Auth, tenant context, unauthenticated redirect, authenticated dashboard, tenant-scoped API response, and negative role denial passed in current main-merge staging smoke. |
| UAT-002 | TBD | TBD | Client, matter, party, team, audit, non-member denial. |
| UAT-003 | TBD | TBD | Ethical wall denial across search, document, email, graph, AI, external. |
| UAT-004 | TBD | TBD | Upload, version, preview, download, soft-delete, audit. |
| UAT-005 | TBD | TBD | Keyword, metadata, semantic search authorization. |
| UAT-006 | TBD | TBD | EML import, metadata extraction, attachment filing. |
| UAT-007 | TBD | TBD | Synthetic DLP-positive fixture and egress/external block. |
| UAT-008 | TBD | TBD | Break-glass request, dual approval, use, revoke. |
| UAT-009 | TBD | TBD | Local-only AI evidence, citations, warnings, audit. |
| UAT-010 | TBD | TBD | Matter-scoped graph facts and drift check. |
| UAT-011 | TBD | TBD | Contract parsing and deterministic rules. |
| UAT-012 | TBD | TBD | DD RFI, internal data room mapping, issue/risk trace. |
| UAT-013 | TBD | TBD | Litigation evidence, facts, issue tree, internal pleading draft. |
| UAT-014 | TBD | TBD | External token, NDA, manifest, Q&A, DLP warning. |
| UAT-015 | TBD | TBD | Records hold, archive, disposal request, approved disposal. |
| UAT-016 | TBD | TBD | SSO, BYOK, SIEM, backup, compliance reference registries. |
| UAT-017 | TBD | TBD | Scale evidence and `/v1/scale/readiness`. |
| UAT-018 | TBD | TBD | Audit query/export with allow-listed metadata. |
| UAT-019 | TBD | TBD | Backup restore rehearsal on approved non-production data. |
| UAT-020 | TBD | TBD | Application rollback rehearsal and smoke checks. |

## Acceptance Rule

UAT is accepted only when:

- all rows are `pass`,
- all rows have evidence refs,
- no high or critical finding remains unresolved,
- no raw document body, customer data, secret, token, or private endpoint is
  committed to this repository.
