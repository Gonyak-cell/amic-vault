# R2 Gate Report - Document Vault

Status: TECHNICAL PASS / human sign-off waived by operator
Date: 2026-06-12
Operator: Codex
Scope: R2 after PACK-R2-08 merge, including Document Vault hash, immutability, access, hold, audit, storage isolation, and log-safety gates
Base main head: `3707607ab40ddb0b5ce3dd3e4378ac7f77d7b37b`
R2 PACK main CI evidence: https://github.com/Gonyak-cell/amic-vault/actions/runs/27381219705

## Waiver

Human Gate sign-off, Claude review, and human merge approval are waived by the active R14 technical completion goal and the 2026-06-12 operator decision in `docs/ledger/decision.md`.

The waiver does not waive technical evidence, security invariants, release order, Gate checklist coverage, or append-only ledger records.

## Runtime Evidence

- PACK-R2-08 was merged to `main` as merge commit `3707607ab40ddb0b5ce3dd3e4378ac7f77d7b37b`.
- Main CI run `27381219705`: pass.
  - `verify`: pass (`pnpm install --frozen-lockfile`, lint, typecheck, unit tests, build, backlog validation, docs-package frozen check, migration convention check).
  - `db-integration`: pass (compose up, migration convention check, migrate, rollback, migrate, seed, audit-immutability, cross-tenant, fail-closed, permission-matrix, full integration).
  - `docker-build`: pass (api, web, ingestion images).
  - `python-worker`: pass (ingestion worker tests).
- Local PACK-R2-08 validation evidence before merge: `pnpm install`, lint, typecheck, test, build, compose up, `db:migrate`, clean isolated `db:migrate && db:rollback && db:migrate`, `db:seed`, `document-audit`, `audit-immutability`, full integration, Python worker pytest, backlog validation, docs frozen check, migration convention check, release-boundary grep, Docker build smoke, and `git diff --check` were green.
- `docker compose -f infra/docker-compose.dev.yml ps`: postgres, minio, minio-init, and ingestion are healthy.

## R0/R1 Gate Regression

Machine status: PASS.

- Main CI `db-integration` reran R0/R1 regression suites in the R2 head:
  - `pnpm test:integration -- audit-immutability`: pass.
  - `pnpm test:integration -- cross-tenant`: pass.
  - `pnpm test:integration -- fail-closed`: pass.
  - `pnpm test:integration -- permission-matrix`: pass.
  - `pnpm test:integration`: pass.
- R2 protected tables have RLS and FORCE RLS enabled:

```text
relname                     relrowsecurity  relforcerowsecurity  policy_count
ai_policies                 t               t                    1
canonical_documents         t               t                    1
document_preview_artifacts  t               t                    1
document_versions           t               t                    1
documents                   t               t                    1
file_objects                t               t                    1
```

## R2-G1. Same File Same Hash / One Byte Different Hash

Machine status: PASS.

- Covered by `tests/integration/document-hash.spec.ts`.
- Same bytes uploaded twice produce the same SHA-256 and duplicate candidate behavior.
- One-byte-different fixture produces a different SHA-256.
- Stored object hash recomputation matches the version hash.
- Hash mismatch injection emits the integrity alert path.
- Main CI full integration and PACK-R2-08 local integration evidence are green.

## R2-G2. Immutable Original

Machine status: PASS.

- Covered by `tests/integration/storage-isolation/document-immutability/immutable-original.spec.ts` and document versioning integration.
- New document versions create new `file_objects`; existing original storage key, bytes, and hash remain immutable.
- Re-put to an existing tenant object key is rejected by the storage adapter.
- API route surface exposes create, metadata edit, soft delete, restore, detail, download, versions, and legal-hold operations only; no original replacement route exists.
- Static hard-delete/original-delete grep found only the negative integration assertion:

```text
tests/integration/storage-isolation/document-immutability/immutable-original.spec.ts:193:
  client.query('DELETE FROM file_objects ...')
```

This is the test that asserts the DB trigger rejects direct deletion. No production app/package/worker path hard-deletes `documents` or `file_objects`.

