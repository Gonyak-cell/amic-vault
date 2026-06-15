# Local AI Negative Case Matrix

Date: 2026-06-16

Scope: synthetic security matrix for Gemma4/local AI prep. This matrix binds the checklist requirement for 100 negative cases to existing executable suites and LAI-specific denial paths.

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
| LAI-N-051 | eval | fallbackRate above 0.5 | `eval:local-ai` fails |
| LAI-N-052 | eval | fewer than 5 non-fallback generated outputs | `eval:local-ai` fails |
| LAI-N-053 | eval | fallback warning absent but audit metadata says fallback | fallback counted |
| LAI-N-054 | eval | deidentified eval corpus below 100 cases | `eval:local-ai` fails |
| LAI-N-055 | eval | non-deidentified eval row present | `eval:local-ai` fails |
| LAI-N-056 | eval | rejectedRate above 5% | `eval:local-ai` fails |
| LAI-N-057 | eval | pending prep queue older than threshold | `eval:local-ai` fails |
| LAI-N-058 | eval | document_profile completions below threshold | `eval:local-ai` fails |
| LAI-N-059 | eval | generated-only citation accuracy below 98% | `eval:local-ai` fails |
| LAI-N-060 | eval | p95 prep latency above 30000ms | `eval:local-ai` fails |
| LAI-N-061 | source_ref | completed payload source_ref not in source_chunk_ids | `ai-prep:scan` flags mismatch |
| LAI-N-062 | source_ref | claim source_ref not in top-level source_refs | shared/API/DB reject |
| LAI-N-063 | source_ref | source hash not 64-hex | `ai-prep:scan` flags invalid hash |
| LAI-N-064 | source_ref | source_ref array missing on completed output | `eval:local-ai` schema violation |
| LAI-N-065 | source_ref | section cites unknown chunk ref | shared/API/DB reject |
| LAI-N-066 | rejected | rejected artifact exposes payload on document UI | web/API status tests hide payload |
| LAI-N-067 | rejected | rejected artifact missing bounded failure reason | DB constraint rejects |
| LAI-N-068 | rejected | rejected artifact missing prompt/response hashes | DB constraint rejects |
| LAI-N-069 | rejected | rejected artifact counted as generated output | `eval:local-ai` separates denominator |
| LAI-N-070 | stale | stale completed artifact displayed as ready | web/API status tests hide stale payload |
| LAI-N-071 | stale | stale reason free-form text | shared/API/DB stale reason contract rejects |
| LAI-N-072 | stale | permission change leaves ready prep artifact | permission recorder stale tests mark stale |
| LAI-N-073 | stale | source chunk refresh leaves ready prep artifact | indexing processor stale tests mark stale |
| LAI-N-074 | stale | metadata update leaves ready prep artifact | document service stale tests mark stale |
| LAI-N-075 | reprocess | stale reprocess mutates payload directly | reprocess tool uses processor path only |
| LAI-N-076 | reprocess | rejected reprocess skips audit request | reprocess tool emits `AI_PREP_REQUESTED` |
| LAI-N-077 | reprocess | fallback reprocess touches superseded version | reprocess candidate query uses current version |
| LAI-N-078 | prompt | prep prompt includes risk graph relation | prompt compiler prep filter excludes |
| LAI-N-079 | prompt | prep prompt includes issue graph relation | prompt compiler prep filter excludes |
| LAI-N-080 | prompt | prep prompt includes clause graph relation | prompt compiler prep filter excludes |
| LAI-N-081 | prompt | prep prompt includes contract risk rule | prompt compiler prep filter excludes |
| LAI-N-082 | prompt | prep prompt includes required_clause rule | prompt compiler prep filter excludes |
| LAI-N-083 | prompt | prep prompt uses raw title with email/phone | metadata normalizer redacts |
| LAI-N-084 | retrieval | planner selects unauthorized chunks post-query | planner contract requires query-stage filtering |
| LAI-N-085 | retrieval | planner ignores aiAllowed filter | planner appliedRules include ai_allowed_true |
| LAI-N-086 | retrieval | planner ignores current version filter | planner appliedRules include current_version |
| LAI-N-087 | retrieval | planner exceeds artifact max chunk budget | planner unit tests enforce maxChunks |
| LAI-N-088 | retrieval | planner exceeds token budget | planner unit tests enforce tokenBudget |
| LAI-N-089 | ops | admin metrics expose endpoint URL | ops service tests expose endpoint class only |
| LAI-N-090 | ops | admin metrics expose prompt/source/response | ops service tests use aggregate-only DTO |
| LAI-N-091 | ops | non-admin retry stale/rejected artifacts | admin guard denies |
| LAI-N-092 | feedback | free-form comment accepted | feedback schema/API/DB has bounded reason only |
| LAI-N-093 | feedback | feedback references other tenant artifact | RLS/foreign-key tenant scope denies |
| LAI-N-094 | feedback | missing source ref feedback uses raw excerpt | feedback schema has no excerpt/comment field |
| LAI-N-095 | bench | bench harness calls model while disabled | bench unit test verifies no fetch |
| LAI-N-096 | bench | bench endpoint is public URL | bench endpoint classifier rejects |
| LAI-N-097 | bench | bench output stores raw prompt | bench output hash-only test rejects |
| LAI-N-098 | bench | bench output stores raw response | bench output hash-only test rejects |
| LAI-N-099 | bench | unknown candidate creates product route | bench candidate selector rejects |
| LAI-N-100 | route | non-Gemma candidate added to `aiModelRouteKeys` | model routing tests and catalog decision forbid |

## Residual Notes

- The matrix is synthetic and security-oriented. It is not a customer-data pilot report.
- The committed executable eval fixture is synthetic/deidentified and now meets the LAI-18 100-case technical threshold; it is still not a customer-data pilot report.
- UI screenshot evidence is intentionally replaced with synthetic API/DB evidence and UI unit tests to avoid committing sensitive screenshots.
