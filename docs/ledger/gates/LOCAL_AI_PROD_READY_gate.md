# LOCAL AI Production Readiness Gate

Status: TECHNICAL_READY PASS; GOVERNANCE_APPROVAL APPROVED_FOR_RUNTIME_CANARY; PRODUCTION_ENABLEMENT RUNTIME_CANARY_ACTIVE; UPLOAD_PREP_ENABLEMENT ACTIVE_CANARY_FILE_ORG_PREP.

This gate separates technical readiness from authority to enable Local Gemma in
production. The runtime canary approval below authorizes a local Gemma sidecar
and upload-prep worker only for file-organization prep readiness checks in the
approved canary scope. It does not approve legal analysis, external model
routes, raw prompt/source/model-response storage, or unscoped upload-prep queue
execution.

## Scope

- Runtime route: `local_gemma` only.
- Default local model: `gemma4:12b`.
- Product scope: post-upload file organization prep only.
- Explicitly excluded: legal analysis, external AI APIs, remote model routes,
  raw prompt/source/model-response storage, automatic reprocessing of existing
  customer documents, and expansion beyond the approved canary scope.

## Required Technical Evidence

| Requirement                                | Required evidence                                                                                                           | Current LAI-20 result                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Lint/typecheck/unit/build green            | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`                                                                    | PASS                                                                                                     |
| Full integration green                     | `pnpm test:integration`                                                                                                     | PASS; 85 files / 212 tests                                                                               |
| DB migration roundtrip current             | `pnpm db:migrate`, targeted down/up for latest migration, `pnpm db:seed`                                                    | PASS; `0071` down/up verified                                                                            |
| Local AI eval green                        | `pnpm eval:local-ai -- --tenant-id 11111111-1111-4111-8111-111111111111`                                                    | PASS; caseCount 102, fallbackRate 4.0%, rejectedRate 0.0%, pendingPrepCount 0                            |
| Existing AI gate green                     | `pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111`                                                     | PASS; externalModelCallAttempts 0                                                                        |
| Storage/audit scan green                   | `pnpm ai-prep:scan -- --tenant-id 11111111-1111-4111-8111-111111111111`                                                     | PASS; raw/legal/source/external/disallowed counts 0                                                      |
| Bench harness safe                         | disabled bench and explicit live Gemma smoke with `--case-limit 2`                                                          | PASS; disabled mode made no model calls over 102-case fixture, live Gemma smoke completed 2/2            |
| Product surface safe                       | stale/rejected payloads not displayed as ready; no legal-analysis product copy                                              | PASS                                                                                                     |
| Admin ops safe                             | rejected/fallback/stale aggregate counts admin-only; no endpoint URL, prompt, source, response, secret, or raw text exposed | PASS                                                                                                     |
| Production flags scoped by canary evidence | repo/deploy evidence must show runtime canary state, pg-boss queue prep evidence, worker audit, and canary allowlist controls | PASS for runtime and upload-prep file-organization canary evidence; expansion remains blocked |

Canonical command set:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm lint
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm typecheck
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm test
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm build
docker compose -f infra/docker-compose.dev.yml up -d --wait
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm db:migrate
PATH=/opt/homebrew/opt/node@22/bin:$PATH node tools/db/migrate.mjs down 1
PATH=/opt/homebrew/opt/node@22/bin:$PATH node tools/db/migrate.mjs up
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm db:seed
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm test:integration
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm eval:local-ai -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm ai-prep:scan -- --tenant-id 11111111-1111-4111-8111-111111111111
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm bench:local-models -- --models gemma4-12b-baseline,qwen3-8b,qwen3-5-9b
AI_BENCH_HARNESS_ENABLED=true PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm bench:local-models -- --models gemma4-12b-baseline --case-limit 2
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm local-ai:prod-ready
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm docs:frozen
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm backlog:validate
git diff --check
```

## Governance Approval Evidence

Technical readiness is not authorization. These evidence refs are required for
the 2026-06-16 runtime and upload-prep file-organization canary. The canary
tenant allowlist patch is deployed, pg-boss queue preparation is complete, and
the worker task is active only inside the approved canary boundary:

