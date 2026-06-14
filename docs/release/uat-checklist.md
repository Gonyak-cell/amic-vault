# UAT Checklist

Status: ACCEPTED - SYNTHETIC TECHNICAL UAT

Use approved synthetic data only for the current launch scope. Do not upload
real customer documents until a later explicit customer-data approval replaces
LRB-007.

For local development confidence before staging exists, use
`docs/release/local-synthetic-uat-walkthrough.md`. For scenario-by-scenario
steps and negative checks, use `docs/release/synthetic-uat-scenarios.md`. These
local materials do not replace the evidence refs required below.
Synthetic technical evidence is recorded in
`docs/release/synthetic-uat-evidence.md` under
`SYNTH-UAT-TECH-2026-06-14-001`; product acceptance is recorded under
`APPROVAL-LRB-011-SYNTH-UAT-2026-06-14`.

| ID | Area | Scenario | Pass Criteria | Evidence |
|---|---|---|---|---|
| UAT-001 | Auth | Internal user logs in and receives tenant context. | Session is scoped to one tenant. | EV-UAT-001 / STAGE-MAIN-MERGE-AWS-001 |
| UAT-002 | Matter | Create client, matter, party, and matter team. | Audit events exist; non-member access denied. | EV-UAT-002 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-003 | Permission | Ethical wall excludes a user. | Search, document, email, graph, AI, and external flows deny access. | EV-UAT-003 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-004 | Document | Upload, version, preview, download, and soft-delete document. | Immutable original, download reason, view/download/delete audit. | EV-UAT-004 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-005 | Search | Keyword, metadata, and semantic search. | Only authorized results, snippets, facets, and citations appear. | EV-UAT-005 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-006 | Email | Import EML, extract metadata, link attachment, file to matter. | Raw header/body not exposed in audit; attachment follows document permissions. | EV-UAT-006 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-007 | DLP | Upload DLP-positive synthetic fixture. | Finding stored reference-only and egress/external share blocks as designed. | EV-UAT-007 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-008 | Break Glass | Request, dual approve, use, revoke. | Temporary access works only under approved scope and is audited. | EV-UAT-008 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-009 | AI Evidence | Ask local-only evidence question. | Permission-before-AI, citations, warnings, and audit evidence are correct. | EV-UAT-009 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-010 | Graph | View graph facts for a matter. | Facts are permission-scoped and drift check remains green. | EV-UAT-010 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-011 | Contract | Parse contract, run deterministic rules. | Rule findings are reproducible and reference-only. | EV-UAT-011 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-012 | DD | Create RFI, map data room item, trace issue/risk. | Internal-only mapping, no external VDR exposure. | EV-UAT-012 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-013 | Litigation | Create evidence, facts, issue tree, pleading draft. | Internal-only litigation workspace, no court filing or external transmission. | EV-UAT-013 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-014 | External Portal | Issue token, accept NDA, open manifest, Q&A. | Token hash only, DLP warning enforced, no raw token stored. | EV-UAT-014 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-015 | Records | Apply hold, archive, request disposal, execute approved disposal. | Active hold blocks disposal; certificate is reference-only. | EV-UAT-015 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-016 | Enterprise | Register SSO/BYOK/SIEM/backup/compliance refs. | Reference-only readiness, no raw secret or outbound delivery. | EV-UAT-016 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-017 | Scale | Record performance, cost, eval, migration, learning evidence. | `/v1/scale/readiness` returns technical pass only with complete evidence. | EV-UAT-017 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-018 | Audit | Query and export audit events. | Metadata is allow-listed and contains no sensitive raw content. | EV-UAT-018 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-019 | Backup | Restore rehearsal on approved non-production data. | Restore evidence exists and audit/records invariants are preserved. | EV-UAT-019 / RESTORE-DRILL-AWS-001 / SYNTH-UAT-TECH-2026-06-14-001 |
| UAT-020 | Rollback | Rehearse application rollback. | Previous image restores and smoke checks pass. | EV-UAT-020 / SYNTH-UAT-TECH-2026-06-14-001 |

UAT is accepted because all rows have evidence refs, zero unresolved critical or
high findings are recorded in this launch package, and LRB-011 is accepted by an
operator/product approval ref.
