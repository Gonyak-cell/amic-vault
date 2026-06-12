# R4 HWP5 Binary Extraction Spike

PACK: PACK-R4-05
TUW: INGEST-HWP5-SPIKE-TUW-001

## Scope

This spike evaluates the boundary for legacy HWP5 binary extraction in the R4 ingestion worker. It does not add a production HWP5 parser and does not claim support for binary `.hwp` extraction.

## Findings

- HWPX extraction is already handled as a zipped XML format by `workers/ingestion/app/parsers/hwpx.py`.
- Legacy HWP5 binary files use an OLE compound container. The current worker detects the OLE signature `D0 CF 11 E0` before extension-specific parsing.
- No approved dependency or in-house parser exists in this release for safe HWP5 body extraction.
- Returning partial or lossy body text would create misleading downstream search and DLP evidence.

## Boundary

- Binary HWP5 input must return `status=failed`, `extraction_method=failed`, and `failure_reason_code=UNSUPPORTED_HWP_BINARY`.
- `body_text` must be empty.
- The worker must not emit extracted text, snippets, or parser confidence for unsupported HWP5 binary input.

## Next Decision

Production HWP5 support requires a later TUW with an approved parser choice, fixture corpus, fidelity evaluation, and security review for native/binary parsing behavior.
