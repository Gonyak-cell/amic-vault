# R12 Gate - Records Governance

Date: 2026-06-12

Status: TECHNICAL PASS

Gate approver: WAIVED by operator instruction

Scope:

- PACK-R12-01 Records Governance: retention policy catalog, legal hold workflow,
  archive workflow, disposal request/approval/execution, disposal certificate,
  controlled hard delete executor, records UI, and final R12 gate evidence.

## Validation Evidence

Machine status: PASS.

- `pnpm install --frozen-lockfile`: pass.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: pass, 152 files / 364 tests across apps and packages.
- `pnpm build`: pass.
- `docker compose -f infra/docker-compose.dev.yml up -d --wait`: pass.
- `pnpm db:migrate`: pass.
- Isolated clean compose DB roundtrip on project `amic-vault-r12-roundtrip`,
  port 55444: `db:migrate -> db:rollback -> db:migrate -> db:seed` pass.
- Dirty dev DB R12-specific rollback: `node tools/db/migrate.mjs down 1 &&
  pnpm db:migrate` pass.
- `pnpm db:seed`: pass, tenants=2 users=11.
- `pnpm test:integration -- tests/integration/records-governance.spec.ts tests/integration/legal-hold.spec.ts`: pass, 2 files / 4 tests.
- `pnpm test:integration`: pass, 79 files / 198 tests.
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
- API/web/ingestion docker build smoke: pass.
- Records release-boundary scans: pass.
- Dependency delta scan: pass, no package or lockfile change.
- `git diff -- docs/package`: no changes.
- `git diff --check`: pass.

Dirty DB note: one full `pnpm db:rollback` attempt on the seeded/integration dev
database failed because the all-history down path encountered durable
append-only audit rows from later releases. R12-specific `down 1 -> up` passed,
and the isolated clean compose project passed the full all-history roundtrip.

## R12-G1. Retention Policy Baseline

Machine status: PASS.

- `retention_policies` is tenant scoped with RLS and FORCE RLS.
- `retention_days = NULL` represents indefinite retention.
- No retention deletion scheduler or automatic deletion worker was introduced.
- `RETENTION_POLICY_CHANGED` audit stores policy refs, retention day values,
  and status only.

## R12-G2. Legal Hold Blocks Disposal

Machine status: PASS.

- Legal hold creation sets the matter or document legal-hold flag.
- Legal hold release clears the flag only when no other active hold remains.
- Active legal hold blocks disposal requests and disposal execution.
- Hold apply/release audit events use reference-only metadata.

## R12-G3. Archive Preserves Original Records

Machine status: PASS.

- Archive changes document status to `archived` and records a
  `records_archives` row.
- Archive does not mutate or delete file object rows.
- Archive does not mutate or delete document version rows.
- Archived documents reject ordinary metadata mutation and delete paths.

## R12-G4. Disposal Workflow Cannot Be Bypassed

Machine status: PASS.

- Disposal execution fails before approval.
- Requester self-approval is denied.
- Execution requires approved status, records administrator authority, no active
  hold, and no downstream business references.
- External, DD, litigation, contract, graph, AI chunk, and email-document
  references block disposal instead of being silently removed.

## R12-G5. Controlled Hard Delete Executor

Machine status: PASS.

- The only physical document/file delete path is
  `RecordsService.executeDisposalRequest`.
- `file_objects_block_mutation()` permits DELETE only inside a transaction with
  `app.records_disposal_executor = on`.
- `file_objects` UPDATE remains blocked.
- Runtime grants do not expose DELETE/TRUNCATE privileges on R12 records,
  documents, or file object tables.

```text
disposal_certificates:true:true
disposal_requests:true:true
legal_holds:true:true
records_archives:true:true
retention_policies:true:true
destructive_grants:none
file_objects_executor:true
```

## R12-G6. Disposal Certificate and Audit

Machine status: PASS.

- Approved execution creates a certificate row with request, matter, document,
  document hash, certificate hash, approver, executor, and execution time.
- Certificate rows do not store document body, title, filename, snippet, or raw
  extracted text.
- `DISPOSAL_EXECUTED` and `DISPOSAL_CERTIFICATE_CREATED` audit events are
  recorded with reference-only metadata.
- Audit metadata allow-list includes records-specific IDs, hashes, counts,
  retention days, and executor refs only.

## R12-G7. Release Boundary and Sensitive Data Controls

Machine status: PASS.

- No automatic retention deletion scheduler was introduced.
- No hard delete path was introduced outside records disposal.
- No external AI SDK/model call, OpenSearch/Elasticsearch client, Neo4j driver,
  LangChain import, SMTP/webhook sender, or notification dependency was
  introduced.
- No package or lockfile dependency change was introduced.
- `docs/package/` remains unchanged.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12
Remaining blockers: 0

## Result

R12 Records Governance technical evidence is passed. R13 Enterprise Hardening
work may begin after PACK-R12-01 passes PR CI and is merged under the active R14
technical completion goal.
