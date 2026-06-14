# UAT Checklist

Status: PARTIAL - UAT-001 PASSED, UAT-002 THROUGH UAT-020 NOT FULLY EXECUTED

Use approved synthetic or explicitly approved pilot data only. Do not upload real
customer documents until customer-data approval is recorded.

For local development confidence before staging exists, use
`docs/release/local-synthetic-uat-walkthrough.md`. For scenario-by-scenario
steps and negative checks, use `docs/release/synthetic-uat-scenarios.md`. These
local materials do not replace the evidence refs required below.

| ID | Area | Scenario | Pass Criteria | Evidence |
|---|---|---|---|---|
| UAT-001 | Auth | Internal user logs in and receives tenant context. | Session is scoped to one tenant. | EV-UAT-001 / STAGE-MAIN-MERGE-AWS-001 |
| UAT-002 | Matter | Create client, matter, party, and matter team. | Audit events exist; non-member access denied. | TBD |
| UAT-003 | Permission | Ethical wall excludes a user. | Search, document, email, graph, AI, and external flows deny access. | TBD |
| UAT-004 | Document | Upload, version, preview, download, and soft-delete document. | Immutable original, download reason, view/download/delete audit. | TBD |
| UAT-005 | Search | Keyword, metadata, and semantic search. | Only authorized results, snippets, facets, and citations appear. | TBD |
| UAT-006 | Email | Import EML, extract metadata, link attachment, file to matter. | Raw header/body not exposed in audit; attachment follows document permissions. | TBD |
| UAT-007 | DLP | Upload DLP-positive synthetic fixture. | Finding stored reference-only and egress/external share blocks as designed. | TBD |
| UAT-008 | Break Glass | Request, dual approve, use, revoke. | Temporary access works only under approved scope and is audited. | TBD |
| UAT-009 | AI Evidence | Ask local-only evidence question. | Permission-before-AI, citations, warnings, and audit evidence are correct. | TBD |
| UAT-010 | Graph | View graph facts for a matter. | Facts are permission-scoped and drift check remains green. | TBD |
| UAT-011 | Contract | Parse contract, run deterministic rules. | Rule findings are reproducible and reference-only. | TBD |
| UAT-012 | DD | Create RFI, map data room item, trace issue/risk. | Internal-only mapping, no external VDR exposure. | TBD |
| UAT-013 | Litigation | Create evidence, facts, issue tree, pleading draft. | Internal-only litigation workspace, no court filing or external transmission. | TBD |
| UAT-014 | External Portal | Issue token, accept NDA, open manifest, Q&A. | Token hash only, DLP warning enforced, no raw token stored. | TBD |
| UAT-015 | Records | Apply hold, archive, request disposal, execute approved disposal. | Active hold blocks disposal; certificate is reference-only. | TBD |
| UAT-016 | Enterprise | Register SSO/BYOK/SIEM/backup/compliance refs. | Reference-only readiness, no raw secret or outbound delivery. | TBD |
| UAT-017 | Scale | Record performance, cost, eval, migration, learning evidence. | `/v1/scale/readiness` returns technical pass only with complete evidence. | TBD |
| UAT-018 | Audit | Query and export audit events. | Metadata is allow-listed and contains no sensitive raw content. | TBD |
| UAT-019 | Backup | Restore rehearsal on approved non-production data. | Restore evidence exists and audit/records invariants are preserved. | TBD |
| UAT-020 | Rollback | Rehearse application rollback. | Previous image restores and smoke checks pass. | TBD |

UAT is accepted only when all rows have evidence refs and zero unresolved
critical or high findings.
