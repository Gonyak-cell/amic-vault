# R3 Korean Tokenization Evaluation

Status: COMPLETE
Date: 2026-06-12
Scope: PACK-R3-03 / SEARCH-KOREAN-EVAL-TUW-001

## Method

The evaluation uses PostgreSQL 16 full-text search with the R3 production query primitive:

```sql
to_tsvector('simple', body_text) @@ websearch_to_tsquery('simple', query)
```

The fixture is `tests/fixtures/search/korean-legal-terms.json`. It contains 30 synthetic legal-term cases, 60 expected-positive snippets, and 30 expected-negative snippets. No real client data, external API, AI model, embedding library, morphological analyzer, or OpenSearch dependency is used.

## Reproducibility

Command:

```bash
pnpm search:eval:korean
```

Two consecutive runs on 2026-06-12 produced identical metrics. Node emitted the existing `MODULE_TYPELESS_PACKAGE_JSON` warning because the script is loaded as TypeScript/ESM directly; the warning does not change the deterministic output and no package-level `"type": "module"` change was made for this PACK.

## Metrics

| Metric | Value |
|---|---:|
| Cases | 30 |
| Evaluated snippets | 90 |
| True positives | 33 |
| False positives | 0 |
| False negatives | 27 |
| True negatives | 30 |
| Precision | 100.0% |
| Recall | 55.0% |
| False-positive rate | 0.0% |

Raw output:

```json
{
  "cases": 30,
  "documents": 90,
  "truePositive": 33,
  "falsePositive": 0,
  "falseNegative": 27,
  "trueNegative": 30,
  "precision": 1,
  "recall": 0.55,
  "falsePositiveRate": 0,
  "precisionPercent": "100.0%",
  "recallPercent": "55.0%",
  "falsePositiveRatePercent": "0.0%"
}
```

## Failure Pattern Classification

The `simple` configuration behaves like exact token matching over whitespace/punctuation boundaries. That is conservative and produced no false positives in this fixture, but it missed common Korean legal variants.

| Pattern | False negatives | Examples |
|---|---:|---|
| Compound legal terms split by spaces | 25 | `계약해지` missed `계약 해지`, `손해배상` missed `손해 배상`, `표명보장` missed `표명 및 보장` |
| Compound term attached to a document suffix | 1 | `임대차` missed `임대차계약서` |
| Romanized / Korean transliteration mismatch | 1 | `M&A 계약` missed `엠앤에이 계약 종결` |
| False-positive near misses | 0 | Near terms such as `매수청구권` for `매도청구권` and `임대주` for `대주` did not match |

## Conclusion

PostgreSQL FTS with `simple` is acceptable for R3 exact keyword search only when permission filtering, tenant isolation, status filtering, and auditability are the dominant release concerns. The measured recall of 55.0% is not sufficient to treat PG FTS as a final Korean legal search-quality solution.

The R3 technical recommendation is to keep PG FTS as the shipped R3 engine, complete permission-before-search on the PG query path, and defer any OpenSearch implementation until a later release can re-prove permission filter injection, tenant isolation, audit coverage, index synchronization, and metadata leakage controls on the new engine.
