# File Server and PST Import Runbook

This runbook covers H11 repo-local tooling for file-server and PST import waves.
It does not authorize production writes by itself.

## Boundaries

- File-server waves start from a mounted local directory.
- PST waves start from `readpst` output or an already extracted EML directory.
- The tools create local operator manifests and sanitized receipts only.
- No Vault database, storage, document, email, or cutover writes happen in these profiling steps.
- SharePoint, iManage, NetDocuments, live sync, and AI mapping suggestions are out of scope.

## File Server Profiling

Run:

```bash
node tools/migration/fileserver-profile-manifest.mjs \
  --root /Volumes/source-wave \
  --manifest-out .omo/evidence/fileserver-wave/local-manifest.ndjson \
  --receipt-out .omo/evidence/fileserver-wave/sanitized-receipt.json \
  --run-id FS-WAVE-001 \
  --dry-run
```

The local manifest includes operator-only relative paths so the approved write
stage can resolve source files. The sanitized receipt includes counts, hashes,
extension distribution, and blocker counts only.

Expected folder mapping for deterministic matter-code resolution:

```text
<client_short_name>/<matter_type_english>/<matter_detail_type_korean>/<files...>
```

The tool reuses the OneDrive import target-resolution blocker rules for
`matter_code`, `client_short_name`, matter type, detail type, source hash, size,
and extension validation.

## PST Profiling

For a PST archive with `readpst` installed:

```bash
node tools/migration/pst-import.mjs \
  --pst /Volumes/source-wave/archive.pst \
  --extract-dir .omo/evidence/pst-wave/extracted \
  --matter-code AMIC/Civil/ContractReview \
  --plan-out .omo/evidence/pst-wave/local-plan.ndjson \
  --receipt-out .omo/evidence/pst-wave/sanitized-receipt.json \
  --run-id PST-WAVE-001 \
  --dry-run
```

For pre-extracted EML fixtures:

```bash
node tools/migration/pst-import.mjs \
  --eml-dir .omo/evidence/pst-wave/extracted \
  --matter-code AMIC/Civil/ContractReview \
  --plan-out .omo/evidence/pst-wave/local-plan.ndjson \
  --receipt-out .omo/evidence/pst-wave/sanitized-receipt.json \
  --run-id PST-WAVE-001 \
  --dry-run
```

The plan marks duplicate EML bytes by message hash and blocks invalid
`matter_code` mappings before any email-service write path is called.

## Approval and Write Handoff

After profiling:

1. Review sanitized receipts and blocker counts.
2. Resolve mapping blockers through the approval workbook lane.
3. Use the existing OneDrive target-resolution and pilot dry-run/write/closeout
   stages after source rows are approved.
4. Preserve wave receipts under the release evidence path for the operator wave.

Promotion to complete candidate still requires a real sample file-server wave,
a real PST wave, `/files`/`/matters` and email-vault UI verification, audit
evidence, and the focused package/tool checks recorded in the TUW ledger.
