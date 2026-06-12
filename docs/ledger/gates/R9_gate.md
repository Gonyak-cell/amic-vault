# R9 Gate — DD Vault

Date: 2026-06-12

Status: TECHNICAL PASS

Gate approver: WAIVED by operator instruction

Scope:

- PACK-R9-01 DD Vault: RFI, internal data room mapping, DD issue register,
  risk register, traceability endpoint, and `/dd` UI.

## Validation Evidence

Machine status: PASS.

- `pnpm install --frozen-lockfile`: pass.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: pass, 146 files / 352 tests across apps and packages.
- `pnpm build`: pass.
- `docker compose -f infra/docker-compose.dev.yml down -v`: pass.
- `docker compose -f infra/docker-compose.dev.yml up -d --wait`: pass.
- `pnpm db:migrate`: pass.
- `pnpm db:rollback`: pass on clean DB roundtrip.
- `pnpm db:migrate`: pass after rollback.
- `pnpm db:seed`: pass, tenants=2 users=11.
- `pnpm test:integration -- tests/integration/dd-vault.spec.ts`: pass, 1 file / 3 tests.
- `pnpm test:integration`: pass, 75 files / 185 tests.
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
- DD destructive runtime scan: pass.
- `git diff -- docs/package`: no changes.
- `git diff --check`: pass.

Dirty DB note: one full rollback attempt after DD audit rows existed failed
when older migration `0055` re-added an audit constraint without R9 DD actions.
Clean DB migrate -> rollback -> migrate -> seed passed and is the Gate
roundtrip evidence for this append-only audit pattern.

## R9-G1. RFI Management

Machine status: PASS.

- `dd_rfis` has `tenant_id NOT NULL`, RLS enabled, and FORCE RLS enabled.
- RFI APIs are matter-permission gated:
  - create/update require `canEditMatter`
  - list requires `canReadMatter`
- RFI audit uses `DD_RFI_CHANGED` with matter/rfi IDs, status, priority, and
  diff keys only.

## R9-G2. Internal Data Room Mapping

Machine status: PASS.

- `dd_data_room_mappings` has `tenant_id NOT NULL`, RLS enabled, and FORCE RLS
  enabled.
- Mapping a document requires matter edit permission and
  `DocumentPermissionService.canReadDocument` before insert.
- Mapping list and trace queries use query-stage document permission scope.
- Mapping stores internal labels and section paths only. It does not issue
  secure links, create external users, or expose VDR sharing.

## R9-G3. Issue and Risk Register

Machine status: PASS.

- `dd_issues` and `dd_risks` have `tenant_id NOT NULL`, RLS enabled, and FORCE
  RLS enabled.
- Issue/risk APIs are matter-permission gated.
- Document-linked issues recheck document read permission before insert.
- Citation refs are bounded reference IDs and reject raw/body/snippet-like refs.

## R9-G4. Traceability

Machine status: PASS.

- `GET /v1/dd/traceability` returns RFI, mapping, issue, and risk refs at matter
  scope.
- Denied document-linked rows are filtered by SQL permission scope before
  application composition.
- Traceability audit `DD_TRACE_VIEWED` stores query hash, counts, and bounded
  filter refs only.
- Integration test confirms trace output omits document body text and denied
  document IDs.

## R9-G5. Release Boundary and Sensitive Data Controls

Machine status: PASS.

```text
dd_data_room_mappings:true:true
dd_issues:true:true
dd_rfis:true:true
dd_risks:true:true
runtime_destructive_grants:none
external_table_count:0
```

- No external AI SDK/model call implementation was introduced.
- No OpenSearch/Elasticsearch client was introduced.
- No Neo4j driver or external graph service was introduced.
- No external sharing, VDR, external portal, secure link, external user session,
  invitation, watermark delivery, or external Q&A flow was introduced.
- No hard-delete executor was introduced.
- `docs/package/` remains unchanged.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12
Remaining blockers: 0

## Result

R9 DD Vault Gate technical evidence is passed. R10 Litigation Vault work may
begin after PACK-R9-01 passes PR CI and is merged under the active R14 technical
completion goal.
