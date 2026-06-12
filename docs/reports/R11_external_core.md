# R11 External Core Report

Date: 2026-06-12
Status: TECHNICAL PASS

## Scope

PACK-R11-01 opens the first controlled external sharing surface:

- External workspace registry
- External user registry with hashed recipient identity refs
- Secure link creation and revocation
- Token-hash-only link storage
- NDA gate before external manifest access
- Watermark reference proof
- Reference-only external audit events

R11-01 does not add external email delivery, outbound notifications, webhook
delivery, public workspace listing, bulk VDR export, external Q&A, or raw file
streaming. Those remain outside this PACK and are deferred to PACK-R11-02 or
later explicit scope.

## Technical Model

| Area | Implementation |
|---|---|
| Workspaces | `external_workspaces`, `POST /v1/external/workspaces`, matter-scoped and R11 policy-gated |
| Users | `external_users`, `external_workspace_members`, `POST /v1/external/users`, `email_hash` only |
| Secure links | `external_secure_links`, `POST /v1/external/links`, `POST /v1/external/links/:linkId/revoke` |
| Public access | `GET /v1/external/access/:token`, `POST /v1/external/access/:token/nda`, `GET /v1/external/access/:token/manifest` |
| Seed policy | `tools/db/seed.mjs` seeds R11 sharing policies when the R11 migration has opened `enabled_r11` |
| Tests | `tests/integration/external-core.spec.ts` plus R11-aware regressions in DD, litigation, and audit-console suites |

## Permission and Audit

- Internal external-sharing setup requires `PermissionService.canEditMatter`,
  active actor state, and active matter-owner membership.
- Secure link creation requires `DocumentPermissionService.canReadDocument`
  before the link row is created.
- Token resolution fails closed for missing, malformed, revoked, expired,
  suspended, non-member, deleted, or legal-hold-blocked resources.
- Raw link tokens are returned once and never stored. The database stores
  `token_hash` only.
- External public access does not issue normal internal app sessions for
  `external_user`.
- External audit actions are reference-only:
  `EXTERNAL_USER_CHANGED`, `EXTERNAL_WORKSPACE_CHANGED`,
  `EXTERNAL_LINK_CREATED`, `EXTERNAL_LINK_REVOKED`,
  `EXTERNAL_LINK_ACCESSED`, `EXTERNAL_NDA_ACCEPTED`.
- Audit metadata stores IDs, hashes, counts, enum status, expiry refs, NDA
  versions, and watermark refs only. Document body/title/snippet, raw email,
  raw token, and recipient raw address are not metadata fields.

## Validation Summary

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS, 149 files / 359 tests |
| `pnpm build` | PASS |
| Clean compose + migrate/rollback/migrate/seed + R11 targeted integration | PASS |
| `pnpm test:integration -- tests/integration/external-core.spec.ts` | PASS, 1 file / 4 tests |
| R11-aware audit/DD/litigation regression integration | PASS, 3 files / 10 tests |
| `pnpm test:integration` | PASS, 77 files / 192 tests |
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
| API/web/ingestion docker build smoke | PASS |
| release-boundary scans | PASS |
| external dependency scan | PASS |
| `git diff -- docs/package` | PASS, no changes |
| `git diff --check` | PASS |

Local note: the system `python` command is absent and the system `python3` pip is
too old for editable `pyproject.toml` installs. Worker tests were run with the
bundled Python 3.12 runtime used by the Codex workspace dependency bundle.

## SQL Evidence

```text
external_nda_acceptances:true:true
external_secure_links:true:true
external_users:true:true
external_workspace_members:true:true
external_workspaces:true:true
runtime_destructive_grants:none
raw_secret_columns:none
unsafe_external_audit_metadata:0
alpha_policy_external_sharing:enabled_r11:controlled_allow
alpha_policy_external_user_access:enabled_r11:controlled_allow
alpha_policy_secure_link:enabled_r11:controlled_allow
```

## External Core Evidence

`tests/integration/external-core.spec.ts` verifies:

- Workspace, external user, secure link, NDA acceptance, and watermark manifest
  creation through HTTP APIs.
- Manifest access is denied before NDA acceptance and does not leak document ID
  in the denied response body.
- Manifest output includes document/version IDs and a watermark ref, but not
  document body text, document title text, or the raw link token.
- Denied documents are blocked before secure link creation and no created-link
  audit is emitted for the denied document.
- Malformed revoke IDs fail closed without database type errors.
- Revoked and expired links are blocked.
- R11 external tables have tenant RLS and FORCE RLS enabled.
- Runtime role has no DELETE or TRUNCATE grants on R11 external tables.

## Release Boundary

Automated scans passed for:

- No SMTP, sendmail, webhook, or notification delivery path in R11 external core.
- No document body/raw text/snippet/title exposure through external core.
- No raw token in audit metadata.
- No external runtime DELETE/TRUNCATE path.
- No new external AI SDK, OpenSearch/Elasticsearch, Neo4j, or LangChain
  dependency import.
- `docs/package/` unchanged.

R11 release Gate is not closed by this report. PACK-R11-02 remains required for
the remaining External Portal/VDR gate items such as DLP external warning,
portal UX, and final gate evidence.

Remaining blockers: 0.
