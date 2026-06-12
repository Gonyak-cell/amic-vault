# R11 External Portal Gate Report

Date: 2026-06-12
Status: TECHNICAL PASS

## Scope

PACK-R11-02 closes the R11 external sharing technical gate after the controlled
external core in PACK-R11-01.

Implemented scope:

- External DLP warning enforcement before secure link grant.
- Bounded DLP override acceptance with reference-only audit.
- Token-scoped download-ticket reference, without raw file streaming.
- Token-scoped external Q&A after NDA acceptance.
- Internal matter-owner answer workflow for external Q&A.
- Isolated `/external/[token]` public portal UI outside the internal app shell.
- R11 release gate report and ledger evidence.

R11-02 does not add SMTP, webhook delivery, outbound notifications, public
workspace listing, bulk VDR export, internal session issuance for external
users, hard delete, or external AI/model calls.

## Technical Model

| Area | Implementation |
|---|---|
| DLP warning | `DlpService` runs before `POST /v1/external/links`; findings block until accepted override reason |
| Secure links | `external_secure_links.dlp_warning_status`, finding count, result hash, and bounded reason code |
| Download ticket | `GET /v1/external/access/:token/download-ticket` returns document/version refs and watermark ref only |
| Q&A | `external_qa_messages` plus public token question APIs and internal workspace answer APIs |
| Portal UI | `apps/web/src/app/(external)/external/[token]` uses public token API client without session credentials |
| Audit | New actions for DLP warning, download request, and Q&A message recording |
| Tests | `tests/integration/external-portal-gate.spec.ts` plus R11-aware DD/litigation regressions |

## Permission, DLP, and Audit

- Secure link creation still requires internal matter edit permissions and
  `DocumentPermissionService.canReadDocument`.
- DLP-positive content blocks link creation before any active link is granted.
- Accepted DLP warning stores status, finding count, result hash, and override
  reason code only. Matched values and source text are not stored in audit.
- Download-ticket and Q&A routes require active token resolution and prior NDA
  acceptance.
- External Q&A is bound to tenant, workspace, link, external user, matter, and
  document/version refs.
- Internal answers require workspace matter manage authority through the
  existing internal permission path.
- Audit metadata for external events remains reference-only: IDs, hashes,
  counts, enum states, expiry refs, NDA version, and watermark refs.
- Q&A message text is stored in `external_qa_messages` for the portal feature,
  bounded to 2000 characters and rejected if it contains password/secret/token
  patterns. Audit metadata stores the message hash and refs, not message text.

## Validation Summary

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS, 151 files / 361 tests |
| `pnpm build` | PASS |
| `docker compose -f infra/docker-compose.dev.yml up -d --wait` | PASS |
| `pnpm db:migrate` | PASS |
| clean DB `pnpm db:rollback` | PASS |
| clean DB `pnpm db:migrate` after rollback | PASS |
| `pnpm db:seed` | PASS |
| `pnpm test:integration -- tests/integration/external-portal-gate.spec.ts` | PASS, 1 file / 3 tests |
| `pnpm test:integration -- tests/integration/external-core.spec.ts tests/integration/external-portal-gate.spec.ts` | PASS, 2 files / 7 tests |
| `pnpm test:integration -- tests/integration/dd-vault.spec.ts tests/integration/litigation-vault.spec.ts` | PASS, 2 files / 6 tests |
| `pnpm test:integration` | PASS, 78 files / 195 tests |
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
| release-boundary implementation scan | PASS |
| external dependency scan | PASS |
| `git diff -- docs/package` | PASS, no changes |
| `git diff --check` | PASS |

Dirty DB note: a rollback attempt after R11-02 integration tests had written new
append-only audit rows failed because the all-migration rollback path replays
older audit action constraints while 0059 action rows exist. A clean database
roundtrip `migrate -> rollback -> migrate -> seed` passed and is the R11-02
rollback evidence for this append-only audit pattern.

## SQL Evidence

```text
external_nda_acceptances:true:true
external_qa_messages:true:true
external_secure_links:true:true
external_users:true:true
external_workspace_members:true:true
external_workspaces:true:true
vault_app_delete_truncate_grants:none
vault_app_table_update_grants:none
vault_app_column_update_grants:external_secure_links(status,revoked_at,revoked_by,access_count,updated_at); external_users(display_ref,status,updated_by,updated_at); external_workspace_members(status,updated_at); external_workspaces(status,expires_at,updated_by,updated_at)
unsafe_external_audit_metadata:0
external_secure_links_dlp_warning_consistency:present
external_qa_messages_message_text_check:bounded_and_secret_pattern_blocked
```

Column scan note:

```text
external_secure_links|token_hash
external_users|email_hash
external_qa_messages|message_hash
external_qa_messages|message_text
```

The scan shows hashed token/email columns only for credentials or recipient
identity. `message_text` is intentional R11 Q&A content, bounded and excluded
from audit metadata.

## External Portal Gate Evidence

`tests/integration/external-portal-gate.spec.ts` verifies:

- DLP-positive secure link creation fails without explicit override acceptance.
- DLP blocked audit metadata does not contain matched DLP text.
- Accepted DLP warning creates a secure link with `dlpWarningStatus=accepted`.
- Download-ticket access requires NDA acceptance and returns only document,
  version, link, workspace, watermark, expiry, and reference fields.
- External Q&A listing and question creation require NDA acceptance.
- Internal answers require matter-owner authority; a non-owner member is denied.
- Q&A audit metadata stores hashes and refs, not token, DLP matched text, or
  message text.
- New Q&A table has tenant RLS and FORCE RLS enabled.
- Runtime role has no DELETE/TRUNCATE grants on R11 external tables.

Web unit coverage verifies:

- `/external/[token]` renders outside the internal navigation shell.
- Public portal API calls omit credentialed session scope.
- Internal work surfaces remain protected by the auth guard while `/external/*`
  remains public-token scoped.

## Release Boundary

Automated implementation scans passed for:

- No SMTP, sendmail, webhook, or notification delivery path.
- No document body/raw text exposure in the R11 external implementation.
- No raw token in audit metadata.
- No runtime DELETE/TRUNCATE path for external tables.
- No new external AI SDK, OpenSearch/Elasticsearch, Neo4j, or LangChain
  dependency import.
- `docs/package/` unchanged.

The broader scan intentionally found two matches in
`docs/execution/TUW_R11_EXTERNAL_PORTAL_GATE.md`, where SMTP/webhook delivery is
listed as prohibited scope.

Remaining blockers: 0.
