# OneDrive Document Import Target Resolution

Date: 2026-06-25

This package resolves approved OneDrive import-scope rows to existing Vault
Matter targets after the AMIC local DB client/matter write step.

It is dry-run only. It does not create documents, document versions,
file objects, storage objects, audit events, customer-wide import state, or
source-of-truth cutover state.

## Inputs

- Approved import scope: `approved-import-scope.local.ndjson.gz`
- Approval ingest receipt: `approval-ingest.sanitized.json`
- Local Vault DB: `amic_vault`
- Tenant scope: AMIC tenant, recorded in receipts only as a hash

Local `.ndjson.gz` inputs and outputs are under `.omo/`, are local-only, and
must not be committed.

## Runner

```bash
pnpm onedrive:import-target-resolution -- \
  --tenant-id <tenant uuid> \
  --output-dir .omo/evidence/BULK-SCOPE-APPROVAL/provisional-approve-complete/document-import-target-resolution/post-matter-code-123-check
```

The runner writes:

- `document-import-target-resolution.sanitized.json`
- `resolved-import-manifest.local.ndjson.gz`
- `blocked-import-targets.local.ndjson.gz`

The sanitized receipt contains counts, hashes, states, and blocker codes only.
The local manifest may contain Vault target IDs and Matter code values for the
next pilot dry-run, but must remain local-only.

## 2026-06-25 Local Result

Baseline DB counts:

| Table                 | Count |
| --------------------- | ----: |
| clients               |    80 |
| matters               |   123 |
| documents             |     0 |
| document_versions     |     0 |
| file_objects          |     0 |
| document_search_index |     0 |

Matter target check:

| Check                          | Result |
| ------------------------------ | -----: |
| approved target Matter codes   |    123 |
| matched existing Vault matters |    123 |
| blocked target count           |      0 |
| duplicate Matter code groups   |      0 |

Document import target resolution:

| Check                         | Result |
| ----------------------------- | -----: |
| approved source rows          | 22,403 |
| unique source object hashes   | 22,403 |
| resolved existing Matter rows | 22,384 |
| archive-only excluded rows    |     19 |
| blocked target rows           |      0 |
| planned documents             | 22,384 |
| planned document versions     | 22,384 |
| planned file objects          | 22,384 |
| minimum planned audit events  | 22,384 |

## Acceptance Gate

- DB `documents` count remains `0`.
- DB `file_objects` count remains `0`.
- Approved source rows only are considered.
- `999_이전` archive-only rows are excluded from import targets.
- Every non-archive approved row resolves to an existing Vault Matter.
- No duplicate import idempotency key is planned.
- Sanitized receipt contains no raw path, filename, document content, OCR text,
  token, cookie, or secret.

Next step: run the pilot import dry-run against the local-only
`resolved-import-manifest.local.ndjson.gz`; do not execute file import until the
pilot dry-run receipt is approved.
