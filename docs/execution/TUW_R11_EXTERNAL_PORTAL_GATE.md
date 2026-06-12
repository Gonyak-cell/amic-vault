# PACK-R11-02 External Portal Gate TUW Contract

Status: active extension after PACK-R11-01 merge
Release: R11 External Portal / VDR
Branch: `feat/pack-r11-02-external-portal-gate`

Source constraints:

- `docs/package/codex/00_Master_Brief.md` constitution and absolute bans.
- `docs/package/codex/30_Release_Roadmap.md` R11 scope: external users,
  external workspace, secure link, watermark, Q&A, NDA gate, external audit.
- `docs/package/codex/50_Verification_Security_Gates.md` External Sharing
  Critical Gate: expired/revoked link blocking, watermark, external audit 100%,
  DLP external warning, NDA gate, permission and tenant regression.

PACK-R11-02 closes the R11 technical Gate after PACK-R11-01 opened the controlled
external core. The implementation stays portal-token scoped. It does not add
SMTP, webhook delivery, outbound notifications, public workspace listing,
bulk VDR export, or raw file streaming.

## TUW Inventory

### EXT-DLP-WARN-TUW-001

- Title: External DLP warning enforcement
- Risk: C
- Objective: Run the R5 DLP detector before secure link grant when extracted or
  indexed text is available. If findings exist, block link creation unless an
  explicit bounded override reason is supplied, and audit both blocked and
  accepted warning paths with reference-only metadata.
- Files create/modify: `db/migrations/0059_external_portal_gate.sql`,
  `packages/shared/src/external/*`, `apps/api/src/modules/external/*`,
  `apps/api/src/modules/dlp/*` only by dependency injection.
- NOT-modify: `docs/package/**`, detector rule semantics, external sharing
  policy release boundary.
- Verification: DLP-positive document blocks link grant without override,
  accepted override creates link and records `EXTERNAL_DLP_WARNING_ACCEPTED`,
  audit metadata contains result hash/count but no matched value or text.

### EXT-QA-TUW-001

- Title: Portal Q&A
- Risk: H
- Objective: Add token-scoped external questions and internal matter-owner
  answers bound to workspace, link, external user, matter permission, and NDA
  state.
- Files create/modify: `db/migrations/0059_external_portal_gate.sql`,
  `packages/shared/src/external/*`, `apps/api/src/modules/external/*`,
  `apps/web/src`.
- NOT-modify: `docs/package/**`, internal login semantics for `external_user`.
- Verification: external question requires active token and NDA, internal answer
  requires manage permission on the workspace matter, all messages are audited
  with `EXTERNAL_QA_MESSAGE_RECORDED`.

### EXT-AUDIT-TUW-001

- Title: External audit coverage
- Risk: C
- Objective: Cover R11 external view, download request, link issue, revoke, NDA,
  DLP warning, and Q&A events with append-only reference-only audit evidence.
- Verification: integration test asserts all R11 audit action classes occur,
  audit metadata has no token, document body/title/snippet, raw matched DLP
  value, or Q&A message text.

### EXT-UI-TUW-001

- Title: External portal UI
- Risk: H
- Objective: Provide an isolated `/external/[token]` portal route outside the
  internal `(app)` shell. The route uses only public token APIs and no internal
  session credentials, while internal work surfaces remain session protected.
- Verification: web unit tests prove the route renders without internal nav,
  public API calls avoid credentialed session scope, and auth guard protects
  internal work surfaces while excluding `/external/*`.

### EXT-GATE-REPORT-TUW-001

- Title: External Sharing Critical Gate report
- Risk: C
- Objective: Record R11 Gate evidence for expiry, revoke, watermark, audit, DLP,
  NDA, permission, and tenant regressions.
- Files create/modify: `docs/reports/R11_external_portal_gate.md`,
  `docs/ledger/gates/R11_gate.md`, `docs/ledger/execution.md`,
  `docs/ledger/decision.md`.
- Verification: Gate report references the exact commands, integration suites,
  SQL evidence, and release-boundary scans used to close R11 technical evidence.

## Release Boundary

R11-02 MUST NOT create or call:

- external email delivery, SMTP, webhooks, or notification APIs.
- public workspace listing without a token.
- raw document body/title/snippet exposure in external status, manifest,
  download-ticket, audit, or Gate report.
- raw secure-link token persistence outside the one-time create response.
- hard delete or disposal execution.
- external AI SDK/model calls.

If any of the above is required to satisfy a TUW, stop and append escalation to
`docs/ledger/execution.md`.

## Gate Evidence Requirements

- External DLP warnings block link creation until bounded override acceptance.
- Expired and revoked links remain blocked.
- NDA acceptance is mandatory before manifest, download-ticket, and Q&A access.
- Watermark refs are present on manifest and download-ticket responses.
- Q&A is bound to workspace, link, external user, and internal matter manage
  permission.
- New external tables have `tenant_id NOT NULL`, RLS enabled, and FORCE RLS
  enabled.
- Runtime role has no DELETE/TRUNCATE/destructive grants on R11 external tables.
- External audit events are reference-only: IDs, hashes, counts, status enums,
  expiry refs, NDA version, and watermark refs.
- `docs/package/` remains unchanged.
