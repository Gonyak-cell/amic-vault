# R10 Litigation Vault Case Map Report

Date: 2026-06-12
Status: TECHNICAL PASS

## Scope

PACK-R10-01 implements the internal-only Litigation Vault surface:

- Evidence register
- Fact ledger
- Issue tree
- Pleading tracker
- Permission-scoped case map
- Litigation workbench UI

R10 pleading management is internal case preparation only. It does not create
e-filing submissions, court upload packages, external transmissions, external
users, secure links, VDR delivery, external portals, or watermark delivery.

## Technical Model

| Area | Implementation |
|---|---|
| Evidence | `litigation_evidence_items`, `POST/GET /v1/litigation/evidence`, custody and admitted status refs |
| Facts | `litigation_facts`, `POST/GET /v1/litigation/facts`, optional evidence refs and bounded citation refs |
| Issues | `litigation_issue_nodes`, `POST/GET /v1/litigation/issues`, parent-child matter-local tree |
| Pleadings | `litigation_pleadings`, `POST/GET /v1/litigation/pleadings`, internal filing status/deadline refs only |
| Case map | `GET /v1/litigation/case-map`, permission-scoped evidence/fact/issue/pleading references |
| UI | `/litigation` guarded internal workbench and API wrapper |

## Permission and Audit

- Matter reads require `PermissionService.canReadMatter`.
- Matter writes require `PermissionService.canEditMatter`.
- Document-linked evidence and pleading writes require
  `DocumentPermissionService.canReadDocument`.
- Document-linked list and case-map queries use the existing query-stage search
  permission scope through `SearchFilterBuilder`; denied document rows are not
  fetched into application code and then post-filtered.
- Litigation audit actions are reference-only:
  `LIT_EVIDENCE_CHANGED`, `LIT_FACT_CHANGED`, `LIT_ISSUE_TREE_CHANGED`,
  `LIT_PLEADING_CHANGED`, `LIT_CASE_MAP_VIEWED`.
- Audit metadata stores IDs, counts, enum values, hashes, and bounded filter refs
  only. Fact text, issue labels, pleading names, document body, snippets, and
  document titles are not audit metadata keys.

## Validation Summary

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS, 148 files / 357 tests |
| `pnpm build` | PASS |
| Clean compose + migrate/rollback/migrate/seed | PASS |
| `pnpm test:integration -- tests/integration/litigation-vault.spec.ts` | PASS, 1 file / 3 tests |
| `pnpm test:integration` | PASS, 76 files / 188 tests |
| worker pytest | PASS, 17 tests, existing Starlette/httpx warning |
| `pnpm backlog:validate` | PASS, 174 TUWs |
| `pnpm docs:frozen` | PASS, 51 files |
| migration convention check | PASS |
| evalset load | PASS, loaded=2 with existing R3 target warning |
| Korean search eval | PASS, precision 100.0%, recall 55.0%, false-positive 0.0% |
| AI gate | PASS, technicalPass=true |
| matter-scoped AI gate | PASS, technicalPass=true with no-citation/no-feedback scope warnings |
| graph consistency | PASS, driftCount=0 |
| contract gate | PASS, technicalPass=true |
| `git diff -- docs/package` | PASS, no changes |
| `git diff --check` | PASS |

Dirty dev DB note: a full `pnpm db:rollback` after R10 audit rows existed failed
once when older migration `0056` attempted to re-add an audit action constraint
without the newer R10 litigation actions. This is the known append-only audit row
class; clean DB migrate -> rollback -> migrate -> seed passed and is the Gate
roundtrip evidence.

## RLS and Runtime Grant Evidence

```text
litigation_evidence_items:true:true
litigation_facts:true:true
litigation_issue_nodes:true:true
litigation_pleadings:true:true
runtime_destructive_grants:none
external_or_efile_table_count:0
```

## Case Map Evidence

`tests/integration/litigation-vault.spec.ts` verifies:

- Evidence -> fact -> issue -> pleading creation through HTTP APIs.
- Case map returns authorized reference links at matter scope.
- Case map output does not include document body text, document title, or
  snippet strings.
- Explicitly denied documents are blocked before evidence registration.
- Denied document IDs are absent from case-map output.
- No external, secure-link, portal, VDR, or e-filing tables are created in R10.

## Release Boundary

Automated scans passed for:

- No external AI SDK/model dependency imports in production code.
- No external sharing/secure link/VDR/controller implementation.
- No e-filing or external transmission runtime implementation.
- No litigation runtime `DELETE`, `TRUNCATE`, or hard-delete path.

Remaining blockers: 0.
