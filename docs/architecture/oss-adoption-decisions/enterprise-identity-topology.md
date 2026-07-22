# Enterprise identity topology decision — OSS07-IDP001

Status: `BLOCKED_IDENTITY_TOPOLOGY_REQUIRED` (2026-07-22)

## Source-first result

| Candidate | Local clone pin | License | Source baseline | Intended reuse | Current result |
|---|---|---|---|---|---|
| Direct OIDC: `openid-client` | `v6.8.4` / `c64569592b6e74ace4410599860dcb9423e848af` / tree `5b3c8235731b8021c81ae7ae7794cb543963ba12` | MIT, hash `14c5cc0dc21f44add6d88a5621c65813d40bf382550c978430096db3df0cf68c` | `npm ci --ignore-scripts && npm test`: pass | L1 package, no source or fixture copy | conditional only |
| Broker: Keycloak | `26.7.0` / `6c73e3027811d9c7b22683edd825e839272e9547` / tree `20066e4a9ecc37587e6e7ebbe64951ecbd968b17` | Apache-2.0, hash `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` | Java/Maven unavailable locally; no pass claimed | L1/L3 isolated operational component only | conditional only |

The direct candidate's source contains conformance cases for invalid state and
nonce, plus PKCE/nonce handling. The Keycloak tree contains FAPI PKCE coverage.
These observations are behavior references only; no upstream code, test or
fixture enters Vault.

## Vault baseline that prevents a guessed decision

- `enterprise_sso_providers` in migration `0061` accepts only `saml2`; it has
  no verified issuer, discovery, client-reference or audience contract.
- `user_login_identities` in migration `0090` accepts only globally unique
  `account_ledger_id`; it cannot represent `(issuer, subject)` safely.
- Existing SSO configuration carries a local default role. A future federated
  flow must not let an external claim decide Vault role, permission, ethical
  wall or tenant.

## Required decision inputs (not supplied)

1. Customer protocol requirement: direct Entra OIDC only, SAML compatibility,
   LDAP/other protocols, multiple issuer requirement and sovereign cloud need.
2. Hosting choice and owner: whether a broker may be self-hosted, who owns its
   upgrade/backup/HA/on-call posture, and an actual staging IdP operator.
3. Licensing/TCO acceptance for the selected operating model.

Without all three inputs, selecting direct OIDC would silently discard possible
SAML/multi-protocol needs, while selecting Keycloak would create an unowned
identity service. Therefore this TUW does not choose a primary topology.

## Consequence and safe next action

`DEVOPS-OSS07-IDP-TUW-002~004` are blocked. No package, lockfile, migration,
auth route, redirect URI, secret, IdP configuration or external call was made.
Once the three inputs are recorded, re-open this exact decision: choose one
topology, explicitly reject/condition the other, then execute TUW-002 before
any callback or login code.
