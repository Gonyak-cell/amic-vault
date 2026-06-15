# Local AI Operations Runbook

Status: PACK-LAI-05 local-only operations baseline.

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
AI_PREP_QUEUE_WORKER_ENABLED=true \
LOCAL_GEMMA_ENABLED=true \
LOCAL_GEMMA_MODEL=gemma4:12b \
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm --filter @amic-vault/api build
```

Operational flags:

- `AI_PREP_QUEUE_WORKER_ENABLED`: enables `ai.prep` worker polling.
- `AI_PREP_ARTIFACT_KINDS`: comma-separated artifact kinds; defaults to document profile, key fields, keyword tags, and filing suggestions.
- `AI_PREP_TENANT_MAX_CONCURRENCY`: per-tenant prep concurrency ceiling.
- `LOCAL_GEMMA_ENABLED`: local generation route gate.
- `LOCAL_GEMMA_MODEL`: model tag; default `gemma4:12b`.
- `LOCAL_GEMMA_TIMEOUT_MS`: generation timeout.

## Health And Metrics

Admin-only endpoints:

- `GET /v1/ai/ops/health`
- `GET /v1/ai/ops/metrics`

The response exposes model route, model tag, endpoint class, queue backlog, blocked counts, and latency aggregates. It never returns endpoint URLs, prompts, source text, model responses, API keys, tokens, or private host details.

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

Gate expectations:

- Evaluation cases are deidentified.
- Permission/raw-payload leakage count is zero.
- Citation refs match persisted source chunk refs.
- Unsupported claim rate stays within gate threshold.
- Latency remains within local operating target.
