# Desktop Cache Policy

Date: 2026-06-14
Scope: PWA Phase 1 and later thin desktop shells.

## Classification

| Class | Examples | Browser/PWA Policy |
|---|---|---|
| Public shell static | `/_next/static/*`, approved local fonts, icons, `manifest.webmanifest` | Cacheable by service worker or browser headers. |
| Offline shell | `/offline.html` | Cacheable only as a static safe fallback. Must not contain tenant, matter, document, search, audit, or AI state. |
| Authenticated app surfaces | `/dashboard`, `/matters`, `/search`, `/documents`, `/audit`, `/records`, `/ai`, `/contracts`, `/dd`, `/litigation`, `/enterprise`, `/scale`, `/walls` | `Cache-Control: no-store`; service worker bypass. |
| API responses | `/v1/*` | `Cache-Control: no-store`; service worker bypass. |
| API metrics | `/metrics` | `Cache-Control: no-store`; excluded from `/v1` but covered by the same API middleware. |
| External portal surfaces | `/external/*` | `Cache-Control: no-store`; service worker bypass. |
| Session and auth surfaces | `/login`, cookies, authorization headers | `Cache-Control: no-store`; never cache auth-bearing requests. |

## Allowed Service Worker Cache Keys

- `/_next/static/*`
- `/fonts/amic/*`
- `/icons/*`
- `/manifest.webmanifest`
- `/offline.html`

No other route may be added to a service worker cache without a new threat-model update.

## Denied Service Worker Cache Keys

The service worker must bypass all requests with these path prefixes:

- `/v1`
- `/dashboard`
- `/matters`
- `/search`
- `/documents`
- `/audit`
- `/records`
- `/ai`
- `/contracts`
- `/dd`
- `/litigation`
- `/enterprise`
- `/scale`
- `/walls`
- `/external`
- `/login`

The service worker must also bypass any request carrying `Authorization` or `Cookie` headers.

## Response Headers

API responses and sensitive app surfaces use:

```text
Cache-Control: no-store, no-cache, max-age=0, must-revalidate, private
Pragma: no-cache
Expires: 0
```

Static shell assets may use long-lived public caching only when they cannot contain tenant data.

## Shell Cache Rotation

The service worker is cache-first only for the static shell allow-list. Change `CACHE_NAME` in `apps/web/public/sw.js` whenever shell cache membership, manifest behavior, icons, or offline fallback content changes. Production release notes should mention the cache name when a desktop shell rotation is intentional.

## Desktop Logs

Allowed desktop log fields:

- application version,
- release channel,
- approved origin evidence ref,
- operating system family,
- correlation/request refs.

Denied desktop log fields:

- document names, titles, snippets, text, previews, hashes tied to private content unless already server-approved audit metadata,
- cookies, tokens, session IDs, password reset tokens,
- private endpoints, account IDs, ARNs, bucket names, database hostnames,
- customer data or tenant-specific matter names.
