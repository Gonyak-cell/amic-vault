# R8 Contract Intelligence Metrics

Date: 2026-06-12

Scope: PACK-R8-01 and PACK-R8-02 technical Contract Intelligence Gate.

Command:

```bash
pnpm eval:contract-gate
```

Technical thresholds:

| Metric | Threshold | Result |
|---|---:|---:|
| Clause extraction fixture accuracy | 100.0% | 100.0% |
| Parser malformed-redline safety | pass | pass |
| Rule output reproducibility | pass | pass |
| Unsupported rule expression handling | pass | pass |

Notes:

- Findings are reference-only: rule id/key/version, clause/document/version ids, hashes, status, and evidence refs.
- Parser safety means malformed redline input produces no redline records and does not mutate source text.
- The committed fixture set is a technical gate baseline, not an operational contract corpus.
