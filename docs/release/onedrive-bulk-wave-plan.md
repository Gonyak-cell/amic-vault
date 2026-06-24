# OneDrive Post-Pilot Bulk Wave Plan

Status: POST-LAUNCH PLANNING ONLY
Owner: Operator / Customer-scope owner / Security owner / Legal-data owner / Rollback owner
Depends on: `docs/release/onedrive-pilot-import-runbook.md`

## Boundary

This plan starts only after one approved pilot Matter has passed import,
reconciliation, rollback-readiness, and Gemma readiness checks. It does not
approve customer-wide import, OneDrive connected-state, Office open/save/sync,
source-of-truth cutover, external sharing, or Gemma indexing execution.

## Required Pilot Evidence

Before any bulk wave is scheduled, the operator must hold opaque external refs
for:

| Ref | Purpose |
|---|---|
| `ONEDRIVE-PILOT-VALIDATION-REF` | Pilot business validation and user acceptance. |
| `ONEDRIVE-PILOT-RECONCILIATION-REF` | Counts, hashes, audit, storage, and skip/failed item reconciliation. |
| `ONEDRIVE-PILOT-ROLLBACK-REF` | Containment-first rollback rehearsal with no hard delete. |
| `ONEDRIVE-PILOT-GEMMA-READINESS-REF` | Permission-before-AI indexing decision readiness. |
| `ONEDRIVE-CUSTOMER-SCOPE-REF` | Customer-scope owner approval for the next bounded batch. |

## Wave Rules

- Each wave scope is `matter_batch`, never `customer_wide`, `full_corpus`, or
  `all_matters`.
- Default maximum wave size is five Matters.
- Every wave needs a freeze window, mapping ref, rollback ref, and mandatory
  reconciliation.
- OneDrive remains read-only source retention until a separate cutover approval
  ref exists.
- Vault can become source of truth only after pilot validation and explicit
  cutover approval for the same scope.
- Any failed or ambiguous permission, ethical wall, retention, legal-hold,
  audit, storage, or AI-policy mapping blocks widening.

## Validation Tool

Use the closeout gate to validate LC-ONEDRIVE-06 through LC-ONEDRIVE-09
artifacts without importing customer-wide data:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode wave-plan \
  --wave-plan <wave-plan.json> \
  --reconciliation-report <pilot-reconciliation.sanitized.json> \
  --gemma-readiness <pilot-gemma-readiness.sanitized.json> \
  --sanitized-out <bulk-wave-plan.sanitized.json>
```

The sanitized output may contain counts, opaque refs, gate statuses, and bounded
blocker codes only. It must not contain customer file names, raw OneDrive paths,
source object keys, document contents, private tenant identifiers, provider
console metadata, cookies, tokens, or secrets.

## Stop Conditions

Stop if:

- the wave includes more Matters than the approved limit;
- the scope is customer-wide or otherwise broader than a bounded Matter batch;
- the pilot reconciliation or Gemma readiness gate is not PASS;
- source-of-truth cutover is requested without a separate approval ref;
- any rollback path requires hard delete or audit mutation;
- sanitized artifacts would expose detailed customer labels or document content.
