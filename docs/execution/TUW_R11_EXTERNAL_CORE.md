# PACK-R11-01 External Core TUW Contract

Status: active extension after R9/R10 Gates
Release: R11 External Portal / VDR
Branch: `feat/pack-r11-01-external-core`

Source constraints:

- `docs/package/codex/00_Master_Brief.md` constitution and absolute bans.
- `docs/package/codex/30_Release_Roadmap.md` R11 scope: external users,
  external workspace, secure link, watermark, Q&A, NDA gate, external audit.
- `docs/package/codex/50_Verification_Security_Gates.md` External Sharing
  Critical Gate: expired/revoked link blocking, watermark, external audit 100%,
  DLP external warning, NDA gate, permission and tenant regression.

R11 is the first release where external sharing may exist. This PACK opens only
the core controlled surface: external workspace/user records, secure link token
storage, NDA acceptance, watermark proof, and reference-only external audit. It
does not add external email delivery, outbound notification, public listing,
bulk VDR export, Q&A, or actual file streaming; those remain for PACK-R11-02.

## TUW Inventory

### EXT-USER-TUW-001

- Title: External user registry
- Risk: C
- Objective: Create tenant-scoped external user records using hashed recipient
  identity refs and workspace membership without enabling normal internal app
  login for external users.
- Files create/modify: `db/migrations/0058_create_external_core.sql`,
  `packages/shared/src/external/*`, `apps/api/src/modules/external/*`
- NOT-modify: `docs/package/**`, standard internal auth session semantics.
- Verification: RLS/FORCE RLS SQL, no raw recipient PII in audit, normal
  `/auth/login` still denies `external_user` role.

### EXT-WORKSPACE-TUW-002

- Title: External workspace core
- Risk: C
- Objective: Create controlled matter-scoped external workspaces only when R11
  sharing policy is enabled and the internal actor can manage external sharing
  for the matter.
- Verification: matter edit permission negative test, R5 policy row enforcement,
  `EXTERNAL_WORKSPACE_CHANGED` audit.

### EXT-LINK-TUW-003

- Title: Secure link creation and revocation
- Risk: C
- Objective: Issue opaque secure link tokens once, store only token hashes,
  enforce expiry/revoke status, and block denied documents before link creation.
- Verification: denied document negative test, expired/revoked token negative
  tests, no token raw value in DB/audit.

### EXT-WATERMARK-TUW-004

- Title: Watermark proof manifest
- Risk: H
- Objective: Return an external access manifest only after token, workspace,
  document, legal-hold, and NDA checks pass, and include deterministic
  watermark refs without document body/title/snippet leakage.
- Verification: manifest positive, before-NDA denied, no document body/title in
  response, `EXTERNAL_LINK_ACCESSED` audit.

### EXT-NDA-TUW-005

- Title: NDA gate
- Risk: C
- Objective: Require NDA acceptance before external manifest access and audit
  acceptance with reference-only metadata.
- Verification: NDA required negative test, NDA acceptance positive test,
  audit metadata whitelist coverage.

## Release Boundary

R11-01 MUST NOT create or call:

- external email delivery, SMTP, webhook, or notification APIs.
- public workspace listing without token.
- Q&A flows, external comments, or outbound messages.
- raw document body/title/snippet exposure through external manifest or audit.
- hard delete or disposal execution.
- external AI SDK/model calls.

If any of the above is required to satisfy a TUW, stop and append escalation to
`docs/ledger/execution.md`.

## Gate Evidence Requirements

- External tables have `tenant_id NOT NULL`, RLS enabled, and FORCE RLS enabled.
- Runtime role has no DELETE/TRUNCATE/destructive grants on R11 tables.
- Secure link stores only `token_hash`; raw token is returned once and never
  audited.
- Expired and revoked links are blocked with standard error codes.
- NDA acceptance is mandatory before manifest access.
- Watermark refs are present on manifest responses.
- External audit events are reference-only: IDs, hashes, counts, status enums,
  expiry refs, NDA version, and watermark refs.
- `docs/package/` remains unchanged.
