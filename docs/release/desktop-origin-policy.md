# Desktop Origin Policy

Date: 2026-06-14
Scope: Desktop-installable AMIC Vault clients.

## Principle

The desktop app launches only an approved Vault web origin. It does not embed private endpoint values, account IDs, ARNs, secrets, cookies, or customer data in repo files.

## Environments

| Environment | Origin Shape | Repo Storage Rule | Release Rule |
|---|---|---|---|
| Local development | `http://localhost:<port>` | Allowed as non-secret developer default | Developer-only. Not packaged for customer use. |
| AWS staging temporary target | AWS-managed HTTPS or load-balancer target evidence ref | Store only evidence ref, never endpoint value | Allowed for staging smoke/UAT. |
| Production temporary HTTPS target | Production evidence ref | Store only evidence ref, never endpoint value | Allowed only when production release runbook marks the ref approved. |
| Production custom domain | Future domain evidence ref | Store domain decision ref after approval | Required before broad customer rollout. |

## PWA Phase 1

PWA installability is served from the same web origin already used by the browser. The manifest and service worker are origin-scoped and do not include private backend URLs.

## Future Tauri Phase

Tauri is blocked until these inputs exist:

- signed installer and update policy,
- explicit origin allow-list per environment,
- capability deny-by-default config,
- deep link handling policy,
- local log allow-list,
- rollback procedure for bad desktop releases.

## Evidence Rules

Desktop release notes may cite evidence refs such as `STAGE-SMOKE-AWS-001` or `PROD-SMOKE-AWS-001`. They must not include private endpoints, account identifiers, secret names, cookie values, tokens, or customer data.
