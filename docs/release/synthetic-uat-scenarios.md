# Synthetic UAT Scenarios

Status: STAGING AVAILABLE - SYNTHETIC ONLY
Date: 2026-06-14

These scenarios expand UAT-001 through UAT-020 into executable paths. They use
seeded development tenants locally, or approved synthetic/pilot data in staging.
They do not authorize real customer data, external sharing, external model
calls, or production release.

## Execution Rules

- Use approved synthetic data only.
- Record evidence refs, not secrets, private endpoints, screenshots containing
  sensitive data, raw document text, or customer identifiers.
- Each scenario needs a positive path and a negative permission or invariant
  check when applicable.
- Any failed permission, audit, tenant isolation, DLP, records, external portal,
  or AI invariant becomes a launch blocker.

## Scenario Matrix

| UAT | Primary Path | Negative / Invariant Check | Evidence Ref |
|---|---|---|---|
| UAT-001 | Log in as approved internal user and open `/dashboard`. | Session tenant context is one tenant only; unauthenticated `/dashboard` redirects to `/login`. | EV-UAT-001 |
| UAT-002 | Create client, matter, party, and matter team using approved synthetic data. | Non-member cannot read the matter; matter/member audit events exist. | EV-UAT-002 |
| UAT-003 | Create ethical wall membership and run search/document/email/graph/AI/external checks. | Excluded user receives safe denial with no title, snippet, metadata, or target existence leak. | EV-UAT-003 |
| UAT-004 | Upload document, create new version, preview, download with reason, then soft-delete. | Original file object is not overwritten; hold flag blocks delete; DOCUMENT_* audit refs exist. | EV-UAT-004 |
| UAT-005 | Run keyword, metadata, and semantic search on authorized matter. | Unauthorized matter result count is zero before result construction, not post-filtered. | EV-UAT-005 |
| UAT-006 | Import synthetic EML, parse metadata, link attachment to a matter. | Audit/event metadata contains refs only, no raw body/header text. | EV-UAT-006 |
| UAT-007 | Upload DLP-positive synthetic fixture and review finding. | External share is blocked or warning-gated; finding stores hash/ref only. | EV-UAT-007 |
| UAT-008 | Request, approve, use, and revoke break-glass access. | Access expires/revokes and cannot exceed approved matter/action scope. | EV-UAT-008 |
| UAT-009 | Ask a local-only AI evidence question with citations. | External model route stays closed; unauthorized evidence is blocked before AI. | EV-UAT-009 |
| UAT-010 | Open graph facts for authorized matter. | Permission-scoped graph excludes walled or non-member facts; drift check remains green. | EV-UAT-010 |
| UAT-011 | Parse synthetic contract and run deterministic rule set. | Rule output is reproducible and reference-only; no raw prompt/response body stored. | EV-UAT-011 |
| UAT-012 | Create DD RFI, map internal data-room item, trace issue/risk. | No public VDR exposure or external user listing appears outside R11 portal gate. | EV-UAT-012 |
| UAT-013 | Create litigation evidence, fact, issue tree, and draft reference. | No court filing, external transmission, or raw evidence body in audit. | EV-UAT-013 |
| UAT-014 | Issue secure link token, accept NDA, open manifest, submit Q&A. | Raw token is one-time only and never stored; DLP warning enforcement works. | EV-UAT-014 |
| UAT-015 | Apply legal hold, archive, request disposal, approve and execute eligible disposal. | Active hold blocks disposal; certificate contains refs/hash/count only. | EV-UAT-015 |
| UAT-016 | Register SSO, BYOK, SIEM, backup, and compliance refs. | No raw certificate, key, assertion, endpoint secret, or outbound SIEM delivery is stored. | EV-UAT-016 |
| UAT-017 | Record performance, cost, eval, migration, and learning evidence. | `/v1/scale/readiness` passes only when required refs exist; external model allowed count is zero. | EV-UAT-017 |
| UAT-018 | Query and export audit events. | Metadata allow-list holds and sensitive raw markers are absent. | EV-UAT-018 |
| UAT-019 | Restore approved non-production backup. | Tenant isolation, audit append-only, records hold, and search permission invariants remain intact. | EV-UAT-019 |
| UAT-020 | Rehearse application rollback to previous image set. | Previous image serves, migrations are compatible, smoke checks pass, and no data loss is observed. | EV-UAT-020 |

## Local Pre-Staging Loop

Use this loop before approved staging exists:

```bash
pnpm release:smoke -- --dry-run
pnpm release:smoke -- --local
pnpm release:local-preflight
pnpm launch:readiness
pnpm launch:execution
pnpm docs:frozen
```

Local results are confidence evidence only. They do not replace staging UAT
evidence refs.
