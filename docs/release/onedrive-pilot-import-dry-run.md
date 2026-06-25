# OneDrive Pilot Import Dry Run

Date: 2026-06-25

This records the first post-target-resolution pilot import dry-run. It is not
an import execution receipt.

## Boundary

Executed:

- Pilot candidate selection from the resolved local manifest.
- Local-only pilot scope generation for one Matter.
- Local-only pilot target generation.
- `pnpm onedrive:pilot-write -- --dry-run`.

Not executed:

- Vault document creation.
- Vault file object creation.
- Document version creation.
- Storage write.
- Customer-wide import.
- Source-of-truth cutover.
- Gemma indexing.
- OneDrive connected-state, Office open/save, or sync behavior.

## Local Artifacts

All artifacts below are under `.omo/` and are local-only:

- `pilot-scope-selection.sanitized.json`
- `pilot-target.sanitized.json`
- `pilot-write-dry-run.sanitized.json`
- `pilot-scope.local.ndjson.gz`
- `pilot-mapping.local.json`
- `pilot-target.local.json`

Local artifacts were set to mode `0600`.

## Result

Pilot candidate:

| Field            | Value                    |
| ---------------- | ------------------------ |
| candidate id     | `pilot-216c0425e3795c0f` |
| scope rows       | 13                       |
| extensions       | `.pdf` only              |
| unsupported rows | 0                        |
| zero-byte rows   | 0                        |
| max object size  | 4,464,471 bytes          |

Pilot-write dry-run:

| Check                        |  Result |
| ---------------------------- | ------: |
| gate status                  |    PASS |
| source manifest rows checked | 190,064 |
| pilot scope rows             |      13 |
| ready rows                   |      13 |
| blocked rows                 |       0 |
| failed rows                  |       0 |
| skipped rows                 |       0 |
| imported rows                |       0 |

DB counts after dry-run:

| Table                 | Count |
| --------------------- | ----: |
| clients               |    80 |
| matters               |   123 |
| documents             |     0 |
| document_versions     |     0 |
| file_objects          |     0 |
| document_search_index |     0 |

## Gate

The pilot dry-run is ready for human review. The next step is a separate,
explicitly approved pilot execute run for this same local-only scope. Do not
execute import or storage writes without that approval.
