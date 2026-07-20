# H8 Retention Scheduler Manual QA Receipt - 2026-07-04

TUW: H8 [M] Retention policy matter binding plus disposal-review scheduler.

Fixture marker: `H8UI-20260703-1924`

Local runtime:

- API: `API_PORT=3001 PROCESS_ROLE=api node apps/api/dist/main.js`
- Web: `pnpm --filter @amic-vault/web start`
- Browser: Playwright against system Chrome.

Manual flow observed:

- Login as `alpha-security-admin@test.local`.
- `/records`: create retention policy `RET-H8UI-20260703-1924` with `retentionDays=1`.
- Bind the policy to matter `2fc07e9c-b993-425e-98c7-18cd7ec0ccac` and set `closed_at=2026-01-01`.
- Run `RetentionSchedulerService.scheduleExpiredRetentionReviews({ asOf: 2026-01-03, tenantIds:[alpha] })`.
- Verify pending disposal review row for document `580bb38a-d01b-4187-bcd1-4339bdc317df`.
- Open the exact row with title `Records Document H8UI-20260703-1924-REVIEW`.
- Complete the existing approval/execution flow and open the certificate tab.

Screenshots:

- `tmp/h8-ui-policy-H8UI-20260703-1924.png`
- `tmp/h8-ui-pending-H8UI-20260703-1924.png`
- `tmp/h8-ui-selected-H8UI-20260703-1924.png`
- `tmp/h8-ui-certificate-H8UI-20260703-1924.png`

Scheduler result:

```json
{
  "tenantCount": 1,
  "reviewedTenantCount": 1,
  "scheduledCount": 1
}
```

Final DB verification:

```json
{
  "disposal_request_id": "d1fab9ef-ef59-4ec7-b46f-f8ee2676761b",
  "status": "executed",
  "reason_code": "RETENTION_EXPIRED",
  "certificate_id": "1de76101-37f1-4588-8c61-d869b34867d5",
  "completed_work_items": 2,
  "scheduled_audits": 1,
  "executed_audits": 1
}
```

Notes:

- First browser attempt clicked a non-fixture review row; this was rejected as evidence after DB verification. The final selected/certificate screenshots and DB verification above are for the exact H8 fixture row.
- The scheduler-created row uses current schema semantics `status=requested`, `reason_code=RETENTION_EXPIRED`, and `reviewSource=retention_scheduler`; the source plan's `pending_review` wording maps to this review-pending state.
