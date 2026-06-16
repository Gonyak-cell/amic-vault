# Local AI Operations Runbook

Status: production runtime canary active. Upload-prep queue execution remains
disabled until pg-boss queue preparation succeeds and the worker task is
audited.

## Runtime

- Runtime route: `local_gemma`
- Default model tag: `gemma4:12b`
- Local endpoint class only: loopback or private-network hosts accepted by `LocalGemmaGateway`
- External model calls remain blocked by policy and route schema.

## Start/Check

```bash
ollama serve
ollama pull gemma4:12b
curl -s http://127.0.0.1:11434/api/tags
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm --filter @amic-vault/ai test
```

## Queue Worker

```bash
AI_PREP_ENABLED=true \
AI_PREP_QUEUE_WORKER_ENABLED=true \
AI_PREP_REQUIRE_TENANT_ALLOWLIST=true \
AI_PREP_CANARY_TENANT_IDS=<one-approved-tenant-ref-outside-repo> \
PGBOSS_MIGRATE_ENABLED=false \
LOCAL_GEMMA_ENABLED=true \
LOCAL_GEMMA_MODEL=gemma4:12b \
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm --filter @amic-vault/api build
```

Operational flags:

- `AI_PREP_ENABLED`: enables upload-prep enqueue eligibility. When false,
  enqueue records bounded `AI_PREP_BLOCKED` audit and returns no jobs.
- `AI_PREP_QUEUE_WORKER_ENABLED`: enables `ai.prep` worker polling.
- `AI_PREP_REQUIRE_TENANT_ALLOWLIST`: fails closed when no canary tenant
  allowlist is present.
- `AI_PREP_CANARY_TENANT_IDS`: comma-separated canary tenant ids. Values stay
  outside repo evidence.
- `AI_PREP_ARTIFACT_KINDS`: comma-separated artifact kinds; defaults to document profile, key fields, keyword tags, and filing suggestions.
- `AI_PREP_TENANT_MAX_CONCURRENCY`: per-tenant prep concurrency ceiling.
- `PGBOSS_MIGRATE_ENABLED`: must be false in production runtime tasks; queue
  schema preparation runs through `pnpm ai-prep:prepare-queue` as a migration
  role one-off task.
- `LOCAL_GEMMA_ENABLED`: local generation route gate.
- `LOCAL_GEMMA_MODEL`: model tag; default `gemma4:12b`.
- `LOCAL_GEMMA_TIMEOUT_MS`: generation timeout.

Production canary boundary:

- `LOCAL_GEMMA_ENABLED=true` is approved only for the 2026-06-16 runtime
  canary.
- `AI_PREP_ENABLED=false` and `AI_PREP_QUEUE_WORKER_ENABLED=false` until
  pg-boss queue preparation is complete and audited.
- `AI_PREP_REQUIRE_TENANT_ALLOWLIST=true` and exactly one approved canary tenant
  ref are required before upload-prep queue execution.
- `AI_SUMMARY_GEMMA_ENABLED=false`; legal analysis remains out of scope.
- External model routes remain disallowed; do not add remote model endpoints or
  API keys as a workaround.

## Health And Metrics

Admin-only endpoints:

- `GET /v1/ai/ops/health`
- `GET /v1/ai/ops/metrics`

The response exposes model route, model tag, endpoint class, queue backlog, blocked counts, and latency aggregates. It never returns endpoint URLs, prompts, source text, model responses, API keys, tokens, or private host details.

Admin metrics must keep rejected, stale, and fallback prep counts separate:

- `prepRejectedCount`: local model output was discarded and raw output was not
  stored.
- `prepStaleCount`: stored file-organization artifacts need rebuild after
  source, permission, policy, or metadata changes.
- `prepFallbackCount`: bounded deterministic fallback artifacts were produced
  instead of a validated local model output.

Non-admin users must not see aggregate ops state.

## Product Status Surface

User-facing prep surfaces describe file organization only:

- Prepared: completed, non-stale file organization card.
- Preparing: queued or pending prep work.
- Stale: card is hidden and requires rebuild.
- Blocked: policy or permission guard blocked prep.
- Failed: retry is required.
- Discarded: invalid local output was rejected; no generated card is shown.
- Fallback: bounded deterministic fallback card, tracked separately from a
  validated model output.

Do not describe these cards as legal analysis, issue spotting, merits review, or
advice.

## Degradation

- Runtime unavailable: health status `blocked`, prep upload/indexing continues without blocking document ingestion.
- Invalid model output: artifact is `rejected`; raw response is not persisted.
- Stale artifacts: status APIs hide stored payloads, record bounded `AI_PREP_STALE` reasons, and rebuild only through `ai.prep` singleton jobs.
- Permission/policy uncertainty: fail closed as `PERMISSION_DENIED` or `AI_POLICY_BLOCKED`.

## Evaluation

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm evalset:load -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm eval:local-ai -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111
```

## Reprocess Prep Artifacts

When `eval:local-ai` reports a high fallback rate, or ops show stale/rejected prep artifacts after permission, policy, metadata, version, or source-chunk changes, reprocess artifacts through the same local-only `AiPrepProcessor` path. The tool logs bounded `AI_PREP_REQUESTED` audit records and processor completion logs `AI_PREP_COMPLETED` or `AI_PREP_REJECTED`; it does not update payloads directly and does not store prompts, source text, or raw model responses.

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm ai-prep:reprocess-fallbacks -- --tenant-id 11111111-1111-4111-8111-111111111111 --dry-run
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm ai-prep:reprocess-fallbacks -- --tenant-id 11111111-1111-4111-8111-111111111111 --limit 25
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm ai-prep:reprocess-fallbacks -- --tenant-id 11111111-1111-4111-8111-111111111111 --include all --dry-run
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm ai-prep:reprocess-fallbacks -- --tenant-id 11111111-1111-4111-8111-111111111111 --include stale,rejected,fallback --limit 25
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm eval:local-ai -- --tenant-id 11111111-1111-4111-8111-111111111111
```

## Structured Feedback

Feedback is recorded only with bounded reason codes and audited reference
metadata:

- `useful`
- `incorrect_profile`
- `incorrect_fields`
- `incorrect_tags`
- `incorrect_filing_suggestion`
- `missing_citation`
- `missing_source_ref`
- `stale_artifact`
- `rejected_output`
- `permission_concern`
- `other_structured`

Do not add a free-form comment column, document excerpt, prompt, source text, or
model response to feedback records.

Gate expectations:

- Evaluation cases are deidentified.
- Permission/raw-payload leakage count is zero.
- Citation refs match persisted source chunk refs.
- Unsupported claim rate stays within gate threshold.
- Latency remains within local operating target.
