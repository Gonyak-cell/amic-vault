# LOCAL AI Production Readiness Gate

Status: TECHNICAL_READY PASS; GOVERNANCE_APPROVAL BLOCKED; PRODUCTION_ENABLEMENT BLOCKED.

This gate separates technical readiness from authority to enable Local Gemma in
production. It does not turn on production flags and it does not approve any
external model route.

## Scope

- Runtime route: `local_gemma` only.
- Default local model: `gemma4:12b`.
- Product scope: post-upload file organization prep only.
- Explicitly excluded: legal analysis, external AI APIs, remote model routes,
  raw prompt/source/model-response storage, and automatic production flag
  enablement.

## Required Technical Evidence

| Requirement                                                  | Required evidence                                                                                                           | Current LAI-20 result                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Lint/typecheck/unit/build green                              | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`                                                                    | PASS                                                                                                     |
| Full integration green                                       | `pnpm test:integration`                                                                                                     | PASS; 85 files / 212 tests                                                                               |
| DB migration roundtrip current                               | `pnpm db:migrate`, targeted down/up for latest migration, `pnpm db:seed`                                                    | PASS; `0071` down/up verified                                                                            |
| Local AI eval green                                          | `pnpm eval:local-ai -- --tenant-id 11111111-1111-4111-8111-111111111111`                                                    | PASS; caseCount 102, fallbackRate 4.0%, rejectedRate 0.0%, pendingPrepCount 0                            |
| Existing AI gate green                                       | `pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111`                                                     | PASS; externalModelCallAttempts 0                                                                        |
| Storage/audit scan green                                     | `pnpm ai-prep:scan -- --tenant-id 11111111-1111-4111-8111-111111111111`                                                     | PASS; raw/legal/source/external/disallowed counts 0                                                      |
| Bench harness safe                                           | disabled bench and explicit live Gemma smoke with `--case-limit 2`                                                          | PASS; disabled mode made no model calls over 102-case fixture, live Gemma smoke completed 2/2            |
| Product surface safe                                         | stale/rejected payloads not displayed as ready; no legal-analysis product copy                                              | PASS                                                                                                     |
| Admin ops safe                                               | rejected/fallback/stale aggregate counts admin-only; no endpoint URL, prompt, source, response, secret, or raw text exposed | PASS                                                                                                     |
| Production flags still false in recorded production evidence | repo/deploy evidence must show disabled defaults                                                                            | PASS for recorded production patch evidence; live production env re-audit required before any enablement |

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

Technical readiness is not authorization. These evidence refs are required
before any production Local Gemma runtime flag can be turned on:

| Evidence ref                                  | Required owner            | Status                                              |
| --------------------------------------------- | ------------------------- | --------------------------------------------------- |
| `APPROVAL-LAI-PROD-OPERATOR-YYYY-MM-DD`       | Operator                  | REQUIRED                                            |
| `APPROVAL-LAI-PROD-SECURITY-YYYY-MM-DD`       | Security                  | REQUIRED                                            |
| `APPROVAL-LAI-PROD-LEGAL-DATA-YYYY-MM-DD`     | Legal/data owner          | REQUIRED                                            |
| `APPROVAL-LAI-PROD-CUSTOMER-SCOPE-YYYY-MM-DD` | Customer/data scope owner | REQUIRED                                            |
| `PROD-LAI-ENV-AUDIT-YYYY-MM-DD`               | Ops/security              | REQUIRED; records flag states as evidence refs only |
| `PROD-LAI-ALERT-DELIVERY-YYYY-MM-DD`          | Ops                       | REQUIRED                                            |
| `PROD-LAI-ROLLBACK-OWNER-YYYY-MM-DD`          | Operator/Ops              | REQUIRED                                            |

The literal `YYYY-MM-DD` placeholders are allowed only while
`GOVERNANCE_APPROVAL` and `PRODUCTION_ENABLEMENT` are BLOCKED. They must be
replaced by concrete evidence refs before either status can change.

No approval may be inferred from passing tests, local evals, PR review, or a
previous production release approval.

## Production Flag Boundary

Flags must remain false until every governance approval evidence ref is present:

```text
LOCAL_GEMMA_ENABLED=false
AI_PREP_ENABLED=false
AI_PREP_QUEUE_WORKER_ENABLED=false
AI_SUMMARY_GEMMA_ENABLED=false
```

The enablement plan may discuss setting these flags after approval, but repo
evidence must not claim they are enabled until an operator records the approval
refs and live production env audit refs.

## Closeout

- Independent review receipt: required for Risk=C closeout and PR merge
  consideration.
- Codex must not self-merge this pack.
- PR must carry `needs-human-review`.