| Evidence ref                                  | Required owner            | Status                                               |
| --------------------------------------------- | ------------------------- | ---------------------------------------------------- |
| `APPROVAL-LAI-PROD-OPERATOR-2026-06-16`       | Operator                  | APPROVED for runtime canary                          |
| `APPROVAL-LAI-PROD-SECURITY-2026-06-16`       | Security                  | APPROVED for runtime canary                          |
| `APPROVAL-LAI-PROD-LEGAL-DATA-2026-06-16`     | Legal/data owner          | APPROVED for file-organization prep only             |
| `APPROVAL-LAI-PROD-CUSTOMER-SCOPE-2026-06-16` | Customer/data scope owner | APPROVED for synthetic or one approved canary tenant |
| `PROD-LAI-ENV-AUDIT-2026-06-16`               | Ops/security              | PASS; records runtime canary flags as refs only      |
| `PROD-LAI-ALERT-STATE-2026-06-16`             | Ops                       | PASS; production alarms OK during runtime canary     |
| `PROD-LAI-ALERT-DELIVERY-PENDING`             | Ops                       | REQUIRED before expanding beyond current canary      |
| `PROD-LAI-ROLLBACK-OWNER-2026-06-16`          | Operator/Ops              | APPROVED; rollback owner `jws`                       |
| `PROD-LAI-CANARY-ALLOWLIST-PATCH-2026-06-16`  | Codex/Ops                 | PASS; deployed before upload-prep queue true         |
| `PROD-LAI-PGBOSS-QUEUE-PREP-2026-06-16`       | Codex/Ops                 | PASS; queue and runtime grants prepared              |
| `PROD-LAI-UPLOAD-PREP-CANARY-ENABLE-2026-06-16` | Codex/Ops               | PASS; worker enabled for approved canary scope       |
| `PROD-LAI-UPLOAD-PREP-CANARY-PUBLIC-SMOKE-2026-06-16` | Codex/Ops       | PASS; public smoke pass=8 fail=0 skip=7              |

No date placeholder is allowed after runtime canary activation.

No approval may be inferred from passing tests, local evals, PR review, or a
previous production release approval.

## Production Flag Boundary

Current production upload-prep canary state:

```text
LOCAL_GEMMA_ENABLED=true
LOCAL_GEMMA_ENDPOINT=loopback sidecar
LOCAL_GEMMA_MODEL=gemma4:12b
AI_PREP_ENABLED=true
AI_PREP_QUEUE_WORKER_ENABLED=true
AI_PREP_REQUIRE_TENANT_ALLOWLIST=true
AI_PREP_CANARY_TENANT_IDS=<one-approved-tenant-ref-outside-repo>
AI_PREP_TENANT_MAX_CONCURRENCY=1
AI_SUMMARY_GEMMA_ENABLED=false
PGBOSS_MIGRATE_ENABLED=false
PGBOSS_CREATE_SCHEMA_ENABLED=false
```

Expansion beyond the current canary remains blocked unless a new evidence ref
and owner approval explicitly authorizes the expansion. The required expansion
boundary remains:

```text
PGBOSS_MIGRATE_ENABLED=false
AI_PREP_ENABLED=true
AI_PREP_QUEUE_WORKER_ENABLED=true
AI_PREP_REQUIRE_TENANT_ALLOWLIST=true
AI_PREP_CANARY_TENANT_IDS=<one-approved-tenant-ref-outside-repo>
AI_PREP_TENANT_MAX_CONCURRENCY=1
AI_SUMMARY_GEMMA_ENABLED=false
```

Repository evidence must not include concrete tenant ids, private endpoints,
account identifiers, ARNs, cookies, tokens, secrets, prompts, source text, model
responses, or customer document content.

## Closeout

- Independent review receipt: required for Risk=C closeout and PR merge
  consideration.
- Codex must not self-merge this pack.
- PR must carry `needs-human-review`.
