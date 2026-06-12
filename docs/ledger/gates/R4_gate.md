# R4 Gate Report - Email Vault v1

Status: TECHNICAL PASS / human sign-off waived by operator
Date: 2026-06-12
Operator: Codex
Scope: R4 after PACK-R4-05 merge, including DLP prerequisite PACK, email ingestion, metadata normalization, attachment-to-document linking, manual matter filing, email timeline, display-only warnings, DLP attachment scan hook, thread summary, upload endpoint, HWP5 binary extraction spike, and R4 search-regression evidence.
Base main head: `3dc892607fbfdb9fa762aaaf6e2878a442b7405e`
R4 main CI evidence: https://github.com/Gonyak-cell/amic-vault/actions/runs/27393788792

## Waiver

Human Gate sign-off, Claude review, and human merge approval are waived by the active R14 technical completion goal and the 2026-06-12 operator decision in `docs/ledger/decision.md`.

The waiver does not waive technical evidence, security invariants, release order, Gate checklist coverage, or append-only ledger records.

## Runtime Evidence

- PACK-DLP-01 and PACK-R4-01 through PACK-R4-05 are merged to `main`.
- Main CI run `27393788792`: pass on head `3dc892607fbfdb9fa762aaaf6e2878a442b7405e`.
  - `verify`: pass (`pnpm install --frozen-lockfile`, lint, typecheck, unit tests, build, backlog validation, docs-package frozen check, migration convention check).
  - `db-integration`: pass (compose up, migration convention check, migrate, rollback, migrate, seed, audit-immutability, cross-tenant, fail-closed, permission-matrix, search-filter, search-permission, metadata-leakage, full integration).
  - `docker-build`: pass (api, web, ingestion images).
  - `python-worker`: pass (ingestion worker tests).
- Local R4 Gate validation on this branch:
  - `pnpm install`: pass.
  - `pnpm lint`: pass.
  - `pnpm typecheck`: pass.
  - `pnpm test`: pass. API 74 files / 184 tests, shared 9 / 30, web 9 / 18, domain 7 / 15, ai pass-with-no-tests.
  - `pnpm build`: pass.
  - `pnpm backlog:validate`: pass, R0-R3 174 TUWs and R4-R14 174 TUWs.
  - `pnpm docs:frozen`: pass, 51 files.
  - `node tools/db/check-migration-conventions.mjs`: pass.
  - `docker compose -f infra/docker-compose.dev.yml up -d`: pass, postgres/minio/ingestion running and minio healthy.
  - Dev DB `pnpm db:migrate`: pass, no migrations to run.
  - Dev DB `pnpm db:seed`: pass, tenants=2 users=11.
  - `pnpm test:integration -- document-access/email-filing.spec.ts`: pass, 2 tests, including R4 search-regression supplement.
  - `pnpm test:integration`: pass, 60 files / 129 tests.
  - `workers/ingestion/.venv/bin/python -m pytest workers/ingestion/tests`: pass, 14 tests, 1 local Starlette deprecation warning.
  - Clean isolated DB project `amic-vault-r4-gate` on Postgres port 55433: `db:migrate -> db:rollback -> db:migrate -> db:seed` pass.
  - Release-boundary grep found only expected guard/test/documentation occurrences; no AI, vector, Neo4j, OpenSearch, external sharing, secure link, send email, hard delete, or audit mutation implementation was introduced.

## R0/R1/R2/R3 Gate Regression

Machine status: PASS.

- Main CI `db-integration` reran R0-R3 regression coverage in the R4 head:
  - `pnpm test:integration -- audit-immutability`: pass.
  - `pnpm test:integration -- cross-tenant`: pass.
  - `pnpm test:integration -- fail-closed`: pass.
  - `pnpm test:integration -- permission-matrix`: pass.
  - `pnpm test:integration -- search-filter`: pass.
  - `pnpm test:integration -- search-permission`: pass.
  - `pnpm test:integration -- metadata-leakage`: pass.
  - Full integration: pass.
- Local full integration after the R4 Gate search-regression supplement also passed, 60 files / 129 tests.

## R4 Prerequisite. Core DLP Rules Before Email

Machine status: PASS.

- PACK-DLP-01 completed `SEC-DLP-SENSDATADE-TUW-001~004` before R4 email implementation.
- `dlp_findings` is tenant scoped, RLS enabled, and FORCE RLS enabled.
- DLP detector fixtures cover synthetic Korean resident ID, bank account, email, and phone patterns.
- DLP storage remains reference-only: `value_hash`, `evidence_hash`, source references, offsets, confidence, and status; no raw sensitive values or snippets are stored.

```text
relname                | relrowsecurity | relforcerowsecurity | policy_count
-----------------------+----------------+---------------------+-------------
dlp_findings           | t              | t                   | 1
```

## R4-G1. Attachment Split to Document Link Integrity

Machine status: PASS.

- Covered by `tests/integration/document-access/email-filing.spec.ts`, `tests/integration/cross-tenant/email-messages-rls.spec.ts`, and `tests/integration/storage-isolation/email-raw-storage.spec.ts`.
- Email attachments are parsed as bounded attachment metadata, passed through `DocumentUploadService.uploadBuffer(...)` with `sourceSystem='email_ingest'`, and linked through `email_document_links`.
- Attachment bytes are not stored in email tables or audit metadata; they flow through tenant-prefixed object storage and the R2 document version/hash path.
- Local SQL after full integration:

