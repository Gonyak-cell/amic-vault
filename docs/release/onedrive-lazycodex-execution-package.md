# OneDrive LazyCodex Execution Package

Status: POST-PILOT CLOSEOUT COMPLETE, NEXT WAVE APPROVAL REQUIRED
Owner: Operator / Customer-scope owner / Security owner / Legal-data owner / Rollback owner
Scope: one approved local pilot Matter executed; next scope must be bounded Matter batch only

## Boundary

This package records the OneDrive staging-to-Vault pilot path without approving
customer-wide import, OneDrive connected state, Office open/save/sync,
source-of-truth cutover, external sharing, or Gemma indexing execution.

The current package proves:

- staging control evidence can be referenced without committing raw source paths;
- a sanitized pilot candidate and mapping packet can be prepared;
- the 13-document local pilot write executed and closed out under PR #321;
- dry-run, write execution, reconciliation, Gemma readiness, and bulk-wave
  gates are executable as bounded LazyCodex units;
- post-pilot wave planning stays Matter-batch only.

The current package does not prove:

- production Vault DB or storage writes occurred;
- Gemma indexing was enqueued or run;
- Vault became source of truth;
- OneDrive or Office runtime integration is live.

## LC Matrix

| LC | Purpose | Prepared Artifact | Execution State |
|---|---|---|---|
| LC-ONEDRIVE-00 | Worktree and staging control baseline | `.omo/evidence/LC-ONEDRIVE-00/*` | prepared |
| LC-ONEDRIVE-01 | Sanitized manifest profiler and candidate summary | `tools/migration/onedrive-profile-manifest.mjs` | prepared |
| LC-ONEDRIVE-02 | Pilot mapping and approval packet | `docs/release/onedrive-pilot-mapping-template.md` and approval checklist | prepared |
| LC-ONEDRIVE-03 | Worker contract and runbook | worker design/runbook | prepared |
| LC-ONEDRIVE-04 | No-write dry-run validator | `tools/migration/onedrive-pilot-dryrun.mjs` | prepared |
| LC-ONEDRIVE-05 | Synthetic write-mode import worker | `tools/migration/onedrive-pilot-import.mjs` | prepared, synthetic only |
| LC-ONEDRIVE-06 | Pilot write execution | `docs/release/onedrive-pilot-execute-attempt.md` | local pilot write executed; 13 imported |
| LC-ONEDRIVE-07 | Reconciliation | closeout `reconcile` mode | pass; mismatch count 0 |
| LC-ONEDRIVE-08 | Gemma indexing readiness | closeout `gemma-readiness` mode | pass; indexing not started |
| LC-ONEDRIVE-09 | Post-pilot bulk wave plan | `docs/release/onedrive-bulk-wave-plan.md`, `docs/release/onedrive-next-wave-readiness-packet.md`, and closeout `wave-plan` mode | pass, Matter-batch only |

## Package Audit

Run the full package audit after any LC artifact change:

```bash
node tools/migration/onedrive-pilot-closeout.mjs \
  --mode package-audit \
  --run-id onedrive-lazycodex-package \
  --evidence-root .omo/evidence \
  --sanitized-out .omo/evidence/LC-ONEDRIVE-09/artifacts/package-audit.sanitized.json
```

Expected package audit output after pilot closeout:

```text
gate_status=pass
customer_wide_import=not_executed
pilot_write=not_executed_by_package_audit
gemma_indexing=not_started
source_of_truth_cutover=not_approved
```

The actual pilot write is recorded separately in
`docs/release/onedrive-pilot-execute-attempt.md` and
`docs/release/onedrive-pilot-closeout-reconciliation.md`: 13 rows imported, 0
failed, 0 blocked, and 0 skipped.

## Next-Wave Entry Criteria

The post-pilot sequence is tracked in
`docs/release/onedrive-pilot-real-run-plan.md`. Start with bounded wave
approval/readiness before preparing any next-wave dry-run. The current
operator packet is `docs/release/onedrive-next-wave-readiness-packet.md`.

Before any next wave can run, hold opaque external refs for:

- the specific bounded Matter batch;
- mapping, permission, retention, legal-data, and customer-scope ownership;
- next-wave dry-run PASS;
- import window and lock;
- DB snapshot and storage containment;
- rollback owner and no-hard-delete rollback constraints;
- sanitized receipt destination and local-only detailed receipt handling.

If any ref is missing or ambiguous, the next-wave gate must remain blocked.

## Handoff Rule

Operator-facing summaries may include counts, bounded status categories, hashed
candidate ids, opaque refs, and sanitized artifact paths. They must not include
customer document names, raw OneDrive paths, source object keys, document
contents, private tenant identifiers, provider console metadata, cookies,
tokens, or secrets.