## R2-G3. Unauthorized Upload, Download, Preview Blocked

Machine status: PASS.

- Covered by `tests/integration/document-access/`.
- Boundary subjects include same-tenant non-member, limited reviewer outside scope, closed/archived/deleted mutation attempts, and cross-tenant attempts.
- Upload, metadata/detail, version list, download, preview, and audit-history denial cases return safe denied responses without foreign IDs/names.
- Preview uses `PermissionService.canReadDocument`; download uses `PermissionService.canDownloadDocument`.
- No document or preview endpoint bypasses `PermissionService`.

## R2-G4. Hold Flag Blocks Deletion

Machine status: PASS.

- Covered by `tests/integration/legal-hold/` and document lifecycle integration.
- `documents.legal_hold=true` blocks soft delete with `DOCUMENT_LOCKED`.
- `matters.legal_hold=true` blocks soft delete for contained documents.
- Blocked delete leaves document status and row state unchanged.
- Hold release permits the soft-delete interface.
- Hard delete remains absent from production paths.

## R2-G5. DOCUMENT_* Audit Coverage

Machine status: PASS.

- Covered by `tests/integration/audit-coverage/document-audit.spec.ts`.
- Required actions are present: `DOCUMENT_UPLOADED`, `DOCUMENT_VIEWED`, `DOCUMENT_DOWNLOADED`, `DOCUMENT_DELETED`, `DOCUMENT_METADATA_CHANGED`.
- Risk-C lifecycle audit also covers `DOCUMENT_RESTORED`.
- New version upload emits `DOCUMENT_VERSION_ADDED`; extraction emits `DOCUMENT_TEXT_EXTRACTED`.
- Current local evidence after full R2 integration:

```text
action                     count
DOCUMENT_DELETED              26
DOCUMENT_DOWNLOADED           17
DOCUMENT_METADATA_CHANGED     16
DOCUMENT_RESTORED             13
DOCUMENT_TEXT_EXTRACTED       11
DOCUMENT_UPLOADED            196
DOCUMENT_VERSION_ADDED       131
DOCUMENT_VIEWED               38
```

## R2-G6. Storage Cross-Tenant Blocked

Machine status: PASS.

- Covered by `tests/integration/storage-isolation/` and document-access cross-tenant cases.
- Storage keys are tenant-prefixed, and signed/download/preview flows cannot be minted or used across tenants through API routes.
- Current storage prefix evidence:

```text
tenant_id                               file_objects  tenant_prefixed
11111111-1111-4111-8111-111111111111            40  t
22222222-2222-4222-8222-222222222222           328  t
```

## R2-G7. File Body Not Logged

Machine status: PASS.

- Marker search in application logs:

```text
docker compose -f infra/docker-compose.dev.yml logs --no-color | rg -n "FIXMARK|AMIC-"
Result: 0 matches
```

- Audit metadata marker SQL:

```text
SELECT count(*) AS fixmark_metadata_hits
FROM audit_events
WHERE metadata_json::text LIKE '%FIXMARK%';

fixmark_metadata_hits = 0
```

- Audit metadata whitelist SQL against `packages/shared/src/audit/audit-metadata-keys.ts`:

```text
SELECT key FROM audit metadata keys outside canonical whitelist;
Result: 0 rows
```

- Fixture marker grep shows markers only in tests/helpers and negative assertions, not in app logs or committed ledger output.
- Document audit builders store reference IDs, hashes, channels, and status refs only. They do not store body, content, snippet, raw text, title, filename, or download reason text.

## Release Boundary Check

Machine status: PASS.

- No external AI SDK/model call implementation was added before R6.
- `packages/ai/` remains a schema/interface placeholder.
- No vector/embedding/pgvector semantic search implementation exists before R6.
- No Neo4j/graph implementation exists before R7.
- No external sharing, VDR, external portal, secure-link, or external-user enablement exists before R11.
- `external_user` references remain deny-only reservation/test coverage before R11.
- No hard-delete production path exists.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12

## Result

R2 Gate technical evidence is passed. R3 work may begin only after this Gate report branch passes PR CI and is merged under the active R14 technical completion goal.
