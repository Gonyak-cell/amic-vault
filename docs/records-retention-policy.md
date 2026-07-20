# Records Retention Policy

AMIC Vault binds retention at the Matter level by default. A document may carry a narrow override when the Matter-level policy is not the correct legal basis for that document.

## Policy Catalog

| Policy code          | Use                                                  | Retention days |
| -------------------- | ---------------------------------------------------- | -------------: |
| `CLIENT_RECORDS`     | 일반 고객 사건 기록, 계약 검토, 자문 산출물          |           2555 |
| `LITIGATION_RECORDS` | 소송, 중재, 조사 사건 기록                           |           3650 |
| `INDEFINITE_HOLD`    | 보존기간을 정하지 않는 기록 또는 별도 hold 중인 기록 |           NULL |

`retention_days = NULL` means indefinite retention. It never creates an automatic disposal review.

## Scheduler Behavior

The retention review scheduler creates review requests only. It does not delete documents.

Eligible documents are those where the Matter is closed or archived, the effective retention policy has a finite `retention_days`, and `closed_at + retention_days` is in the past. Active Matter or document legal holds exclude the document.

When a document becomes eligible, the scheduler creates a `disposal_requests` row in the existing review state, opens the records disposal approval work item, and records `RETENTION_REVIEW_SCHEDULED` audit metadata with reference IDs only.

Actual disposal still requires the existing records approval and execution chain.
