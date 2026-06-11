# R3 OpenSearch Decision Proposal

Status: TECHNICAL RECOMMENDATION ACCEPTED FOR R3 COMPLETION
Date: 2026-06-12
Scope: PACK-R3-03 / SEARCH-KOREAN-EVAL-TUW-002 / ADR-006

## Recommendation

Keep PostgreSQL FTS as the R3 search engine and do not introduce OpenSearch implementation code, infrastructure, dependencies, or runtime services in R3.

OpenSearch remains a candidate for a later release only after the permission-before-search contract is implemented and re-proven on an engine-neutral boundary. Under the active R14 technical-completion goal, the human approval requirement for this decision is waived; the technical controls, release order, Gate checklist, and ledger evidence are not waived.

## Evidence

The Korean tokenization evaluation in `docs/reports/R3_korean_tokenization_eval.md` measured PostgreSQL `simple` FTS over 30 synthetic legal-term cases:

| Metric | Value |
|---|---:|
| Precision | 100.0% |
| Recall | 55.0% |
| False-positive rate | 0.0% |
| False negatives | 27 / 60 expected positives |

The failures are concentrated in Korean whitespace variants, attached suffix forms, and transliteration differences. This is enough evidence that PG FTS is not the final search-quality answer, but not enough evidence to justify widening the R3 security surface before PACK-R3-04 permission filter injection and the R3 Gate.

## Permission-Before-Search Impact

### If PG FTS is retained

PG FTS keeps all R3 search filtering inside PostgreSQL:

- `tenant_id`, matter/client filters, document status, version status, and permission scope are combined in SQL before ranking/snippet generation.
- RLS, audit, migration rollback, and integration suites stay on the existing PostgreSQL boundary.
- The search endpoint remains fail-closed behind the deny-all `SearchPermissionScopeProvider` until PACK-R3-04 replaces it with a real query-time scope provider.

### If OpenSearch is introduced later

OpenSearch can be compatible with Permission-before-search only if the query builder injects all authorization filters into the OpenSearch query before retrieval. Post-filtering results in application code is not acceptable.

Minimum compatibility requirements:

- Every indexed document/version must carry `tenant_id`, `matter_id`, `client_id`, `document_id`, `version_id`, document status, version status, and permission-relevant metadata needed for query-time filtering.
- The search request must build a single boolean query whose filter clauses include tenant scope, allowed matter/version scope, deleted exclusion, default current-version exclusion, ethical-wall denials, and any document confidentiality constraints available at that release.
- Permission evaluation errors, stale permission snapshots, index refresh uncertainty, or missing filter metadata must fail closed with `PERMISSION_DENIED` or zero results, never broad results.
- Snippet/highlight generation must run only on already-filtered hits.
- Audit metadata must stay reference-only: `query_hash`, `query_length`, filter references, result count, and duration; no raw query text or document body.
- R3 security suites must be re-run against the OpenSearch backend: `search-permission`, `metadata-leakage`, `cross-tenant`, audit coverage, deleted/superseded exclusion, and fail-closed injection tests.

## Cost And Operational Impact

| Option | Benefit | Cost / Risk |
|---|---|---|
| Keep PG FTS for R3 | Single datastore, fewer permission surfaces, RLS-aligned validation, no new service cost | Korean recall measured at 55.0%; exact keyword search quality only |
| Add OpenSearch now | Potential path to better Korean analyzers and ranking | New service, new sync lag, duplicated confidential metadata, new query-filter enforcement surface, extra security tests before permission provider is complete |
| Defer OpenSearch | Preserves R3 security order while capturing quality evidence | Requires later migration planning and another search backend validation round |

## Migration Path If Reopened After R3

1. Keep PostgreSQL `document_search_index` as the canonical R3 index and audit source.
2. Complete PACK-R3-04 permission filter injection on the existing PG path.
3. Introduce an engine-neutral backend interface only after R3 Gate evidence shows zero permission leakage on PG.
4. Define an OpenSearch index mapping that includes all permission/status filter fields and excludes sensitive raw bodies from logs.
5. Dual-write or rebuild from canonical PG state in a shadow mode; user-facing search remains PG until shadow parity and leakage tests pass.
6. Run Korean eval, metadata leakage, tenant isolation, deleted/superseded exclusion, fail-closed provider, and audit suites against both backends.
7. Switch only after a later ADR/Gate update records the technical evidence and approval basis.

## Decision

ADR-006 is updated to retain PG FTS for R3 and defer OpenSearch implementation. The R3 Gate should treat OpenSearch as a documented future option, not a blocker for R3 technical completion.
