# Local AI Negative Case Matrix

Date: 2026-06-15

Scope: synthetic security matrix for Gemma4/local AI prep. This matrix binds the checklist requirement for 50 negative cases to existing executable suites and LAI-specific denial paths.

## Gate

Expected result for every case: no unauthorized document enters Gemma context, no completed artifact is exposed to an unauthorized actor, and no external model route is used.

Primary commands:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm test:integration -- permission-matrix ai-policy ai-model-routing search-permission document-access ethical-wall
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm ai-prep:scan -- --tenant-id 11111111-1111-4111-8111-111111111111
```

Latest observed gate values:

| Metric | Value |
|---|---:|
| permissionLeakageViolations | 0 |
| externalModelCallAttempts | 0 |
| rawPayloadKeyCount | 0 |
| rawAuditMetadataKeyCount | 0 |
| externalModelRouteCount | 0 |

## Case Matrix

| ID | Category | Scenario | Expected guard |
|---|---|---|---|
| LAI-N-001 | tenant | wrong tenant document id in prep payload | scoped source query returns no chunks |
| LAI-N-002 | tenant | wrong tenant version id in prep payload | target lookup fails |
| LAI-N-003 | tenant | cross-tenant artifact status read | display-time document permission denies |
| LAI-N-004 | tenant | cross-tenant matter readiness read | admin tenant scope denies |
| LAI-N-005 | tenant | cross-tenant retry request | admin tenant scope denies |
| LAI-N-006 | membership | non-member upload target | `canUploadToMatter` denies before upload |
| LAI-N-007 | membership | non-member document read | `canReadDocument` denies artifact UI |
| LAI-N-008 | membership | member removed before prep worker runs | search scope excludes source |
| LAI-N-009 | membership | viewer without edit tries retry | admin guard denies |
| LAI-N-010 | membership | inactive actor owns version | scope/policy blocks prep |
| LAI-N-011 | wall | ethical wall member tries search | query-stage wall filter excludes chunks |
| LAI-N-012 | wall | ethical wall member tries artifact read | display-time permission denies |
| LAI-N-013 | wall | ethical wall applied after upload before prep | worker scoped source returns no chunks |
| LAI-N-014 | wall | ethical wall applied before retry | retry emits no unauthorized completed artifact |
| LAI-N-015 | wall | bidirectional wall search leakage | search wall suite denies |
| LAI-N-016 | ai_policy | `ai_allowed=false` document | repository joins only `ai_allowed=true` |
| LAI-N-017 | ai_policy | AI policy DENY | `AI_PREP_POLICY_BLOCKED` artifact |
| LAI-N-018 | ai_policy | missing policy interpretation | fail-closed block |
| LAI-N-019 | ai_policy | external model route proposal | `externalModelCallAttempts=0` |
| LAI-N-020 | ai_policy | non-local generation route | route denied; no generation endpoint path |
| LAI-N-021 | source | no child chunks | `AI_PREP_NO_SOURCE_CHUNKS` |
| LAI-N-022 | source | stale chunks only | scoped source returns no chunks |
| LAI-N-023 | source | current version mismatch | target lookup fails |
| LAI-N-024 | source | archived document mutation path | document-access suite blocks mutation |
| LAI-N-025 | source | deleted/superseded version | current-version join excludes |
| LAI-N-026 | schema | `risk` claim kind | shared/API/DB reject or fallback |
| LAI-N-027 | schema | `issue` claim kind | shared/API/DB reject or fallback |
| LAI-N-028 | schema | `clause` claim kind | shared/API/DB reject or fallback |
| LAI-N-029 | schema | legal conclusion marker true | shared/API/DB reject or fallback |
| LAI-N-030 | schema | claim source refs empty | shared/API/DB reject |
| LAI-N-031 | schema | section source refs empty | shared/API/DB reject |
| LAI-N-032 | schema | claim source ref not top-level | shared/API/DB reject |
| LAI-N-033 | schema | source ref format not chunk ref | DB check rejects completed row |
| LAI-N-034 | schema | artifact kind outside eight allowed kinds | DB/check scanner flags |
| LAI-N-035 | raw | top-level `prompt` in payload | shared schema rejects |
| LAI-N-036 | raw | top-level `response` in payload | shared schema rejects |
| LAI-N-037 | raw | top-level `raw` in payload | shared schema rejects |
| LAI-N-038 | raw | audit metadata `prompt` key | audit safe-key scan flags |
| LAI-N-039 | raw | audit metadata `response` key | audit safe-key scan flags |
| LAI-N-040 | raw | audit metadata `body/content/text` key | audit safe-key scan flags |
| LAI-N-041 | fallback | invalid JSON from Gemma | raw model output discarded; fallback stored |
| LAI-N-042 | fallback | unsupported claim from Gemma | raw model output discarded; fallback stored |
| LAI-N-043 | fallback | schema-invalid Gemma output | raw model output discarded; fallback stored |
| LAI-N-044 | fallback | fallback audit metadata | `generation_result=fallback`, bounded reason code |
| LAI-N-045 | ops | non-admin health read | admin guard denies |
| LAI-N-046 | ops | non-admin metrics read | admin guard denies |
| LAI-N-047 | ops | endpoint value exposure | endpoint class only |
| LAI-N-048 | eval | zero completed output | `eval:local-ai` fails |
| LAI-N-049 | eval | prep schema violation count positive | `eval:local-ai` fails |
| LAI-N-050 | eval | raw/leakage count positive | `eval:local-ai` fails |

## Residual Notes

- The matrix is synthetic and security-oriented. It is not a customer-data pilot report.
- The current executable eval set remains a technical MVP subset, not the future 1000-case operational corpus.
- UI screenshot evidence is intentionally replaced with synthetic API/DB evidence and UI unit tests to avoid committing sensitive screenshots.
