# R8 Gate — Contract Intelligence

Date: 2026-06-12

Status: TECHNICAL PASS

Gate approver: WAIVED by operator instruction

Scope:

- PACK-R8-01 Contract parsing and playbook foundation.
- PACK-R8-02 Contract rule engine, clause bank, Evidence Pack rule findings, UI, and gate metrics.

## Validation Evidence

Machine status: PASS.

- `pnpm install --frozen-lockfile`: pass.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: pass, 144 files / 347 tests across apps and packages.
- `pnpm build`: pass.
- `docker compose -f infra/docker-compose.dev.yml down -v`: pass.
- `docker compose -f infra/docker-compose.dev.yml up -d --wait`: pass.
- `pnpm db:migrate`: pass.
- `pnpm db:rollback`: pass.
- `pnpm db:migrate`: pass.
- `pnpm db:seed`: pass, tenants=2 users=11.
- `pnpm test:integration -- contract-intel ai-summaries ai-retrieval graph`: pass, 4 files / 17 tests.
- `pnpm test:integration`: pass, 74 files / 182 tests.
- `workers/ingestion/.venv/bin/python -m pytest`: pass, 17 tests. Existing Starlette/httpx deprecation warning only.
- `pnpm backlog:validate`: pass, 174 TUWs.
- `pnpm docs:frozen`: pass, 51 files.
- `node tools/db/check-migration-conventions.mjs`: pass.
- `pnpm evalset:load -- --tenant-id 11111111-1111-4111-8111-111111111111`: pass, loaded=2 with existing R3 target warning.
- `pnpm search:eval:korean`: pass, precision 100.0%, recall 55.0%, false-positive rate 0.0%.
- `pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111 --matter-id 4c2a5696-4e57-44c1-8b8f-1b50e580b6af`: pass, technicalPass=true.
- `pnpm graph:check -- --tenant-id 11111111-1111-4111-8111-111111111111 --matter-id 53f8ad3f-a97b-4096-9333-207ea0ec2c7f`: pass, driftCount=0.
- `pnpm eval:contract-gate`: pass, technicalPass=true.
- `git diff -- docs/package`: no changes.
- `git diff --check`: pass.

## R8-G1. Contract Parser and Playbook Foundation

Machine status: PASS.

- R8 contract tables are tenant-scoped with RLS enabled and FORCE RLS enabled:

```text
contract_classifications:true:true
contract_clause_chunks:true:true
contract_clauses:true:true
contract_defined_terms:true:true
contract_redline_changes:true:true
playbook_rules:true:true
```

- Contract parsing is deterministic and stores derived facts only as IDs, offsets, hashes, counts, parser status, and references.
- `CONTRACT_CLASSIFIED`, `CONTRACT_CLAUSES_EXTRACTED`, `CONTRACT_TERMS_EXTRACTED`, `CONTRACT_REDLINE_PARSED`, and `PLAYBOOK_RULE_CHANGED` audit events are reference-only.
- Playbook rule API stores bounded expression JSON and expression hash; response and audit do not expose raw expression text.

## R8-G2. Clause Bank and Deterministic Rule Findings

Machine status: PASS.

- `GET /v1/contract-intel/clause-bank` injects permission scope before querying contract clause facts.
- `GET /v1/contract-intel/rule-findings` evaluates active playbook rules against authorized clause/term/redline facts only.
- Rule output is deterministic and reference-only: rule id/key/version, status, severity, finding code/hash, clause/document/version IDs, and evidence refs.
- Unsupported or malformed expressions return `unsupported` findings rather than allowing silently.
- `CONTRACT_CLAUSE_BANK_VIEWED` and `CONTRACT_RULE_EVALUATED` audit events include matter/document IDs, query hash, bounded filter refs, counts, and unsupported rule count only.

## R8-G3. Permission-before-AI Rule Findings

Machine status: PASS.

- Evidence Pack `ruleFindings` is active in R8 only after PACK-R8-02 and accepts reference-only rule finding DTOs.
- AI summaries request rule findings only for the matter/document scope that already passed retrieval, permission, ethical wall, and AI policy gates.
- Rule findings do not replace chunk citations. Clause analysis and risk templates still require citations and retain human-review escalation.
- Denied documents fail closed before clause-bank/rule-finding access and do not leak denied document IDs in response bodies.

## R8-G4. Contract Gate Metrics and UI

Machine status: PASS.

`pnpm eval:contract-gate`:

```json
{
  "clauseEvalCaseCount": 1,
  "expectedClauseCount": 2,
  "observedClauseCount": 2,
  "clauseExtractionAccuracy": 1,
  "parserSafetyPass": true,
  "ruleReproducibilityPass": true,
  "unsupportedRulePass": true,
  "ruleFindingStatus": "pass",
  "technicalPass": true
}
```

- Metrics report: `docs/reports/R8_contract_intelligence_metrics.md`.
- Web `/contracts` route exposes process, clause-bank, findings, and playbook-rule controls without document body placeholders.
- `/contracts` is covered by auth guard and middleware route protection.

## R8-G5. Release Boundary and Sensitive Data Controls

Machine status: PASS.

- No external AI SDK/model call implementation was introduced.
- No OpenSearch/Elasticsearch client was introduced.
- No Neo4j driver or external graph service was introduced.
- No external sharing, VDR, external portal, secure link, external user session, or invitation flow was introduced.
- No hard-delete executor was introduced.
- R8 contract APIs and audit paths do not return or store clause body text, term definitions, redline text, prompt text, response text, snippets, titles, passwords, tokens, or raw content.
- `vault_app` has no DELETE, TRUNCATE, or table-wide UPDATE grant on R8 contract tables or `audit_events`.
- `docs/package/` remains unchanged.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12
Remaining blockers: 0

## Result

R8 Contract Intelligence Gate technical evidence is passed. R9/R10 work may begin only after the PACK-R8-02 branch passes PR CI and is merged under the active R14 technical completion goal.
