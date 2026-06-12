# R11 Gate - External Portal / VDR

Date: 2026-06-12

Status: TECHNICAL PASS

Gate approver: WAIVED by operator instruction

Scope:

- PACK-R11-01 External Core: external workspace/user/link/NDA/watermark
  foundation.
- PACK-R11-02 External Portal Gate: DLP external warning, token-scoped
  download-ticket, Q&A, isolated external portal UI, and final R11 gate
  evidence.

## Validation Evidence

Machine status: PASS.

- `pnpm install --frozen-lockfile`: pass.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: pass, 151 files / 361 tests across apps and packages.
- `pnpm build`: pass.
- `docker compose -f infra/docker-compose.dev.yml up -d --wait`: pass.
- `pnpm db:migrate`: pass.
- `pnpm db:rollback`: pass on clean DB roundtrip.
- `pnpm db:migrate`: pass after rollback.
- `pnpm db:seed`: pass.
- `pnpm test:integration -- tests/integration/external-portal-gate.spec.ts`: pass, 1 file / 3 tests.
- `pnpm test:integration -- tests/integration/external-core.spec.ts tests/integration/external-portal-gate.spec.ts`: pass, 2 files / 7 tests.
- `pnpm test:integration`: pass, 78 files / 195 tests.
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
- External dependency import scan: pass.
- External sharing implementation boundary scan: pass.
- `git diff -- docs/package`: no changes.
- `git diff --check`: pass.

Dirty DB note: one full rollback attempt after R11-02 audit rows existed failed
when the all-migration rollback path encountered older audit action constraints.
Clean DB migrate -> rollback -> migrate -> seed passed and is the Gate
roundtrip evidence for this append-only audit pattern.

## R11-G1. Token and Link Lifecycle

Machine status: PASS.

- Raw link tokens are returned only at secure link creation time and are not
  stored in the database or audit metadata.
- Link access fails closed for malformed, missing, revoked, expired, suspended,
  non-member, deleted, legal-hold-blocked, or NDA-missing resources.
- Revoked and expired links remain covered by `external-core` integration
  regressions.

## R11-G2. NDA Gate

Machine status: PASS.

- External manifest, download-ticket, and Q&A APIs all require accepted NDA
  state.
- Denied pre-NDA responses do not expose document body, title, snippet, or raw
  token details.
- `EXTERNAL_NDA_ACCEPTED` remains reference-only.

## R11-G3. Watermark and Download Reference

Machine status: PASS.

- Manifest and download-ticket responses include watermark refs.
- Download-ticket response contains document/version/link/workspace/external
  user refs and expiry only.
- R11-02 does not stream raw files through the public external route.
- `EXTERNAL_DOWNLOAD_REQUESTED` audit stores refs and watermark ref only.

## R11-G4. External DLP Warning

Machine status: PASS.

- DLP-positive documents block secure link creation unless the internal actor
  explicitly accepts the warning with a bounded reason code.
- `EXTERNAL_DLP_WARNING_BLOCKED` records denied status, finding count, and
  result hash only.
- `EXTERNAL_DLP_WARNING_ACCEPTED` records accepted status, finding count, result
  hash, and reason code only.
- Matched DLP values, canonical text, search-index text, and document body text
  are not audit metadata.

## R11-G5. External Q&A

Machine status: PASS.

- External questions are token-scoped and require active link plus NDA.
- Internal answers require internal workspace matter manage authority.
- Q&A rows are tenant-bound and link/workspace/member-bound.
- Q&A audit action `EXTERNAL_QA_MESSAGE_RECORDED` stores direction, message
  hash, refs, and counts only.

## R11-G6. Tenant Isolation and Runtime Grants

Machine status: PASS.

```text
external_nda_acceptances:true:true
external_qa_messages:true:true
external_secure_links:true:true
external_users:true:true
external_workspace_members:true:true
external_workspaces:true:true
vault_app_delete_truncate_grants:none
vault_app_table_update_grants:none
```

- All R11 external tables have tenant RLS and FORCE RLS enabled.
- Runtime role has no DELETE/TRUNCATE grant on R11 external tables.
- Runtime UPDATE is column-scoped to pre-existing mutable lifecycle/status
  fields only.

## R11-G7. Release Boundary and Sensitive Data Controls

Machine status: PASS.

- No SMTP, sendmail, webhook, or outbound notification implementation was
  introduced.
- No public workspace listing without token was introduced.
- No raw document body/title/snippet exposure was introduced in external
  status, manifest, download-ticket, audit, or portal client code.
- No raw secure-link token persistence was introduced outside the one-time
  create response.
- No hard delete or disposal executor was introduced.
- No external AI SDK/model call, OpenSearch/Elasticsearch client, Neo4j driver,
  or LangChain dependency import was introduced.
- `docs/package/` remains unchanged.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12
Remaining blockers: 0

## Result

R11 External Portal / VDR technical evidence is passed. R12 Records Retention
work may begin after PACK-R11-02 passes PR CI and is merged under the active R14
technical completion goal.
