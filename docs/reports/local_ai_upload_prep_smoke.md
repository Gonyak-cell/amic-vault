# Local AI Upload Prep Smoke Evidence

Date: 2026-06-15

Scope: synthetic/deidentified local-only evidence for Gemma4 upload prep hardening.

## Summary

This report fixes the PACK-LAI evidence gap for 20+ completed post-upload AI prep artifacts. The smoke path used synthetic local documents and the Vault-controlled upload/index/prep pipeline:

1. Upload API created document/version/storage/audit rows.
2. Search indexing prepared child chunks and source hashes.
3. `ai.prep` processed `document_profile` asynchronously through `local_gemma`.
4. Completed artifacts stored bounded file-organization payloads only.
5. Raw prompt/source/model response text was not stored in artifacts or audit metadata.

Screenshots are intentionally not stored here. This repo forbids committing private-data screenshots; the reader-facing UI path is covered by `ai-prep-status-panel` tests, while this report records API/DB evidence with synthetic identifiers only.

## Current Evidence

Command:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm ai-prep:scan -- --tenant-id 11111111-1111-4111-8111-111111111111
```

Result:

| Metric | Value |
|---|---:|
| artifactCount | 25 |
| completedCount | 25 |
| fallbackPayloadWarningCount | 18 |
| fallbackAuditReasonCount | 0 |
| rawPayloadKeyCount | 0 |
| rawAuditMetadataKeyCount | 0 |
| legalClaimCount | 0 |
| missingClaimSourceRefCount | 0 |
| sourceRefMismatchCount | 0 |
| externalModelRouteCount | 0 |
| disallowedArtifactKindCount | 0 |
| technicalPass | true |

`fallbackAuditReasonCount` is 0 for the historical smoke rows because they were produced before PACK-LAI fallback audit hardening. New `AI_PREP_COMPLETED` events now include bounded `generation_result` and `fallback_reason_code` metadata; unit coverage verifies the new write path.

## Sample Manifest

All rows are synthetic/deidentified and store only IDs, counts, status, and warning codes.

| # | artifact_id | document_id | version_id | kind | status | source_refs | claims | fallback |
|---:|---|---|---|---|---|---:|---:|---|
| 1 | bfb0f3fb-3bf6-4a48-a2a2-60057673f71c | c6cdce04-0883-4485-b3c8-b9b87628aacd | 494779ce-17d5-4389-b0b3-3b6b796626c8 | document_profile | completed | 1 | 1 | LOCAL_GEMMA_UNSUPPORTED_CLAIM_FALLBACK |
| 2 | 507c1121-3430-40d7-aa54-9102ff6c5175 | 3f7a8c7a-af2c-45df-bcb2-e44046c702e1 | 8d022fa2-b575-4696-91cd-d2133d79797c | document_profile | completed | 1 | 1 | LOCAL_GEMMA_UNSUPPORTED_CLAIM_FALLBACK |
| 3 | 7da05b7e-9e01-4ac5-8d4a-47ccada08580 | 936773a3-3540-468e-a3c5-b2e63aa2dfe6 | e47ba872-800a-4a9f-a9f8-49aac01c1886 | document_profile | completed | 1 | 1 | LOCAL_GEMMA_INVALID_JSON_FALLBACK |
| 4 | 1902cbda-a09d-4c8d-b3e5-5c75fe82221b | 3dddd2d7-8432-4b5f-8723-c8410ac7c26b | a26d8ddf-e0de-4e56-91f0-397f5f822a88 | document_profile | completed | 1 | 1 | LOCAL_GEMMA_SCHEMA_INVALID_FALLBACK |
| 5 | 1ba2db51-4bbd-4ecc-b2c4-bb82b75ba116 | f3a25385-b8a2-4929-8e24-a5da3543541f | 241a066a-e78d-40aa-915c-14feffc2a7ec | document_profile | completed | 1 | 1 | LOCAL_GEMMA_INVALID_JSON_FALLBACK |
| 6 | 23e03811-fd36-4868-bcf2-2e95b1447e26 | 4c6cf92a-5469-44aa-8a3e-431f39ee13f7 | 7a867f2a-966f-4514-9159-ae6f71d44c17 | document_profile | completed | 1 | 1 | LOCAL_GEMMA_UNSUPPORTED_CLAIM_FALLBACK |
| 7 | d39184ab-d8ed-4aae-afe4-86b8ef88f0f6 | 8ac6ac7f-b520-4775-97f7-3cde29b806d7 | a9a3f06d-c305-4495-8584-438cb72c5386 | document_profile | completed | 1 | 1 | LOCAL_GEMMA_UNSUPPORTED_CLAIM_FALLBACK |
| 8 | b824ecf2-40b8-4965-99d4-388597bafdb6 | 9f4d0c40-10ff-45d8-95ce-1686fffb2400 | a1bc87b7-8cb9-4ad5-9663-9fed84a4e74b | document_profile | completed | 1 | 1 | LOCAL_GEMMA_UNSUPPORTED_CLAIM_FALLBACK |
| 9 | 5f0372aa-e6ce-4bc7-935f-4663d6fd85a4 | 5099518d-74ae-48cb-b0a3-36d6d92e8e1b | cd4c6893-6c15-4823-8509-cb484e52fa79 | document_profile | completed | 1 | 1 | LOCAL_GEMMA_UNSUPPORTED_CLAIM_FALLBACK |
| 10 | 3c45cd82-163c-4765-9176-f9afa50ec4fb | 1f6bee23-8dea-45a6-8a63-8fbc165a1864 | 3c7da356-72aa-491e-95e3-bb9ac6dfe612 | document_profile | completed | 1 | 2 | none |
| 11 | a3df924c-3dce-485a-aef6-1119e0245e1f | 236e45d7-321e-4bca-b075-1c041bbe6089 | 0f6cf860-2850-482d-87e3-3e14e2f149a8 | document_profile | completed | 1 | 1 | LOCAL_GEMMA_UNSUPPORTED_CLAIM_FALLBACK |
| 12 | ec837e78-a5c8-439c-9531-a185cb5b52e2 | ee583e7d-06b7-49f7-8a65-c578ee87776e | 21fdfd53-90e2-4d0d-8c39-b870d9d48a54 | document_profile | completed | 1 | 1 | LOCAL_GEMMA_SCHEMA_INVALID_FALLBACK |
| 13 | cf7c5d62-42c6-4a6e-b57e-ed76ab9357c3 | 1e481167-a793-4c5d-8658-96c696aedbad | 4c36df28-c5bd-4c03-9d81-6ef7f0c8c1bc | document_profile | completed | 1 | 1 | LOCAL_GEMMA_UNSUPPORTED_CLAIM_FALLBACK |
| 14 | 9be789ed-0b93-44e5-9079-adb711761c83 | 5a1ac9e7-402e-4b74-8ad8-e80fcee6e1e0 | 66dedc74-70df-475c-a9a0-e47c8557b61c | document_profile | completed | 1 | 2 | none |
| 15 | 5538ade7-cc12-4b99-bbe7-b3050778c2e6 | c68dbda7-ce1a-46f3-a96a-3e0954fdf3c0 | c50c7f7c-819a-438b-8808-c9a0dad6f7df | document_profile | completed | 1 | 1 | LOCAL_GEMMA_SCHEMA_INVALID_FALLBACK |
| 16 | b9607b3c-354c-4668-b8de-6da1852eecd0 | d40b3372-75c8-40ed-8fc6-252aa9aa5db7 | fb626e0f-b530-4b2b-b54f-4540fead74a7 | document_profile | completed | 1 | 2 | none |
| 17 | 5c2915e4-0ebb-4f11-a9a4-45f284fe8882 | aa97ef1c-e857-470b-8165-78dcfcfa7db5 | c121fdf3-4f8a-4479-b64a-a3285dfb9ac4 | document_profile | completed | 1 | 1 | LOCAL_GEMMA_UNSUPPORTED_CLAIM_FALLBACK |
| 18 | a2888198-c90b-4787-8209-bd9407e4ab12 | 34d28264-dff8-4a8a-8e78-ba698c92c3a1 | f0ac2161-d99d-456b-a746-44aa6f4f07ac | document_profile | completed | 1 | 1 | LOCAL_GEMMA_UNSUPPORTED_CLAIM_FALLBACK |
| 19 | cf3debdd-cfc5-4481-987d-202c8c675e22 | 1736df63-b9a5-4aef-bcfa-c2f72907a6ad | 08200c18-a79c-4390-8b87-80da256fd707 | document_profile | completed | 1 | 2 | none |
| 20 | 7966f8a9-11dc-4054-978e-b7c693ad2f9e | 441e7c79-738f-4915-97c6-830f919ab7d8 | b5e9548e-e317-4f88-a0c4-48d9fa341cfe | document_profile | completed | 1 | 2 | none |

## Verification Commands

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm ai-prep:scan -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm eval:local-ai -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111
```
