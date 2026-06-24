# OneDrive Pilot Operations Register

Status: REAL PILOT EXECUTION PENDING EXTERNAL REFS
Run ID: `onedrive-staging-20260623-155501`
Scope: one post-launch pilot Matter only

## Selected Pilot Candidate

Recommended first pilot candidate:

| Field | Value |
|---|---:|
| Candidate ID | `ad0e04b500f42b28` |
| Risk class | `low_risk` |
| Object count | `518` |
| Size | `1.376 GiB` |
| Selection reason | Low-risk candidate with small object count and bounded size. |

This candidate is selected from sanitized staging evidence only. The register
does not contain raw customer paths, file names, source object keys, document
contents, private tenant identifiers, provider console metadata, cookies,
tokens, or secrets.

## Required External Refs

The following refs must be supplied outside the repository before LC-ONEDRIVE-06
real pilot write-mode can run:

| Ref | Status | Owner |
|---|---|---|
| `ONEDRIVE-PILOT-MATTER-REF` | `PENDING_EXTERNAL_REF` | Customer-scope owner |
| `ONEDRIVE-MAPPING-REF` | `PENDING_EXTERNAL_REF` | Operator |
| `ONEDRIVE-PERMISSION-REF` | `PENDING_EXTERNAL_REF` | Security owner |
| `ONEDRIVE-RETENTION-REF` | `PENDING_EXTERNAL_REF` | Legal-data owner |
| `ONEDRIVE-LEGAL-DATA-REF` | `PENDING_EXTERNAL_REF` | Legal-data owner |
| `ONEDRIVE-CUSTOMER-SCOPE-REF` | `PENDING_EXTERNAL_REF` | Customer-scope owner |
| `ONEDRIVE-ROLLBACK-REF` | `PENDING_EXTERNAL_REF` | Rollback owner |
| `ONEDRIVE-DRYRUN-PASS-REF` | `PENDING_EXTERNAL_REF` | Operator |
| `ONEDRIVE-WRITE-WINDOW-REF` | `PENDING_EXTERNAL_REF` | Operator |
| `ONEDRIVE-DB-SNAPSHOT-REF` | `PENDING_EXTERNAL_REF` | Operator / Infrastructure |
| `ONEDRIVE-STORAGE-CONTAINMENT-REF` | `PENDING_EXTERNAL_REF` | Operator / Infrastructure |
| `ONEDRIVE-IMPORT-LOCK-REF` | `PENDING_EXTERNAL_REF` | Operator |
| `ONEDRIVE-SANITIZED-RECEIPT-DESTINATION-REF` | `PENDING_EXTERNAL_REF` | Operator |
| `ONEDRIVE-LOCAL-RECEIPT-HANDLING-REF` | `PENDING_EXTERNAL_REF` | Operator / Security owner |

## Execution Decision

Current decision: `DO_NOT_RUN_REAL_PILOT_WRITE`.

Reason: all real external refs are still pending. Synthetic refs from LC package
tests are not approval refs and must not be used for production pilot write-mode.

## Next Command Shape

Once every ref is supplied, create a local-only mapping JSON from
`docs/release/onedrive-pilot-real-refs.example.json`, then run:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode write-preflight \
  --run-id onedrive-staging-20260623-155501 \
  --candidate-id ad0e04b500f42b28 \
  --mapping <local-only-real-refs-mapping.json> \
  --dryrun-report <pilot-dryrun-report.sanitized.json> \
  --synthetic-receipt <synthetic-import-receipt.sanitized.json> \
  --sanitized-out <pilot-write-preflight.sanitized.json>
```

Proceed to real write-mode only if this gate returns `gate_status=pass` with
zero blockers.

## Hard Stops

Stop if:

- the scope expands beyond the selected pilot candidate;
- any required ref is missing or ambiguous;
- permission, ethical wall, retention, or legal-hold mapping is unclear;
- rollback requires hard delete or audit mutation;
- a summary would expose raw customer labels or document content;
- any step would claim OneDrive connected-state, Office open/save/sync, Gemma
  indexing execution, or source-of-truth cutover.
