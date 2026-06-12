# R6 AI Gate Metrics Report

Date: 2026-06-12
Scope: PACK-R6-10 technical MVP metric harness on tenant `11111111-1111-4111-8111-111111111111`
Command: `pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111`

## Result

Status: TECHNICAL PASS

| Metric | Value | Target | Status |
|---|---:|---:|---|
| Approved subset only | 2 / 2 deidentified cases | 100% | PASS |
| Permission accuracy | 100.0% | 100.0% | PASS |
| Citation accuracy | 100.0% | >=98.0% | PASS |
| Hallucination rate | 0.0% | <=1.0% | PASS |
| Retrieval recall proxy | 100.0% | >=95.0% | PASS |
| AI audit coverage | 100.0% | 100.0% | PASS |
| External model call attempts | 0 | 0 | PASS |

## Raw Metric Snapshot

```json
{
  "evaluationCaseCount": 2,
  "deidentifiedEvaluationCaseCount": 2,
  "totalCitations": 5,
  "matchedCitations": 5,
  "permissionLeakageViolations": 0,
  "retrievalIncludedCount": 6,
  "retrievalExcludedCount": 0,
  "feedbackCount": 2,
  "hallucinationFeedbackCount": 0,
  "totalSessions": 7,
  "sessionsWithQueryAudit": 7,
  "sessionsWithResponseAudit": 7,
  "externalModelCallAttempts": 0,
  "technicalPass": true
}
```

## Notes

- The committed evaluation fixture remains a deidentified technical MVP subset with 2 cases. The harness emits the expected warning that the future operational target is ~1,000 approved cases.
- The warning is not treated as a technical blocker for this PACK because R6-10 implements the metric harness, approved-subset check, permission leakage check, feedback store, and Gate report path. No real data is committed.
- Retrieval recall is computed on allowed retrieval candidates only; permission/wall/ai-policy exclusions are leakage defenses and are not counted as recall misses.
- Feedback metrics store structured ratings, correction codes, error codes, and edit distance only. Prompt text, response text, source text, snippets, and comments are absent.
