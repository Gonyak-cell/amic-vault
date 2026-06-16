# Gemma4 Hardening L2 Evidence Adapter

Date: 2026-06-16
Status: PACK-LAI-15 implementation evidence
Branch: `feat/pack-lai-15-evidencepack-v2-adapter`
Base: stacked on `feat/pack-lai-14-prep-schema-decision`

## Decision

Evidence Pack v1 remains the retrieval/prompt context shape. Upload prep now
uses a versioned v2 prep adapter before any Gemma prep generation or rejected
payload creation.

The adapter shape is `evidence_pack.v2.prep_adapter` and is compatible with
`evidence_pack.v1`.

## Contract

The v2 prep adapter includes only reference-safe fields:

- `pack_id`
- `tenant_id`
- `matter_id`
- `model_route`
- `applied_rules`
- `source_refs`
- `source_ref_map`

`source_ref_map` contains citation refs, document/version/matter/chunk IDs,
chunk ordinals, and text/source hashes. It does not include `redactedText`,
source body, snippets, prompt text, model response, or document content.

## Fail-Closed Rules

The adapter rejects:

- missing or empty source refs;
- duplicate source refs;
- citation refs that do not match retrieved chunk refs;
- source refs that do not equal `chunk:<chunk_id>`;
- Evidence Packs without `retrieval.hybrid:query_stage_scope`;
- non-`local_gemma` model routes.

`AiPrepProcessor` blocks before Gemma generation with bounded reason code
`AI_PREP_EVIDENCE_SOURCE_REF_MISMATCH` when the adapter contract fails.

## Scan Gate

`pnpm ai-prep:scan` now reports:

- `sourceRefChunkMismatchCount`
- `sourceHashInvalidCount`

The scan fails unless both are zero. This verifies persisted completed/rejected
prep artifacts still map payload `source_refs` back to stored
`source_chunk_ids` and bounded source hashes.

## Current Evidence

Latest local scan after PACK-LAI-15 changes:

- `sourceRefChunkMismatchCount`: 0
- `sourceHashInvalidCount`: 0
- `rawPayloadKeyCount`: 0
- `rawAuditMetadataKeyCount`: 0
- `legalClaimCount`: 0
- `externalModelRouteCount`: 0
- `technicalPass`: true

This report is not production authorization. Production Gemma runtime enablement
remains a separate PACK-LAI-20 governance decision.
