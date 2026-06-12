# PACK-R13-01 Enterprise Hardening TUW Contract

Status: active extension after R12 Gate technical pass
Release: R13 Enterprise Hardening
Branch: `feat/pack-r13-01-enterprise-hardening`

Source constraints:

- `docs/package/codex/00_Master_Brief.md` constitution and absolute bans.
- `docs/package/codex/30_Release_Roadmap.md` R13 scope: SSO/SAML, BYOK,
  SIEM, backup/DR, compliance readiness.
- `docs/package/codex/50_Verification_Security_Gates.md` common verification
  semantics and gate evidence rules.

PACK-R13-01 implements enterprise readiness surfaces without adding external
IdP, SIEM, KMS, cloud backup, or compliance API calls. Raw SAML metadata,
assertions, endpoint URLs, key material, secrets, and compliance evidence body
are outside this technical completion scope and must not be stored.

## TUW Inventory

### ENT-SSO-SAML-TUW-001

- Title: SSO/SAML provider reference schema and API
- Risk: C
- Objective: Add tenant-scoped SAML provider reference records using only
  hashes, fingerprints, and bounded IDs.
- Verification: provider tables have tenant RLS/FORCE RLS; API stores no raw
  URL, raw metadata XML, assertion XML, certificate body, token, or password.

### ENT-SSO-SAML-TUW-002

- Title: SSO metadata and enforcement readiness
- Risk: H
- Objective: Expose SP metadata readiness and active provider state for internal
  enterprise administrators.
- Verification: metadata view is protected, audited, and returns SP entity/ACS
  references only; no session issuance or external IdP call is introduced.

### ENT-BYOK-KEYREF-TUW-001

- Title: BYOK key reference registry
- Risk: C
- Objective: Add tenant-scoped BYOK key references with provider, ref hash,
  fingerprint, verification timestamp, and rotation due date only.
- Verification: key material, key URI, secret handle, and plaintext KMS endpoint
  are not accepted or stored; BYOK audit is reference-only.

### ENT-SIEM-EXPORT-TUW-001

- Title: SIEM export manifest
- Risk: H
- Objective: Record audit export batches with sink type, endpoint hash, audit
  sequence range, event count, and manifest hash.
- Verification: no outbound delivery, webhook call, syslog socket, endpoint URL,
  or token is implemented; audit metadata stores hash/count/range only.

### ENT-BACKUP-DR-TUW-001

- Title: Backup/DR snapshot manifest
- Risk: H
- Objective: Record tenant backup evidence as row-count manifests and hashes.
- Verification: snapshot records contain table counts and hashes only, no data
  export body or document content.

### ENT-COMPLIANCE-READY-TUW-001

- Title: Compliance readiness evidence registry
- Risk: H
- Objective: Add SOC 2 / ISO 27001 control evidence references and readiness
  summary.
- Verification: evidence body is not stored; readiness summary is derived from
  reference rows and has gap counts.

### ENT-ADMIN-UI-TUW-001

- Title: Enterprise hardening console
- Risk: M
- Objective: Add protected `/enterprise` admin console for SSO, BYOK, SIEM,
  backup, compliance, and readiness state.
- Verification: route is protected by auth guard and no secret-bearing fields
  are rendered.

### ENT-GATE-REPORT-TUW-001

- Title: Enterprise SaaS Readiness Gate report
- Risk: C
- Objective: Record R13 Gate evidence for SSO/BYOK/SIEM/backup/compliance
  readiness, tenant isolation, sensitive-data controls, and release boundary.
- Verification: `docs/reports/R13_enterprise_readiness.md`,
  `docs/ledger/gates/R13_gate.md`, decision ledger, and execution ledger all
  reflect the current technical state.

## Release Boundary

R13-01 MUST NOT create:

- external IdP network calls or live SAML assertion session issuance.
- raw SAML metadata/assertion XML storage.
- raw SIEM endpoint URL, webhook token, syslog secret, or outbound delivery.
- raw key material, KMS secret handle, private key, or BYOK plaintext URI.
- backup data export body, document content copy, or restore overwrite path.
- compliance evidence body storage.
- external AI model opening or DEC-11 override.

If any of the above is needed, stop and append escalation to
`docs/ledger/execution.md`.
