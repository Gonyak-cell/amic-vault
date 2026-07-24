# PACK-SF20-06 — Local identity lifecycle

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721` and the owner's all-immediate-track
direction. This is the canonical form of `PROPOSED-PACK-SF20-06`, using the
pre-reserved `SEC-SF20-AUTH-TUW-001~004` IDs in
`security/small-firm-20-profile.yml`.

## Objective and authority

For a maximum-20-user law firm that deliberately has no separate IdP, retain
the existing local password/TOTP/session model but make its privileged-action,
brute-force, departure, and monthly-review boundaries explicit and testable:

```text
password -> production privileged TOTP policy -> verified session -> admin action
        \-> bounded bootstrap only -> enroll + activate -> fresh TOTP login

public auth endpoint -> HMAC reference throttle -> safe outward response
deactivate -> user inactive + revoke sessions/reset/preview/queued upload authority + audit
monthly review -> tenant-scoped aggregate snapshot -> hash-bound, PII-free manifest
```

Vault remains the owner of local roles, Matter permissions, ethical walls,
sessions, TOTP secrets, password reset tokens, audit rows, queued-upload
authority, and review verdicts. PostgreSQL 16, Node's standard `crypto` and
filesystem primitives, existing NestJS guards, existing TOTP service, existing
runtime-secret reader, and existing `pg` dependency are reused. This is an L0
independently authored hardening PACK: no upstream source/test/fixture copy,
new package, lockfile change, Keycloak/OIDC/SAML/SCIM, Redis, external IdP,
external notification, external review service, deployment, release, or
go-live action is authorized.

The production policy means `NODE_ENV=production`; test/development execution
may exercise the same pure policy through explicit inputs but may never create
a production fallback, loopback identity exception, or environment-based
allow rule. A missing production runtime secret, DB failure, malformed state,
or policy uncertainty fails closed.

## Pack-wide invariants

1. `docs/package/**`, PermissionService, Matter membership/ethical-wall
   semantics, immutable originals, storage keys, audit append-only triggers,
   gateway mTLS topology, and the SF20 capacity ceiling remain unchanged.
2. In production, a `firm_admin` or `security_admin` cannot execute a
   state-changing privileged action without a session created after successful
   TOTP or recovery-code verification. An `mfa_enabled` database flag alone
   is never sufficient.
3. An administrator without an active TOTP secret can receive only a
   short-lived ordinary session whose mutation surface is exactly
   `/auth/mfa/enroll`, `/auth/mfa/activate`, and self-logout. It cannot run an
   admin mutation before a fresh verified login. No other handler can opt in
   accidentally; a source-level allow-list test owns this boundary.
4. Existing enabled-MFA users remain fail-closed: an active secret is required,
   invalid/expired/replayed challenge input creates no session, and a recovery
   code remains one-use. Activation forces a fresh verified session rather than
   silently upgrading an unverified session.
5. Login, password-reset request, and MFA challenge attempts use a finite
   fixed vocabulary of HMAC-SHA-256 references. Raw email, account ledger ID,
   IP address, token, TOTP code, recovery code, user ID, tenant ID, user agent,
   or request body is not persisted in the throttle table, audit metadata,
   logs, manifests, or evidence.
6. Outward login/reset/MFA denial stays enumeration-safe: the public response
   remains the existing safe `AUTH_REQUIRED` or `{ accepted: true }` shape.
   Backoff/lock status, candidate existence, and throttle key selection are
   internal-only.
7. Deactivation is one audit transaction: user status, normal sessions,
   open reset tokens, preview sessions, and unfinished bulk-upload batch items
   change together; audit failure rolls all of them back. There is no separate
   resumable/direct-upload intent in this baseline. A bulk-upload batch item is
   the only queued upload authority and must not be resurrected by a late job
   report.
8. Every document/quarantine upload persistence path keeps its existing
   PermissionService check and obtains an active-user lifecycle fence inside
   the final transaction. A worker that races a committed deactivation can
   leave no document, scan, or queued authority; a genuinely earlier in-flight
   transaction serializes before deactivation and is auditable.
9. The monthly review is tenant-scoped, read-only, capped at 20 accounts, and
   uses only hashed account references plus status/count/time fields. It emits
   no email, display name, raw UUID, contact, Matter name/code, document,
   filename, token, or credential. An output is atomic/no-overwrite and binds
   its payload hash to its reviewed month and policy version.
10. At least one `firm_admin` remains active. Reactivation remains explicit and
    never restores sessions, reset tokens, preview sessions, or queued upload
    authority.

## Ordered TUWs

| Order | ID | Risk / size | Depends on | Result |
| ----: | -- | ----------- | ---------- | ------ |
| 1 | `SEC-SF20-AUTH-TUW-001` | C / M | `DEVOPS-SF20-DR-TUW-003` | production local-admin TOTP step-up/limited bootstrap boundary |
| 2 | `SEC-SF20-AUTH-TUW-002` | C / L | AUTH-001 | durable bounded login/reset/MFA throttle and lockout |
| 3 | `SEC-SF20-AUTH-TUW-003` | C / L | AUTH-001, AUTH-002 | atomic offboarding cascade and queued-upload lifecycle fence |
| 4 | `SEC-SF20-AUTH-TUW-004` | H / M | AUTH-001, AUTH-002, AUTH-003 | monthly 20-user hash-bound access-review gate |

## Shared contracts

### Auth-throttle reference and state contract

`auth_throttle_states` is a deliberately global security-reference table, not
a tenant business table. It has no `tenant_id` because it must rate-limit an
unknown tenant/user before RLS context can be safely established. The migration
must state this exception, contain no source identifier column, grant no direct
table access to `vault_app`, and expose only narrow security-definer functions
that validate a closed scope plus `hmac-sha256:<64 lowercase hex>` reference.

Allowed scopes are fixed at migration and code level:

| Flow | Account reference | Network reference |
| --- | --- | --- |
| password login | known `(tenant,user)` or normalized supplied identifier | normalized peer address or `unknown` |
| reset request | known `(tenant,user)` or normalized supplied identifier | normalized peer address or `unknown` |
| MFA verify | opaque challenge reference | normalized peer address or `unknown` |

The HMAC uses the existing file-only `MFA_SECRET_ENCRYPTION_KEY` under a
domain-separated label. Production forbids a direct environment value and
fails closed if the file-backed secret is unavailable. Test-only values never
enter a production runtime path. The persistent state contains only scope,
reference, failure count, window start, next allowed time, lock time, and
timestamps. It has a finite 15-minute window, exponential 1/2/4/8-second
backoff, and a 15-minute lock after five failures; all clock calculations are
database-side and race-safe. Reset request consumption is counted even when
the public response is accepted, so it cannot become an enumeration oracle.

### Offboarding authority contract

The baseline has no presigned or resumable upload intent. Its authoritative
asynchronous upload unit is a `bulk_upload_batch_items` row in `pending` or
`uploaded` state. On deactivation it becomes `failed/PERMISSION_DENIED` with
the bounded internal reason `USER_DEACTIVATED`; the parent batch is refreshed.
Late worker reports may update only `pending`/`uploaded` items, never a
terminal offboarding result. Existing worker PermissionService checks remain
mandatory and an active-user row lock immediately before persistence gives a
linearization point against deactivation.

### Access-review manifest contract

The release tool accepts one tenant ID and a file-backed runtime database URL,
opens a read-only tenant-scoped transaction, and emits this bounded payload:

```json
{
  "schemaVersion": "amic-vault.sf20-access-review.v1",
  "reviewMonth": "YYYY-MM",
  "tenantScopeHash": "sha256:<64 hex>",
  "accountCount": 0,
  "accounts": [
    {
      "accountRef": "ref:<16 lowercase hex>",
      "status": "active|inactive|locked",
      "role": "closed UserRole",
      "admin": true,
      "mfa": "active|missing|inconsistent",
      "matterMembershipCount": 0,
      "lastLoginAt": "ISO-8601|null",
      "activeSessionCount": 0,
      "activePreviewSessionCount": 0,
      "openUploadAuthorityCount": 0,
      "offboardingState": "clear|review_required"
    }
  ],
  "findings": ["closed finding code"],
  "payloadSha256": "sha256:<64 hex>"
}
```

The tool refuses `accountCount > 20`, unknown roles/statuses, duplicate account
references, an administrator without active MFA, inactive/locked accounts with
active authority, orphan membership mapping, stale active-account canary, or
any raw-sensitive field. The result is `PASS` only with zero findings;
otherwise it is `REVIEW_REQUIRED` and returns nonzero without mutating Vault.

## `SEC-SF20-AUTH-TUW-001`

**Title:** Production local-admin MFA step-up policy
**Release/module:** R14 / SEC-SF20-AUTH
**Risk/size:** C / M
**Objective:** make actual TOTP/recovery-code proof, not a mutable boolean,
the condition for a privileged local production mutation.

### Files

- **Modify:** `apps/api/src/modules/auth/mfa.policy.ts`,
  `apps/api/src/modules/auth/auth.service.ts`,
  `apps/api/src/modules/auth/session.guard.ts`,
  `apps/api/src/modules/auth/auth.controller.ts`, shared auth DTO/types, and
  focused auth/guard specs.
- **May create:** one auth metadata decorator for the exact bootstrap
  allow-list and a colocated unit spec.
- **NOT modify:** PermissionService, role matrix semantics, MFA encryption
  format, TOTP algorithm/window, audit metadata schema, user role values,
  public/external sharing, dependencies/lockfiles, `docs/package/**`.

### Implementation

1. Add one pure `isPrivilegedLocalAdminRole` predicate for `firm_admin` and
   `security_admin`; use it from policy and guard rather than duplicating role
   lists.
2. In production, evaluate active TOTP secret presence for every privileged
   local admin, even if `mfa_enabled` is false. Return only `allow`,
   `challenge`, `deny`, or the explicit limited bootstrap outcome. An active
   secret with a contradictory flag still challenges; an enabled user without a
   secret denies.
3. Issue a bootstrap session only for an admin with no active secret, mark it
   unverified, and expose an explicit enrollment-required response bit. The
   session cannot mutate anything except the three declared self-service
   routes. An ordinary non-admin retains the existing local policy.
4. Preserve the existing TOTP/recovery verification path. A verified challenge
   is the only source of a verified login session. MFA activation does not
   silently set `mfa_verified` for the bootstrap session; the next login must
   complete a fresh challenge.
5. Enforce the route allow-list in the shared session guard at the
   state-changing HTTP boundary, before controller/service work. The source
   test must prove there are no unexpected metadata uses and no unverified
   privileged mutation route.

### Verification (AND)

- Pure policy tests cover each privileged/nonprivileged role, production/test
  mode, enabled/disabled flag, present/missing secret, contradictory state, and
  all four outcomes.
- Auth service tests prove a production admin gets bootstrap/challenge/deny as
  appropriate; a session is never issued after invalid/replayed MFA; recovery
  code remains one-use; and raw code/token/secret never enters an event.
- Guard tests and a focused integration test prove unverified production admin
  POST/PATCH/PUT/DELETE routes deny, only the bootstrap allow-list reaches its
  controller, and a verified session can perform the same administrative
  action.
- Existing MFA enrollment/activation/challenge integration, auth/session
  regression, audit, permission, and static bootstrap-route inventory remain
  green.

### Done / stop

Done when an `mfa_enabled=true` flag without successful TOTP/recovery proof
cannot execute a production admin mutation and the only registration route is
auditable. Stop if the boundary requires a new IdP, a permissive global guard
exception, a direct secret environment value, or an unreviewable route list.

## `SEC-SF20-AUTH-TUW-002`

**Title:** Bounded local authentication rate and lockout
**Release/module:** R14 / SEC-SF20-AUTH
**Risk/size:** C / L
**Objective:** bound password login, password-reset request, and MFA challenge
attempts without turning account state into an outward oracle.

### Files

- **Create:** one reversible migration for the global HMAC-only throttle
  reference state/security-definer functions; one `auth-throttle` service and
  focused specs.
- **Modify:** auth/password-reset/MFA controllers and services, DatabaseService
  narrow auth-function adapters, shared audit action/type only if a new closed
  action is needed, production-secret checker/tests where the existing MFA
  key's domain-separated use is asserted, and auth/integration specs.
- **NOT modify:** `users.status` lock semantics, password hash algorithm,
  public response codes/shapes, PermissionService, RLS business tables,
  external IdP/Redis/queue/cache/dependencies/lockfiles, `docs/package/**`.

### Implementation

1. Add only narrow database adapters for check/consume/fail/reset security
   functions; do not expose a generic cross-tenant query API or direct table
   access to the runtime role.
2. Use a closed map of two HMAC refs per public flow (account/challenge plus
   network), bounded input normalizers, fixed domains, and no stored raw value.
   Unknown candidate and malformed input use the same bounded unknown ref.
3. Check before password/TOTP work; record a failed attempt atomically on safe
   denial; clear a successful login/MFA reference only after valid credentials
   have been proven. Reset request consumes an attempt regardless of candidate
   existence and still responds `{ accepted: true }` when throttled.
4. Use database `clock_timestamp()` with finite window/backoff/lock values so
   app clocks, restarts, and concurrent API processes cannot bypass a lock.
   A DB/function/audit error prevents session/token issuance.
5. Log/audit only a closed reason code and existing target references where a
   tenant/user is already known. Never add email/IP/token/code values to audit
   metadata or error bodies.

### Verification (AND)

- Migration round-trip proves global-table exception documentation, zero raw
  identifier columns, no direct runtime grant, function scope/reference
  validation, no table scan function, and normal tenant RLS remains intact.
- Unit/integration tests cover five failures, exponential boundary times,
  15-minute expiry, reset consumption, valid login/reset/MFA after expiry,
  malformed/unknown candidate parity, concurrent attempts, restart-style new
  service instances, and audit-write failure.
- Mutation tests prove a raw email/IP/tenant/user/token value cannot appear in
  table row, SQL parameter log fixture, audit metadata, CLI result, or error
  body. Account-existing and account-missing external responses stay equal.
- Existing MFA five-code challenge lock remains compatible and full auth,
  permission, audit, and integration regressions remain green.

### Done / stop

Done when a brute-force client cannot acquire a session or existence signal
outside the fixed budget and every persisted key is a domain-separated HMAC
reference. Stop if a persistent limiter would require raw identifier storage,
Redis, an unsafe global bypass, or a production direct-env secret.

## `SEC-SF20-AUTH-TUW-003`

**Title:** Atomic offboarding cascade and queued-upload fence
**Release/module:** R14 / SEC-SF20-AUTH
**Risk/size:** C / L
**Objective:** make deactivation revoke every current local authority and
prevent a queued job from restoring an authority after departure.

### Files

- **Modify:** `apps/api/src/modules/user/user-lifecycle.service.ts`,
  `apps/api/src/modules/preview/preview-session.service.ts`,
  `apps/api/src/modules/document/bulk-upload-batch.service.ts`, document and
  quarantine persistence fences, necessary module exports/imports, and focused
  user/preview/bulk-upload specs.
- **May modify:** one reversible privilege/audit migration only if the current
  runtime role lacks the minimum columns needed for the existing authoritative
  tables.
- **NOT modify:** document/version immutable-original semantics, storage key
  layout, PermissionService decision rules, queue payload schema/retry policy,
  audit append-only trigger, hard deletion, external sharing, dependencies,
  `docs/package/**`.

### Implementation

1. Add a tenant-scoped `PreviewSessionService.revokeAllForUser` that changes
   only unrevoked rows and runs on the caller's transaction.
2. In the existing lifecycle audit transaction, set inactive, revoke normal
   sessions/reset tokens/preview sessions, terminally fail unfinished
   bulk-upload items for the target user, recompute each affected batch, then
   write the existing lifecycle audit. Any failure rolls back all changes.
3. Guard batch report updates with `status IN ('pending','uploaded')` so a
   delayed worker cannot overwrite an offboarding terminal state. Retried work
   continues to require an active session and PermissionService.
4. Add the minimal active-user row fence inside the final document/quarantine
   persistence transaction. It serializes against lifecycle status update;
   committed deactivation wins for later work and compensation removes any
   unpersisted storage write.
5. Do not invent an upload-intent table or cancel unrelated scanner jobs. The
   baseline has no standalone intent; record that exact absence in code/test
   inventory and rely on the batch authority plus existing worker permission
   evaluation.

### Verification (AND)

- Focused integration creates normal and preview sessions plus a synthetic
  unfinished batch, deactivates the user, and proves all `revoked_at`/terminal
  state, protected-token denial, no new batch enqueue, audit event, and no raw
  identity in metadata.
- Fault-injected audit failure rolls status/session/reset/preview/batch state
  back together. Cross-tenant target, non-admin actor, last firm admin, and
  reactivation remain denied/unchanged as before.
- Race tests prove a late report cannot turn `USER_DEACTIVATED` work into
  `done`, and a job that reaches the active-user fence after deactivation
  creates neither a document nor quarantine authority. A prior serialized
  transaction is auditable and leaves no post-deactivation work.
- Existing user-offboarding, preview-session, upload permission, bulk upload,
  quarantine/promotion, audit, RLS, and full integration suites remain green.

### Done / stop

Done when deactivation has one transactional authority boundary and no
pre-existing session/preview/unfinished bulk authority can act afterward.
Stop if cancellation requires deleting originals, bypassing PermissionService,
changing queue payload/retry semantics, or introducing a fake resumable intent.

## `SEC-SF20-AUTH-TUW-004`

**Title:** Monthly 20-user access-review gate
**Release/module:** R14 / SEC-SF20-AUTH
**Risk/size:** H / M
**Objective:** give the firm one bounded, verifiable monthly account-control
artifact without exporting contact or document data.

### Files

- **Create:** `tools/release/small-firm-access-review.mjs`, its Node test,
  deterministic synthetic fixtures, and
  `docs/release/small-firm-access-review-runbook.md`.
- **Modify:** root scripts only to expose the deterministic local checker if
  existing release-tool conventions require it; OSS L0 path inventory for new
  Vault-owned tool/spec files.
- **NOT modify:** production DB data, user/matter/document records, audit
  bodies, permission policy, external email/ticket/SIEM sink, dependencies,
  lockfiles, `docs/package/**`.

### Implementation

1. Reuse Node `pg`, existing bounded file readers, `stableStringify`, atomic
   output/no-overwrite patterns, and file-only runtime URL rules. The tool has
   no HTTP path and never sends a notification.
2. Query one tenant in a read-only `BEGIN` plus tenant-context transaction.
   Join only users, active MFA-secret existence, session/preview/open-batch
   counts, Matter membership counts, and last-login data. Do not select
   email/name/contact, document/file, filename/path, token, password, secret,
   or raw IDs into the manifest.
3. Hash tenant/account references, sort deterministically, enforce the
   20-account ceiling and closed enum schemas, calculate fixed stale-account
   policy, and emit a payload plus SHA-256 binding. Return nonzero for findings
   but retain the review-required manifest for an operator decision.
4. The runbook specifies monthly cadence, a safe command with file paths only,
   PASS/REVIEW_REQUIRED interpretation, how to resolve an opaque account ref
   through the in-app administrator view, re-run rules, evidence fields, and
   the explicit boundary that no external approval/ticket is automatically
   created.

### Verification (AND)

- Pure tool tests cover deterministic order/hash, malformed/oversize/symlink
  input rejection, atomic/no-overwrite output, all closed schemas, 20/21-user
  boundary, and zero raw contact/document/UUID/token/credential canaries.
- Fake-client contract tests prove tenant context before every query and cover
  disabled-but-session-active, admin-without-MFA, orphan membership mapping,
  stale active account, active preview/upload authority, and clean PASS.
- Real local synthetic DB invocation verifies read-only behavior, output
  count/hash, nonzero review-required exit, and no database mutation. Full
  auth/offboarding/profile/release-tool regressions remain green.

### Done / stop

Done when one tenant's at-most-20 accounts produce an offline-verifiable,
hash-bound monthly control artifact with actionable closed findings and no
contact/document data. Stop if the desired output needs a raw directory export,
cross-tenant bypass, automatic external notification, or a new service.

## Pack completion

PACK-SF20-06 is complete only when all four TUWs pass their functional,
negative-security, audit, migration/recovery (where applicable), and full
regression checks; the canonical profile remains exactly 19 immediate outcomes,
seven PACKs, and 33 TUWs; the reuse-first checker classifies every new product
path as L0; bounded evidence is sealed; exact-head CI passes; and the branch
is merged. Provider/host/secret provisioning, deployment, release, and go-live
remain separate facts and are not implied by local implementation.
