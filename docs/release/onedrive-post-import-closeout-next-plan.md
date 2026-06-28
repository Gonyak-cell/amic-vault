# OneDrive Post-Import Closeout Next Plan

Date: 2026-06-28
Scope: local AMIC Vault DB after customer-wide OneDrive import and extraction/search backfill closeout.

## Baseline

- Documents: 22,299
- Extraction pending: 0
- Extraction ready/search indexed: 9,691
- OCR pending: 4,760
- Extraction failed: 7,848
- AI allowed: 3 documents
- Source-of-truth cutover: executed locally
- Customer-wide Gemma indexing: not executed

## Boundaries

- Do not store raw source paths, document names, document body text, OCR excerpts, object keys, tokens, secrets, or tenant-private raw labels in repo receipts.
- Do not claim OneDrive connected-state or Office open/save/sync.
- Do not execute customer-wide Gemma indexing without a separate explicit approval gate.
- OCR pending rows are not failures; they require a separate OCR engine/policy lane before search/Gemma eligibility.

## TUW Plan

### POST-CLOSEOUT-001: Push Current Closeout Commit

- Push current branch to origin.
- Verify remote tracking branch and commit SHA.

Acceptance:
- `git push` exits 0.
- Current branch tracks origin.

### OCR-REMED-001: Remediation Dry-Run Receipt

- Capture sanitized aggregate counts for `ocr_pending` and `failed` rows.
- Group by extraction status, failure reason, extraction method, MIME type, and byte totals.
- Produce a no-content remediation matrix.

Acceptance:
- Receipt contains only aggregate counts and reason codes.
- Leak scan passes.

### OCR-REMED-002: Retry Candidate Classification

- Classify transient retry candidates:
  - `WORKER_TIMEOUT`
  - `WORKER_EXCEPTION`
- Classify policy/blocked candidates:
  - `UNSUPPORTED_HWP_BINARY`
  - `ENCRYPTED_PDF`
  - protected or invalid Office files
- Classify OCR-engine candidates:
  - `ocr_pending`
  - image-only PDFs

Acceptance:
- Each row class is mapped to one remediation lane.
- No row is moved to ready without extraction/search proof.

### OCR-REMED-003: Retry Execute Gate

- Requeue only approved retry candidates.
- Execute in bounded batches.
- Verify DB deltas: failed decreases or remains explained, ready/search-indexed increases only with extracted text.
- Stop on any leak, raw value, or unexpected status.

Acceptance:
- Retry receipt PASS.
- Search index parity remains true.

### OCR-REMED-004: OCR Engine Gate

- Select OCR engine and permission-before-AI/search policy.
- Add synthetic tests before customer data execution.
- Execute only after explicit approval.

Acceptance:
- OCR engine does not persist raw OCR excerpts in receipts.
- OCR output enters canonical/search through existing audit-safe extraction path.

### GEMMA-ALLOW-001: Pilot Allowlist Expansion Dry Run

- Use existing `gemma:ai-allowed-pilot` surface.
- Start with `--select-smallest` dry-run.
- Keep target document count within pilot limit.

Acceptance:
- Dry-run receipt is `ready_for_execute`.
- `gemma_indexing_executed=false`.

### GEMMA-ALLOW-002: Explicit Allowlist Approval Gate

- Convert selected matter ids into an explicit allowlist file outside tracked repo evidence when execution is approved.
- Execute `ai_allowed=true` only for approved matters/documents.

Acceptance:
- Audit event is created.
- Updated count equals expected target count.

### GEMMA-IDX-001: Gemma Indexing Preflight

- Check permission-before-AI, aiAllowed, ethical wall, tenant isolation, and ready extraction status.
- Exclude OCR pending and failed rows.

Acceptance:
- Target count is bounded and explainable.
- No customer-wide indexing claim before execute receipt PASS.

### GEMMA-IDX-002: Gemma Indexing Execute

- Execute only after separate explicit approval.
- Verify artifact counts, rejected/blocked counts, and retrieval permission smoke.

Acceptance:
- Audit/event receipt PASS.
- Permission-filtered retrieval smoke PASS.
