# R10 Gate — Litigation Vault

Date: 2026-06-12

Status: TECHNICAL PASS

Gate approver: WAIVED by operator instruction

Scope:

- PACK-R10-01 Litigation Vault: evidence register, fact ledger, issue tree,
  internal pleading tracker, permission-scoped case map, and `/litigation` UI.

## Validation Evidence

Machine status: PASS.

- `pnpm install --frozen-lockfile`: pass.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: pass, 148 files / 357 tests across apps and packages.
- `pnpm build`: pass.
- `docker compose -f infra/docker-compose.dev.yml down -v`: pass.
- `docker compose -f infra/docker-compose.dev.yml up -d --wait`: pass.
- `pnpm db:migrate`: pass.
- `pnpm db:rollback`: pass on clean DB roundtrip.
- `pnpm db:migrate`: pass after rollback.
- `pnpm db:seed`: pass, tenants=2 users=11.
- `pnpm test:integration -- tests/integration/litigation-vault.spec.ts`: pass, 1 file / 3 tests.
- `pnpm test:integration`: pass, 76 files / 188 tests.
- `/Users/jws/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m pytest workers/ingestion/tests`: pass, 17 tests. Existing Starlette/httpx deprecation warning only.
- `pnpm backlog:validate`: pass, 174 TUWs.
- `pnpm docs:frozen`: pass, 51 files.
- `node tools/db/check-migration-conventions.mjs`: pass.
- `pnpm evalset:load -- --tenant-id 11111111-1111-4111-8111-111111111111`: pass, loaded=2 with existing R3 target warning.
- `pnpm search:eval:korean`: pass, precision 100.0%, recall 55.0%, false-positive rate 0.0%.
- `pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111`: pass, technicalPass=true.
- `pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111 --matter-id 4c2a5696-4e57-44c1-8b8f-1b50e580b6af`: pass, technicalPass=true with no-citation/no-feedback scope warnings.
- `pnpm graph:check -- --tenant-id 11111111-1111-4111-8111-111111111111 --matter-id 53f8ad3f-a97b-4096-9333-207ea0ec2c7f`: pass, driftCount=0.
- `pnpm eval:contract-gate`: pass, technicalPass=true.
- External dependency import scan: pass.
- External sharing implementation scan: pass.
- E-filing/external transmission implementation scan: pass.
- Litigation destructive runtime scan: pass.
- `git diff -- docs/package`: no changes.
- `git diff --check`: pass.

Dirty DB note: one full rollback attempt after R10 audit rows existed failed
when older migration `0056` re-added an audit constraint without R10 litigation
actions. Clean DB migrate -> rollback -> migrate -> seed passed and is the Gate
roundtrip evidence for this append-only audit pattern.

## R10-G1. Evidence Register

Machine status: PASS.

- `litigation_evidence_items` has `tenant_id NOT NULL`, RLS enabled, and FORCE
  RLS enabled.
- Evidence create/list APIs are matter-permission gated:
  - create requires `canEditMatter`
  - list requires `canReadMatter`
- Document-linked evidence creation requires `DocumentPermissionService.canReadDocument`.
- Evidence audit uses `LIT_EVIDENCE_CHANGED` with matter/evidence/document refs,
  custody/admitted status, and evidence type only.

## R10-G2. Fact Ledger

Machine status: PASS.

- `litigation_facts` has `tenant_id NOT NULL`, RLS enabled, and FORCE RLS
  enabled.
- Fact APIs are matter-permission gated.
- Evidence refs are validated against the same tenant and matter.
- Fact audit uses `LIT_FACT_CHANGED` with fact/evidence counts and matter refs
  only, not fact body text.

## R10-G3. Issue Tree

Machine status: PASS.

- `litigation_issue_nodes` has `tenant_id NOT NULL`, RLS enabled, and FORCE RLS
  enabled.
- Parent issue nodes must belong to the same tenant and matter.
- Issue tree audit uses `LIT_ISSUE_TREE_CHANGED` with node/count/status refs
  only.

## R10-G4. Internal Pleading Tracker

Machine status: PASS.

- `litigation_pleadings` has `tenant_id NOT NULL`, RLS enabled, and FORCE RLS
  enabled.
- Pleading APIs are matter-permission gated.
- Document-linked pleading creation requires
  `DocumentPermissionService.canReadDocument`.
- R10 records internal pleading status and deadlines only. No e-filing,
  external upload, secure link, portal, VDR, or external delivery path exists.

## R10-G5. Permission-Scoped Case Map

Machine status: PASS.

- `GET /v1/litigation/case-map` returns evidence, fact, issue, and pleading refs
  at matter scope.
- Denied document-linked rows are filtered by SQL permission scope before
  application composition.
- Case-map audit `LIT_CASE_MAP_VIEWED` stores query hash, counts, and bounded
  filter refs only.
- Integration test confirms case-map output omits document body text, document
  title text, snippets, and denied document IDs.

## R10-G6. Release Boundary and Sensitive Data Controls

Machine status: PASS.

```text
litigation_evidence_items:true:true
litigation_facts:true:true
litigation_issue_nodes:true:true
litigation_pleadings:true:true
runtime_destructive_grants:none
external_or_efile_table_count:0
```

- No external AI SDK/model call implementation was introduced.
- No OpenSearch/Elasticsearch client was introduced.
- No Neo4j driver or external graph service was introduced.
- No external sharing, VDR, external portal, secure link, external user session,
  invitation, watermark delivery, e-filing, court upload, or outbound filing
  delivery flow was introduced.
- No hard-delete executor was introduced.
- `docs/package/` remains unchanged.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12
Remaining blockers: 0

## Result

R10 Litigation Vault Gate technical evidence is passed. R11 External Core work
may begin after PACK-R10-01 passes PR CI and is merged under the active R14
technical completion goal.
