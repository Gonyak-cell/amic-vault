# DMS Workbench Offline Cache Decision

> Status: **ACCEPTED — RETAIN_NO_DOCUMENT_CACHE**
>
> Date: 2026-07-28
>
> Scope: AMIC Vault web PWA and DMS workbench browser storage boundary

## Decision

AMIC Vault retains the current no-document-cache posture. The service worker may cache only queryless, same-origin, unauthenticated static application-shell assets:

- `/offline.html`
- `/manifest.webmanifest`
- versioned Next.js static assets
- AMIC fonts and icons

The browser PWA must not place customer documents, previews, preview tokens, API responses, search queries or snippets, Matter/tenant state, audit data, or authenticated route responses in Cache Storage or other new client persistence. HTTP responses for those surfaces remain `no-store`; the service worker deny-list is evaluated before every cache lookup.

This decision does not authorize an offline document feature. Vault has no approved client-side document encryption/key-custody model, remote revocation proof, tenant-switch erasure contract, or legal-hold/retention reconciliation protocol. Any future offline document capability therefore requires a separate security release and cannot be added by weakening this guard.

## Browser lifecycle boundary

HTTP `no-store`, the browser back/forward cache (BFCache), and the service worker Cache API are distinct mechanisms. `no-store` prevents a new HTTP-cache entry but does not erase an entry already stored, while the Cache API is explicitly controlled by service-worker code. BFCache behavior is also evolving. Sensitive Vault routes therefore reload when restored from BFCache so they re-enter the current server/session/tenant boundary.

References:

- [MDN HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)
- [web.dev BFCache](https://web.dev/articles/bfcache?hl=en)

## Threat and lifecycle review

| Scenario | Retained control | Residual boundary |
|---|---|---|
| lost or shared device | no document/API/route response enters Cache Storage; sensitive BFCache restore reloads | an explicit user download is a user-managed file, not an offline Vault cache |
| logout | authenticated and sensitive paths bypass Cache Storage; BFCache restore reloads | server session revocation remains authoritative |
| tenant switch | no query/cookie/auth variant is a cache key; sensitive restore reloads | every network request must still enforce tenant isolation |
| permission or key revocation | no decryptable offline document exists in the PWA cache | the next network access re-enters `PermissionService` |
| retention or legal hold change | no offline mutation or document replica can diverge | canonical server record remains authoritative |
| preview opened before disconnect | preview route/token bypasses cache before lookup | the existing preview session expiry/revocation contract remains authoritative |
| failed network | only the content-free offline shell may be returned | no stale customer page is substituted |
| browser HTTP cache | sensitive responses remain `no-store` | browser history metadata is governed separately |
| explicit download | existing permission/audit path remains canonical | remote deletion of a user-saved file is not claimed |

## Enforced invariants

1. `apps/web/public/sw.js` uses a strict shell allowlist, an explicit sensitive deny-list, and rejects query, authorization, and explicit cookie variants before any Cache Storage access.
2. A cache-name version bump removes all older service-worker caches during activation.
3. `apps/web/src/lib/pwa/cache-policy.ts` is the web route classification source for middleware and BFCache restoration.
4. Integration tests execute the service worker and prove the cache content and bypass order. Source-text assertions alone are not completion evidence.
5. No external system, credential, customer data, deployment, release, or go-live action is part of this decision.
