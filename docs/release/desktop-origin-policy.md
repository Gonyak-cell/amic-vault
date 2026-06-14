# Desktop Origin Policy

Date: 2026-06-14
Scope: Desktop-installable AMIC Vault clients.

## Principle

The desktop app launches only an approved Vault web origin. It does not embed private endpoint values, account IDs, ARNs, secrets, cookies, or customer data in repo files.

## Environments

| Environment                       | Origin Shape                                           | Repo Storage Rule                             | Release Rule                                                         |
| --------------------------------- | ------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------- |
| Local development                 | `http://localhost:<port>`                              | Allowed as non-secret developer default       | Developer-only. Not packaged for customer use.                       |
| AWS staging temporary target      | AWS-managed HTTPS or load-balancer target evidence ref | Store only evidence ref, never endpoint value | Allowed for staging smoke/UAT.                                       |
| Production temporary HTTPS target | Production evidence ref                                | Store only evidence ref, never endpoint value | Allowed only when production release runbook marks the ref approved. |
| Production custom domain          | Future domain evidence ref                             | Store domain decision ref after approval      | Required before broad customer rollout.                              |

## PWA Phase 1

PWA installability is served from the same web origin already used by the browser. The manifest and service worker are origin-scoped and do not include private backend URLs.

## Tauri Phase 3

The Phase 3 Tauri shell reads origin config from
`AMIC_VAULT_DESKTOP_ORIGIN_CONFIG` and verifies an Ed25519 signature before it
creates the webview. Repo-tracked config may include only the signed local
development fixture at `apps/desktop/src-tauri/config/local.signed.json`.

Tauri origin rules:

- local config must use `releaseChannel: local`, `originRef: LOCAL-DEV`, and
  `http://localhost:<port>` or `http://127.0.0.1:<port>`;
- staging config must use `releaseChannel: staging`, a `STAGE-*` ref, and HTTPS;
- production config must use `releaseChannel: production`, a `PROD-*` ref, and HTTPS;
- config must contain an origin only, not an application path, query, fragment,
  username, or password;
- private staging/production endpoints remain outside git and may be recorded
  only as evidence refs.

The Phase 3 shell has no updater plugin. A later distribution phase must add a
separate signed-update evidence set before native auto-update is enabled.

## Evidence Rules

Desktop release notes may cite evidence refs such as `STAGE-SMOKE-AWS-001` or `PROD-SMOKE-AWS-001`. They must not include private endpoints, account identifiers, secret names, cookie values, tokens, or customer data.
