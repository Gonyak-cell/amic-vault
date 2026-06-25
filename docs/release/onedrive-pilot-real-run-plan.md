# OneDrive Pilot Real Run Plan

Status: PILOT WRITE EXECUTED AND CLOSED OUT
Merged in: PR #321
Merge commit: `1ba2db0`
Executed candidate: `pilot-216c0425e3795c0f`
Pilot write run ID: `onedrive-pilot-post-permission-setup-20260625`
Scope: one local pilot Matter, 13 documents
Depends on:

- `docs/release/onedrive-pilot-import-dry-run.md`
- `docs/release/onedrive-pilot-execute-attempt.md`
- `docs/release/onedrive-pilot-closeout-reconciliation.md`
- `docs/release/onedrive-bulk-wave-plan.md`
- `docs/release/onedrive-next-wave-readiness-packet.md`

## Current Decision

Current decision: `PILOT_WRITE_COMPLETE_NEXT_WAVE_APPROVAL_REQUIRED`.

The approved 13-document pilot write has executed locally and passed
post-pilot closeout. This plan is now a historical pilot execution record plus
the entry point for the next bounded wave decision. It does not approve
customer-wide import, OneDrive connected state, Office open/save/sync, Gemma
indexing execution, source-of-truth cutover, external sharing, or production
write claims.

## Completed Pilot Units

| Unit | Result | Evidence |
|---|---|---|
| OP-00 | PASS | branch and package baseline verified before PR #321 |
| OP-04 | PASS | pilot dry-run reported 13 ready rows |
| OP-08 | PASS | pilot write imported 13 rows with 0 failed, 0 blocked, 0 skipped |
| OP-09 | PASS | LC07 reconciliation mismatch count 0 |
| OP-10 | PASS | LC08 Gemma readiness remained policy-blocked; indexing not started |
| OP-11 | PASS | LC09 bounded wave plan gate passed as planning only |

The local idempotency replay for the same pilot write state reported
`already_imported=13` and duplicate create `0`.

## Pilot Closeout Counts

Post-closeout local DB counts recorded in the merged closeout note:

| Table | Count |
|---|---:|
| `documents` | 13 |
| `document_versions` | 13 |
| `file_objects` | 13 |
| `audit_events` | 34069 |
| `matter_members` | 124 |

The detailed receipts remain local-only under `.omo/evidence/` and are not part
of the repo payload.

## Next Testable Units

| Unit | Purpose | PASS Evidence | Stop Condition |
|---|---|---|---|
| PW-00 | Confirm post-merge baseline | PR #321 merged, CI PASS, package audit PASS | merged state or audit cannot be verified |
| PW-01 | Select next bounded Matter batch | local-only wave candidate refs | scope is customer-wide, full corpus, or all Matters |
| PW-02 | Obtain required opaque approvals | customer-scope, rollback, security, legal-data refs | missing or placeholder approval ref |
| PW-03 | Run LC09 wave-plan gate | `wave-plan` PASS with max Matters respected | wave count or Matter count exceeds approved limit |
| PW-04 | Prepare dry-run-only inputs for the next wave | local-only manifest and sanitized summary | raw path, filename, object key, document text, or tenant-private value would enter repo |
| PW-05 | Run next-wave dry-run | no Vault DB write and no Vault storage write | blocked/retryable rows without approved handling |
| PW-06 | Produce next-wave write decision packet | explicit operator approval request | approval bundled with cutover or AI indexing |
| PW-07 | Validate bounded write approval | `next-wave-write-approval` gate PASS | immediate execution, customer-wide import, cutover, or indexing is bundled |

No next-wave write is authorized by this plan. The next allowed executable
action is a bounded wave approval/readiness packet, local dry-run input gate,
and then a dry-run-only run if all gates pass.

Current readiness packet: `docs/release/onedrive-next-wave-readiness-packet.md`.
It records PW-00, PW-01, and PW-03 as prepared/verified; PW-02 and PW-04 now
have gate tooling available but remain pending exact bounded-batch approval and
local-only mapping refs. PW-05 now has receipt gate tooling available, but the
actual next-wave dry-run remains not run and not authorized. PW-06 now has
write decision packet gate tooling available, but the actual write remains not
authorized. PW-07 now has bounded write approval gate tooling available, but
the actual write remains not executed.

## Required Next-Wave Refs

Before any next-wave dry-run is scheduled, hold local-only opaque refs for:

- pilot validation;
- pilot reconciliation;
- rollback/containment owner;
- security and permission review;
- legal-data and retention review;
- customer-scope owner approval for the specific next bounded batch;
- sanitized receipt destination;
- local detailed receipt handling.

Refs must not contain raw OneDrive paths, customer file names, document body
text, source object keys, private tenant identifiers, provider console
metadata, cookies, tokens, or secrets.

## Hard Stops

Stop if:

- the next scope is customer-wide, full corpus, all Matters, or otherwise
  broader than a bounded Matter batch;
- source-of-truth cutover is requested in the same approval as import;
- Gemma indexing execution is requested before permission-before-AI readiness
  is separately approved;
- rollback would require hard delete or audit mutation;
- any artifact would expose raw customer labels or document content;
- any output would claim OneDrive connected-state or Office open/save/sync.
