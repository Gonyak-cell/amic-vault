# Local AI Production Enablement Runbook

Status: RUNTIME CANARY ACTIVE; UPLOAD PREP QUEUE ACTIVE FOR FILE ORGANIZATION CANARY ONLY.

This runbook records the approved 2026-06-16 production Gemma runtime canary
and upload-prep file-organization canary. It is not approval for legal analysis,
tenant expansion, external model routes, or automatic reprocessing of existing
customer documents.

## Entry Criteria

- `docs/ledger/gates/LOCAL_AI_PROD_READY_gate.md` is current and technical
  evidence is PASS.
- `pnpm local-ai:prod-ready` passes.
- `pnpm local-ai:prod-ready` fails if canary evidence drifts back to placeholder
  refs or if upload-prep queue enablement is documented without the canary
  allowlist controls.
- Runtime canary governance approval evidence refs in the Local AI production
  readiness gate are present.
- Live production env audit evidence confirms the current canary boundary:
  - `LOCAL_GEMMA_ENABLED=true`
  - `LOCAL_GEMMA_ENDPOINT=loopback sidecar`
  - `LOCAL_GEMMA_MODEL=gemma4:12b`
  - `AI_PREP_ENABLED=true`
  - `AI_PREP_QUEUE_WORKER_ENABLED=true`
  - `AI_PREP_REQUIRE_TENANT_ALLOWLIST=true`
  - `AI_PREP_CANARY_TENANT_IDS=<one-approved-tenant-ref-outside-repo>`
  - `AI_PREP_TENANT_MAX_CONCURRENCY=1`
  - `AI_SUMMARY_GEMMA_ENABLED=false`
- Alert state and rollback owner evidence refs are current; alert delivery
  remains required before expansion beyond the current canary.
- The deployed API code enforces `AI_PREP_ENABLED` before enqueueing prep jobs
  and re-checks `AI_PREP_CANARY_TENANT_IDS` in both enqueue and worker paths.
- Production pg-boss runtime migration is disabled; schema creation and grants
  were performed only by the migration-role one-off queue prepare task.
- No external model route, API key, SDK, or remote endpoint is introduced.

Current production canary evidence refs:

- `PROD-LAI-CANARY-RUNTIME-2026-06-16`
- `PROD-LAI-PGBOSS-QUEUE-PREP-2026-06-16`
- `PROD-LAI-UPLOAD-PREP-CANARY-ENABLE-2026-06-16`
- `PROD-LAI-UPLOAD-PREP-CANARY-PUBLIC-SMOKE-2026-06-16`

## Enablement Order After Approval

Completed production canary sequence:

1. Record a pre-change env audit evidence ref without secret values.
2. Confirm production backup/snapshot evidence and rollback window.
3. Keep the runtime canary active with `LOCAL_GEMMA_ENABLED=true` on the
   production sidecar task revision.
4. Check `GET /v1/ai/ops/health` as an admin and record only bounded status
   fields.
5. Confirm the canary allowlist patch is deployed and `pnpm local-ai:prod-ready`
   passes on the deployed SHA.
6. Run the queue prepare task with the migration DB secret before enabling the
   worker:
   ```bash
   NODE_ENV=production pnpm ai-prep:prepare-queue -- --runtime-role <runtime-role-ref-outside-repo>
   ```
   Record only bounded output fields: code, schema, queue names, and grant
   status. Do not record database URLs, secret names, task ARNs, account IDs, or
   private endpoints.
7. Enable upload-prep eligibility only with all of these flags present:
   - `PGBOSS_MIGRATE_ENABLED=false`
   - `AI_PREP_ENABLED=true`
   - `AI_PREP_QUEUE_WORKER_ENABLED=true`
   - `AI_PREP_REQUIRE_TENANT_ALLOWLIST=true`
   - `AI_PREP_CANARY_TENANT_IDS=<one-approved-tenant-ref-outside-repo>`
   - `AI_PREP_TENANT_MAX_CONCURRENCY=1`
8. Keep `AI_SUMMARY_GEMMA_ENABLED=false` until upload prep has a separate
   production stability approval.
9. Run canary upload prep on approved canary/synthetic documents only.
10. Run smoke/eval/scan commands and record reference-only evidence refs.
11. Expand tenant/artifact scope only after monitoring remains green and the
    operator records a new expansion approval evidence ref.

## Canary Scope

- One approved tenant or synthetic canary tenant.
- One small upload batch.
- File organization prep artifact kinds only.
- No legal-analysis workflows.
- No automatic reprocessing of all existing customer documents.
- No raw customer document body, prompt, source text, model response, endpoint,
  account ID, ARN, cookie, token, or secret value in repo evidence.

## Monitoring

Watch these bounded signals during canary:

- `/v1/ai/ops/health`: status, route, model name, endpoint class, queue backlog,
  p95 latency, blocked count.
- `/v1/ai/ops/metrics`: completed, blocked, failed, rejected, stale, fallback,
  invalid output, citation rejected, latency counts.
- CloudWatch/API alarms for API errors, worker exits, queue lag, CPU/memory, and
  RDS health.
- `pnpm eval:local-ai` and `pnpm ai-prep:scan` on approved synthetic/canary
  scope.

Do not log or persist raw prompts, source text, model responses, private
endpoints, or secret values.

## Smoke And Validation

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm eval:local-ai -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm ai-prep:scan -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm local-ai:prod-ready
```

Required smoke outcome:

- `externalModelCallAttempts=0`
- raw/legal/source/external/disallowed scan counts are 0
- fallback and rejected rates are within the Local AI gate thresholds
- stale/rejected payloads are not displayed as ready
- admin metrics expose bounded aggregates only

## Rollback

1. Set all production Local AI runtime flags back to false:
   - `LOCAL_GEMMA_ENABLED=false`
   - `AI_PREP_ENABLED=false`
   - `AI_PREP_QUEUE_WORKER_ENABLED=false`
   - `AI_SUMMARY_GEMMA_ENABLED=false`
2. Redeploy/restart affected production tasks or services.
3. Confirm `/v1/ai/ops/health` reports blocked/degraded local route rather than
   serving generation.
4. Stop or drain pending `ai.prep` jobs for the canary scope.
5. Mark canary artifacts stale if source, permission, policy, or runtime
   confidence changed.
6. Run `pnpm ai-prep:scan` and record reference-only rollback evidence.
7. Do not hard-delete artifacts; preserve audit history.

## Emergency Disable

Emergency disable is allowed without waiting for the next rollout window when
there is leakage, unexpected external model traffic, raw output persistence,
permission uncertainty, model endpoint instability, or audit failure.

Immediate action:

```text
LOCAL_GEMMA_ENABLED=false
AI_PREP_ENABLED=false
AI_PREP_QUEUE_WORKER_ENABLED=false
AI_SUMMARY_GEMMA_ENABLED=false
```

After disablement, record an incident evidence ref and run the scan/eval gates.
Do not resume production Local AI until a new governance approval evidence ref is
recorded.