```text
email_document_links | hash_matches
---------------------+-------------
19                   | 19
```

## R4-G2. Unauthorized Email, Attachment, and Timeline Access Blocked

Machine status: PASS.

- Filing requires `canUploadToMatter`; non-member filing returns 403 and records `ACCESS_DENIED`.
- Email timeline reads are matter-permission filtered; wall-excluded users receive an empty timeline.
- Email document link lookup calls document permission checks before returning linked attachment documents.
- Email tables are tenant scoped with RLS and FORCE RLS:

```text
relname                | relrowsecurity | relforcerowsecurity | policy_count
-----------------------+----------------+---------------------+-------------
email_document_links   | t              | t                   | 1
email_matter_filings   | t              | t                   | 1
email_messages         | t              | t                   | 1
email_participants     | t              | t                   | 1
```

## R4-G3. Filing and Read Audit Coverage

Machine status: PASS.

- Covered by `tests/integration/audit-coverage/email-audit.spec.ts`, `tests/integration/audit-coverage/dlp-audit.spec.ts`, and full integration.
- R4 email/DLP audit actions observed after full integration:

```text
action                  | count
------------------------+------
DLP_FINDING_RECORDED    | 23
DLP_SCAN_COMPLETED      | 11
EMAIL_DUPLICATE_BLOCKED | 6
EMAIL_FILED             | 18
EMAIL_IMPORTED          | 13
EMAIL_METADATA_UPDATED  | 13
```

- Unsafe audit metadata keys for R4 email/DLP actions:

```text
unsafe_audit_metadata
---------------------
0
```

## R4-G4. Message-ID Duplicate Blocked

Machine status: PASS.

- Same-tenant normalized Message-ID hashes are unique in `email_messages`.
- Duplicate import path records `EMAIL_DUPLICATE_BLOCKED` with message-id hash and existing email reference only.
- Cross-tenant duplicate Message-ID hashes are allowed separately by tenant-scoped unique constraints and RLS.
- Covered by API email unit tests, `tests/integration/cross-tenant/email-messages-rls.spec.ts`, `tests/integration/audit-coverage/email-audit.spec.ts`, and full integration.

## R4-G5. Attachment DLP Scan Result Recorded

Machine status: PASS.

- Attachment import invokes DLP before document upload/link creation.
- DLP failure blocks upload/link/filing continuation fail-closed.
- Findings and audits store source IDs, hashes, offsets, rule IDs, and matter/document references only.
- Covered by `apps/api/src/modules/email/email.service.spec.ts`, `tests/integration/document-access/email-filing.spec.ts`, `tests/integration/audit-coverage/dlp-audit.spec.ts`, and full integration.

## R4-G6. Raw Email Original Immutable

Machine status: PASS.

- Raw email bytes are stored through immutable `file_objects` and tenant-prefixed object storage.
- `email_messages` stores `raw_file_object_id`, `raw_sha256`, `raw_size_bytes`, parser status, and bounded metadata only.
- No raw header block, body, raw address, raw Message-ID, or attachment bytes are stored in email tables.
- Local SQL after full integration:

```text
raw_email_messages | tenant_prefixed_raw | raw_hash_matches
-------------------+---------------------+-----------------
30                 | 30                  | 30
```

## R4-G7. Filed Email and Attachment Search Regression

Machine status: PASS.

- R4 does not index raw email bodies. This is intentional and preserves Permission-before-search and sensitive-data boundaries.
- Uploaded email attachments become ordinary document-pipeline documents; once indexed, `/v1/search` uses the existing R3 query-time permission scope.
- `tests/integration/document-access/email-filing.spec.ts` now includes a Gate regression that:
  - uploads an email with an attachment to a matter,
  - indexes the attachment document with a synthetic unique token,
  - verifies the matter owner can find that attachment through `/v1/search`,
  - adds the member to the matter and then excludes the member with an ethical wall,
  - verifies the wall-excluded member receives `total=0` and `results=[]` for the same search token.
- Existing R3 search suites remain green: `search-filter`, `search-permission`, and `metadata-leakage`.

## R4-G8. HWP5 Binary Extraction Boundary

Machine status: PASS.

- `docs/reports/R4_hwp5_binary_extraction_spike.md` records the R4 boundary.
- Legacy binary `.hwp` OLE input returns `UNSUPPORTED_HWP_BINARY`; no production HWP5 parser support is claimed.
- Worker tests verify no extracted text/snippet/confidence is emitted for unsupported HWP5 binary input.

## Security Boundary Check

Machine status: PASS.

- No external sharing, secure link, external portal, external user, send email, SMTP, AI implementation, external AI SDK/model call, vector/semantic search, pgvector, Neo4j/GraphSync, OpenSearch/Elasticsearch client, or hard-delete executor exists in R4.
- Outside recipient and privilege indicators are display-only warnings/suggestions; they do not send, share, auto-file, or auto-tag without confirmation.
- Search remains permission-before-search and query-time filtered; no post-filtering substitute was added.
- Audit metadata remains reference-only and denies unsafe keys.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12
Remaining blockers: 0

## Result

R4 Email Vault v1 Gate technical evidence is passed. R5 Security & Governance PACKs may begin only after this Gate report branch passes PR CI and is merged under the active R14 technical completion goal.
