# ADR-021: AMIC OS Exact Vault Copy Transport

Status: Proposed

Source: the AMIC OS single-install Vault integration goal dated 2026-08-28,
ADR-004, ADR-005, ADR-007, ADR-012, ADR-015, PACK-OA-08, DEC-09, DEC-12,
DEC-23, DEC-25, and DEC-26.

## Context

PACK-OA-08 intentionally permits only an internal Vault reference. Its
`attach-copy` mode is denied because no reviewed path existed for moving Vault
document bytes into an Outlook compose item.

AMIC OS now needs two exact-copy consumers:

- save an exact Vault document version to a user-selected local destination;
- attach that same exact version to an Outlook draft through an AMIC OS-owned
  host adapter.

Installing AMIC OS must be sufficient for the user. The user must not install,
start, sign in to, update, or repair a second Vault desktop application. That
packaging requirement does not move Vault authority into the desktop: Vault
continues to own tenant/user resolution, document/version/file identity,
permissions, Ethical Wall, Records, DLP, immutable storage, and audit.

## Decision

Add a dedicated, default-off, server-to-server exact-copy provider for AMIC OS.
It is separate from the browser/PWA session, the Outlook add-in session, the
OA08 internal-reference endpoint, and public/external sharing.

The provider has three POST operations:

1. authorize an exact export;
2. consume the authorization and return bounded binary bytes once;
3. read back the consumed state and exact audit correlation.

The provider must enforce all of the following:

- `AMIC_OS_VAULT_PROVIDER_ENABLED` is false unless explicitly set to `true`;
- a dedicated server-held workload credential is required and compared in
  constant time; no credential reaches Office.js, Electron/Tauri renderer code,
  a browser response, logs, audit metadata, or repository evidence;
- the caller's AMIC OS account-ledger identifier is resolved through the
  existing active `user_login_identities` mapping; a caller-supplied Vault
  tenant or user UUID is never trusted as authority;
- the LawOS matter identifier is resolved through the existing canonical Matter
  metadata projection and must identify exactly one active tenant-scoped Matter;
- the requested `document_id`, `version_id`, `file_object_id`, SHA-256, byte
  size, and MIME type are re-resolved as one promoted Vault tuple; “latest” is
  never substituted;
- `PermissionService.canDownloadDocument`, Ethical Wall, Records/legal-hold /
  disposal state, and DLP egress all return an allow decision both at authorize
  time and immediately before consumption;
- authorization expires within 60 seconds and is consumed at most once;
- storage bytes are bounded and verified against the resolved SHA-256, byte
  size, and MIME metadata before they can leave Vault;
- authorization, denial, download, and consumption are represented by existing
  reference-only audit actions and the caller's correlation identifier;
- no storage URI, presigned URL, raw capability token, external link, public
  link, guest link, secure link, or VDR link is returned.

Reuse `preview_access_sessions` as the short-lived server-only authorization
ledger. The row is bound to tenant, user, document, and exact version; its
expiry is at most 60 seconds and atomic `revoked_at` transition is the consume
marker. `token_hash` stores a provider-secret-keyed HMAC of the immutable AMIC
OS principal, Matter, installation, compose, operation, idempotency, and exact
version binding. No raw capability exists or is returned, so the row cannot be
presented to the public preview endpoint. A changed binding derives a different
hash and fails closed before storage access.
The AMIC OS operation id deterministically selects the session id, making
authorize retries idempotent and conflicting retries fail closed.

This reuse means PACK-OA-12 requires no database migration. If the existing
ledger cannot provide exact idempotency, atomic consumption, tenant RLS, or
offboarding revocation without weakening its constraints, implementation must
stop and register a new migration instead of adding an in-memory fallback.

## Alternatives Considered

### Return a storage or presigned URL

Rejected. It would move replay, expiry, redirect, egress, and leakage risk to
the desktop/Office host and would make the provider unable to prove exact
single consumption.

### Re-enable OA08 `attach-copy` inside the normal add-in session

Rejected. OA08 is a user-session, internal-reference surface. Byte transport
needs a separate workload boundary, bounded streaming, exact object integrity,
and host-owned memory handling.

### Install a second Vault desktop agent

Rejected. It violates the single-install product requirement and creates a
second updater, login/session surface, repair lifecycle, and local authority.

### Add a new export-grant table immediately

Deferred. The existing tenant-RLS/FORCE-RLS preview session ledger already has
the required actor/document/version/expiry/revocation shape. A new table is
justified only if implementation evidence proves the reuse cannot satisfy this
ADR.

## Consequences

- AMIC OS can receive exact bytes only through its trusted server/host adapter;
  renderer and Office.js code receive only safe operation state.
- Vault authorization remains current at consumption time; a stale desktop
  authorization cannot override a later permission, wall, Records, DLP, or
  offboarding change.
- A failed byte verification consumes nothing and returns no bytes.
- A concurrent replay may read storage internally, but only the transaction
  that atomically revokes the grant can return bytes. Losing contenders discard
  their buffer and return a safe consumed response.
- Uploading local/email bytes into Vault is not part of this ADR. Quarantine,
  malware scan, promotion, and asynchronous readback require a separate PACK
  and contract.
- Live workload credentials, production endpoint configuration, Microsoft 365
  tenant deployment, package signing, and real-host rollout remain human-owned
  operational gates.

## Stop Conditions

Stop implementation if any path:

- trusts caller-supplied Vault tenant/user authority or skips account-ledger
  resolution;
- resolves current/latest instead of the requested exact tuple;
- skips download permission, Ethical Wall, Records, DLP, promoted-file, or
  audit checks;
- returns a storage locator, raw grant secret, public/external link, or document
  bytes in JSON;
- permits a grant longer than 60 seconds or more than one successful consume;
- stores bytes, filenames, tokens, account ids, or private endpoint values in
  logs, audit metadata, or repository evidence;
- changes `docs/package/**`;
- enables production runtime or deploys a credential without the explicit
  operational gate.

## Review Triggers

Revisit this ADR if workload identity replaces the bounded shared credential,
Office attachment limits change, preview session reuse proves insufficient, an
external-recipient sharing path is requested, or the upload/quarantine provider
needs to share capability state with export.
