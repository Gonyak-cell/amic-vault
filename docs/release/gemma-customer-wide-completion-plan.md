# Gemma Customer-Wide Completion Plan

Date: 2026-06-28
Scope: local AMIC Vault DB after OneDrive customer-wide import, source-of-truth cutover, and extraction/search backfill.

## Completion Target

All 22,299 imported Vault documents must end in one of these states:

1. `gemma_prep_complete`
   - Document is extraction `ready`.
   - Document has a `document_search_index` row.
   - Document is `ai_allowed=true`.
   - Permission-before-AI, tenant isolation, legal hold, deleted status, and ethical wall gates pass.
   - Required Gemma prep artifacts exist and are completed:
     - `document_profile`
     - `key_fields`
     - `keyword_tags`
     - `filing_suggestions`

2. `ocr_remediation_backlog`
   - Document is `ocr_pending`.
   - It cannot be analyzed by Gemma until an OCR engine/policy is approved and run.
   - It is counted in an approved sanitized backlog receipt.

3. `retry_remediation_backlog`
   - Document failed due to transient reasons such as `WORKER_TIMEOUT` or `WORKER_EXCEPTION`.
   - It must be requeued in bounded batches.
   - If reprocessed to ready, it rejoins the Gemma prep lane.

4. `parser_or_policy_backlog`
   - Document failed due to parser/policy reasons such as `WORKER_REJECTED`, `PDF_PARSE_FAILED`, `DOCX_TEXT_EMPTY`, or protected Office files.
   - It must be mapped to either parser support, policy skip, or approved exclusion.

5. `approved_exclusion`
   - Document cannot be processed because it is encrypted, unsupported legacy binary, deleted, legal hold blocked, ethical-wall blocked, or otherwise intentionally excluded.
   - The exclusion must be aggregate/sanitized and explainable.

## Non-Negotiable Boundaries

- Do not save raw source paths, document names, document body text, OCR excerpts, object keys, tokens, secrets, or tenant-private raw labels in repo receipts.
- Do not claim OneDrive connected-state.
- Do not claim Office open/save/sync.
- Do not mark OCR pending or failed rows as Gemma complete without actual ready/search-indexed proof.
- Permission-before-AI remains query/preflight-stage, not post-hoc filtering.

## TUW Breakdown

### GEMMA-CW-001: Ready Candidate Census

- Count ready/search-indexed documents.
- Exclude deleted, legal hold, ethical-wall blocked, missing index, and non-AMIC tenant rows.
- Produce sanitized aggregate dry-run receipt.

Acceptance:
- Candidate count is explainable.
- Excluded count is grouped by reason.
- No DB writes.

### GEMMA-CW-002: Ready ai_allowed Execute Surface

- Add or reuse a CLI runner that can update all eligible ready/search-indexed documents.
- Write audit in the same transaction.
- Support `--dry-run` and `--execute`.
- Receipt must include only counts, hashes, refs, and boolean gate results.

Acceptance:
- Dry-run reports target count.
- Execute updates exactly target count.
- Audit row exists.
- Re-run dry-run reports zero remaining target rows.

### GEMMA-CW-003: Gemma Prep Preflight

- Count ready/search-indexed/ai_allowed documents lacking one or more required artifact kinds.
- Exclude OCR pending, failed, deleted, legal hold, and ethical-wall blocked documents.
- Verify local Gemma/AI prep queue readiness.

Acceptance:
- Queue target count and expected artifact count are known.
- No content or raw object data is written to receipt.

### GEMMA-CW-004: Gemma Prep Execute

- Enqueue and process required artifact jobs for eligible documents.
- Use bounded batches and receipts.
- Retry transient failures; classify permanent failures.

Acceptance:
- Completed artifact count equals expected count or every gap is in a remediation/exclusion lane.
- Re-run is idempotent.

### GEMMA-CW-005: Ready Lane Closeout

- Verify all eligible ready documents have all required artifact kinds completed.
- Run permission-filtered retrieval/API smoke where available.
- Leak scan receipts.

Acceptance:
- Ready lane status is PASS.

### OCR-REMED-001: OCR Pending Remediation

- Keep current OCR pending rows as backlog until an OCR engine is approved.
- Implement OCR using synthetic tests first.
- After OCR, ready rows rejoin GEMMA-CW-001.

Acceptance:
- OCR pending rows are either converted to ready/search-indexed or remain in approved backlog.

### FAIL-REMED-001: Failed Row Remediation

- Requeue transient failures.
- Add parser/policy support where feasible.
- Move unsupported/encrypted/protected rows to approved exclusion when not automatically recoverable.

Acceptance:
- No failed row remains unresolved or unknown.

### FINAL-GEMMA-CLOSEOUT-001: Whole Scope Closeout

- Produce final state matrix for all 22,299 documents.
- Verify:
  - `gemma_prep_complete + approved backlog/exclusion = 22,299`
  - unresolved/unknown = 0
  - leak scan PASS
  - audit/receipt present

