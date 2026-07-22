# PACK-OSS07-01 — Identity topology and OIDC callback

Status: canonical post-R14 extension under `USER-UMBRELLA-AUTONOMY-20260721`.
This is the canonical form of `PROPOSED-PACK-OSS07-01`, rebased on
`origin/main` `938e9ecc00f339ac16889f1a7bd2480138c91180` after merged
`PACK-OSS04-01` QRT-001. Its prerequisite is the merged queue authority
`DEVOPS-OSS01-QUE-TUW-004`; it does not depend on the blocked ClamAV adapter.

## Scope and invariants

- Federated identity is additive only. Existing local session issuance, MFA,
  deprovision, PermissionService, ethical-wall evaluation, tenant RLS and audit
  are the authority; an IdP claim can never assign a Vault role or ACL.
- `openid-client` v6.8.4 (MIT) and Keycloak 26.7.0 (Apache-2.0) are research
  clones outside the product tree. Neither source nor fixture is vendored.
- No package/lockfile, runtime auth route, database schema, external IdP,
  secret, redirect URI, staging traffic, deployment or customer data is in
  scope until TUW-001 records exactly one approved topology.
- Existing `enterprise_sso_providers` is SAML-only and
  `user_login_identities` is `account_ledger_id`-only. They are inputs, not
  authorization to broaden either meaning before the approved decision.

## TUW order

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS07-IDP-TUW-001` | C | `DEVOPS-OSS01-QUE-TUW-004` | decide one safe IdP topology or record a concrete block |
| 2 | `DEVOPS-OSS07-IDP-TUW-002` | C | IDP-001 approved | map verified issuer/subject without tenant confusion |
| 3 | `DEVOPS-OSS07-IDP-TUW-003` | C | IDP-002 + direct/broker edge selected | add a pinned OIDC validation adapter |
| 4 | `DEVOPS-OSS07-IDP-TUW-004` | C | IDP-003 | add one-use callback state handling |

## `DEVOPS-OSS07-IDP-TUW-001`

- **Files create:**
  `docs/architecture/oss-adoption-decisions/enterprise-identity-topology.md`.
- **Files modify:** `security/oss-source-map.yml`,
  `security/oss-adoption-decisions.yml`, this contract, live PACK registry,
  canonical backlog and append-only execution ledger only.
- **Files NOT-modify:** auth runtime, provider DB, role mapping, external IdP,
  dependencies/locks, `docs/package/**`.
- **Implementation:** compare direct Entra OIDC through `openid-client` with a
  self-hosted Keycloak broker against issuer discovery, PKCE S256, state,
  nonce, audience, deprovision, outage, upgrade/backup/HA, license and TCO.
  Record source/test evidence and reject the non-selected alternative. Do not
  write OIDC code or copy upstream test fixtures.
- **Verification (AND):** exact source commit/tree/license evidence for both
  candidates; `openid-client` upstream baseline passes; Keycloak environment
  limitation is recorded without pretending a test passed; current SAML and
  local-login schema boundaries are cited; source-map, reuse-first, backlog,
  frozen-doc and diff checks pass.
- **Stop:** customer protocol/hosting/license choice or actual staging IdP
  owner is absent. The result is `BLOCKED_IDENTITY_TOPOLOGY_REQUIRED`, not a
  guessed direct-OIDC or Keycloak selection.

## `DEVOPS-OSS07-IDP-TUW-002`

- **Files create:** next registered federated-identity migration only after
  TUW-001 approval.
- **Files modify:** bounded enterprise/auth shared types and direct
  EnterpriseService specs only.
- **Files NOT-modify:** account-ledger identity semantics, email-domain tenant
  trust, raw metadata/certificate/token/subject in audit, dependencies/locks,
  `docs/package/**`.
- **Implementation:** pre-verified issuer/provider maps to one tenant;
  `(issuer, subject)` maps to a local user as a bounded opaque reference;
  secret values stay in approved secret references; JIT is default-off.
- **Verification (AND):** migration up/down/up, FORCE RLS, issuer/subject
  collision and cross-tenant negatives, raw-secret column scan, provider
  permission/audit tests.
- **Stop:** any need to persist a client secret without an approved secret
  authority or to alter account-ledger identity semantics.

## `DEVOPS-OSS07-IDP-TUW-003`

- **Files create:** federation identity-provider interface, direct OIDC adapter
  and specs only after TUW-001/002 approval.
- **Files modify:** API dependency manifest/lockfile only for the exact pinned
  approved package and bounded auth-module wiring.
- **Files NOT-modify:** local session/role/PermissionService authority,
  implicit/password flow, raw token logging, `docs/package/**`.
- **Implementation:** use only pinned `openid-client`; require issuer
  allowlist, code+PKCE S256, state/nonce, issuer/audience/azp/time validation,
  bounded claims and safe errors. The adapter returns a verified identity, not
  a permission decision.
- **Verification (AND):** upstream-derived negative scenarios for forged
  issuer/audience/nonce/state/code, discovery SSRF/redirect, expiry,
  algorithm downgrade and token-log canary.
- **Stop:** unapproved version, insecure issuer validation, unrestricted
  discovery host, or a topology decision that selects a broker instead.

## `DEVOPS-OSS07-IDP-TUW-004`

- **Files create:** federation state repository/controller/specs and a
  registered migration only when a DB transient store is selected.
- **Files modify:** auth module/controller, public-route allowlist and a
  minimal bounded login link only.
- **Files NOT-modify:** wildcard redirect, raw state/nonce logs, local session
  issuance before a verified callback, `docs/package/**`.
- **Implementation:** bind a one-use short-lived state/nonce/PKCE record to an
  approved provider and tenant; atomically consume it; allow only same-origin
  return paths; fail closed on store failure.
- **Verification (AND):** success, wrong tenant/provider/state/nonce, replay,
  expiry, duplicate callback race, open redirect, missing-store/DB-timeout and
  bounded audit/log checks.
- **Stop:** wildcard/insecure redirect or unprotected transient material.

## Evidence boundary

All evidence stays under
`artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS07-01/<tuw>/` and contains
only source identifiers, hashes, bounded protocol result codes and synthetic
claims. A local decision or source test does not claim IdP configuration,
deployment, release or go-live.
