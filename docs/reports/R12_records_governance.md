# R12 Records Governance Gate Report

Date: 2026-06-12
Status: TECHNICAL PASS

## Scope

PACK-R12-01 implements the R12 records governance technical gate after the R11
external portal gate.

Implemented scope:

- Tenant-scoped retention policy catalog with indefinite retention as the
  default.
- Legal hold create/release workflow synchronized to R2 matter/document
  `legal_hold` flags.
- Archive workflow that preserves original file objects and document versions.
- Disposal request, approval, execution, and certificate workflow.
- Controlled hard delete executor for approved disposal only.
- Downstream business-reference checks that block disposal instead of silently
  deleting DD, litigation, external, contract, graph, AI, or email references.
- Reference-only records audit events and R12 gate evidence.

R12-01 does not add automatic retention deletion, a scheduler, hard delete
outside the records disposal executor, body/title/filename/snippet audit
metadata, external AI/model calls, OpenSearch, Neo4j, webhook/email delivery, or
notification dependencies.

## Technical Model

| Area | Implementation |
|---|---|
| Retention policies | `retention_policies` with `retention_days = NULL` for indefinite retention |
| Legal holds | `legal_holds` plus synchronized `matters.legal_hold` and `documents.legal_hold` flags |
| Archive | `records_archives` plus document status `archived`; file objects and versions are preserved |
| Disposal workflow | `disposal_requests` states `requested -> approved -> executed` |
| Disposal certificate | `disposal_certificates` stores IDs, hashes, approver, executor, and execution time only |
| Controlled hard delete | `RecordsService.executeDisposalRequest` performs the only physical document/file delete path |
| Original immutability | `file_objects_block_mutation()` permits DELETE only when `app.records_disposal_executor = on` |
| Audit | Records audit actions for policy, hold, archive, disposal, and certificate events |
| Tests | `tests/integration/records-governance.spec.ts` plus legal-hold and lifecycle regressions |

## Permission, Hold, Disposal, and Audit

- Retention policy, hold, archive, disposal, and certificate APIs require an
  authenticated internal user and tenant context.
- Records administrator operations are limited to `firm_admin` and
  `security_admin` roles where approval or execution authority is required.
- Disposal approval denies requester self-approval.
- Legal holds block disposal request and execution.
- Legal hold release clears matter/document flags only when no other active hold
  remains for the same target.
- Archive moves the document to `archived` without mutating original file object
  rows or document version rows.
- Disposal execution requires an approved request, records administrator
  authority, no active hold, and no downstream business references.
- Downstream references in external links, DD, litigation, AI chunks, contract
  intelligence, graph, and email-document links block disposal.
- Disposal certificate rows remain as reference-only proof after controlled
  document/version/file object deletion.
- Records audit metadata uses reference IDs, hashes, counts, enum states,
  retention day values, approver/executor IDs, and no sensitive source text.

## Validation Summary

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS, 152 files / 364 tests |
| `pnpm build` | PASS |
| `docker compose -f infra/docker-compose.dev.yml up -d --wait` | PASS |
| `pnpm db:migrate` | PASS |
| isolated clean DB `db:migrate -> db:rollback -> db:migrate -> db:seed` | PASS on compose project `amic-vault-r12-roundtrip`, port 55444 |
| R12 dirty DB `node tools/db/migrate.mjs down 1 && pnpm db:migrate` | PASS |
| `pnpm db:seed` | PASS, tenants=2 users=11 |
| `pnpm test:integration -- tests/integration/records-governance.spec.ts tests/integration/legal-hold.spec.ts` | PASS, 2 files / 4 tests |
| `pnpm test:integration` | PASS, 79 files / 198 tests |
| worker pytest | PASS, 17 tests, existing Starlette/httpx warning |
| `pnpm backlog:validate` | PASS, 174 TUWs |
| `pnpm docs:frozen` | PASS, 51 files |
| `node tools/db/check-migration-conventions.mjs` | PASS |
| evalset load | PASS, loaded=2 with existing R3 target warning |
| Korean search eval | PASS, precision 100.0%, recall 55.0%, false-positive 0.0% |
| AI gate | PASS, technicalPass=true |
| matter-scoped AI gate | PASS, technicalPass=true with no-citation/no-feedback scope warnings |
| graph consistency | PASS, driftCount=0 |
| contract gate | PASS, technicalPass=true |
| API/web/ingestion docker build smoke | PASS |
| records release-boundary scan | PASS |
| dependency delta scan | PASS, no package or lockfile change |
| `git diff -- docs/package` | PASS, no changes |
| `git diff --check` | PASS |

Dirty DB note: a full `pnpm db:rollback` on the seeded/integration dev database
attempted to roll down all migrations and failed when older append-only audit
constraints encountered durable R11/R12 audit rows. This is the same dirty DB
append-only audit limitation recorded in prior release work. The R12 migration
itself passed `down 1 -> up`, and an isolated clean compose project passed the
full all-history roundtrip `migrate -> rollback -> migrate -> seed`.

## SQL Evidence

```text
disposal_certificates:true:true
disposal_requests:true:true
legal_holds:true:true
records_archives:true:true
retention_policies:true:true
destructive_grants:none
file_objects_executor:true
```

The R12 records tables all have RLS and FORCE RLS enabled. The runtime role has
no DELETE/TRUNCATE grant on records, documents, or file object tables. Physical
file object deletion is guarded by `file_objects_block_mutation()` and requires
the transaction-local `app.records_disposal_executor` flag.

## Records Governance Gate Evidence

`tests/integration/records-governance.spec.ts` verifies:

- Retention policy creation uses reference-only audit metadata.
- Active legal holds set the target legal-hold flag.
- Held documents cannot enter disposal request/execution.
- Legal hold release clears the target flag only after the last active hold is
  released.
- Archive records preserve document versions and file objects.
- Archived documents reject normal metadata and delete mutation paths.
- Disposal execution is denied before approval.
- Disposal approval denies requester self-approval.
- Approved disposal creates `DISPOSAL_EXECUTED` and
  `DISPOSAL_CERTIFICATE_CREATED` audit events.
- Approved disposal removes the simple document/version/file object rows through
  the controlled executor.
- External-link references block disposal.
- R12 records tables have RLS/FORCE RLS and no destructive runtime grants.

Additional regressions verify:

- R2 legal hold integration now recognizes the R12 records tables as present and
  RLS-protected.
- Document lifecycle physical-delete scans permit DELETE only inside
  `apps/api/src/modules/records/records.service.ts` with the
  `app.records_disposal_executor` guard.
- `/records` is protected by the internal auth guard.
- Web records governance UI builds under the internal app shell.

## Release Boundary

Automated implementation scans passed for:

- No automatic retention deletion scheduler.
- No hard delete path outside the records disposal service.
- No new external AI SDK, OpenSearch/Elasticsearch, Neo4j, LangChain, webhook,
  email delivery, or notification dependency.
- No package or lockfile dependency change.
- No `docs/package/` change.
- Records audit metadata remains reference-only.

Remaining blockers: 0.
