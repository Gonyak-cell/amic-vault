# Desktop Threat Model

Date: 2026-06-14
Scope: AMIC Vault desktop-installable client, starting with PWA Phase 1.
Related ADR: `docs/adr/ADR-014-desktop-client-strategy.md`

## Boundary

The desktop surface is an access layer for the existing Vault web origin. It is not a local Vault runtime, local document store, local search index, or audit authority.

Server-owned controls remain authoritative:

- authentication and session validation,
- tenant context,
- PermissionService and ethical wall decisions,
- AuditService event creation,
- PostgreSQL RLS,
- document preview/download lifecycle,
- search, AI, records, and external portal policy.

## Assets To Protect

| Asset                     | Desktop Risk                                            | Required Control                                                                                                             |
| ------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Session cookies           | Service worker or local cache persistence               | Do not cache auth-bearing requests; API responses are `no-store`.                                                            |
| Matter/document metadata  | Offline app shell accidentally preserving rendered data | Service worker deny-list for app work surfaces and `/v1/*`.                                                                  |
| Document bytes            | Preview/download cached by browser or PWA               | Server `Cache-Control: no-store`; service worker bypass for `/v1/documents/*`.                                               |
| Search and AI context     | Local searchable corpus or offline reuse                | No desktop search index; all search/AI remains server-scoped.                                                                |
| Audit evidence            | Native open/download bypass                             | Desktop opens use existing API routes; API emits audit before response.                                                      |
| Private endpoints/secrets | Logs or packaged config                                 | Origin policy records environment names and refs only, not private URLs or secrets.                                          |
| Update path               | Unsigned or spoofed desktop runtime                     | PWA first; Phase 3 Tauri updater is disabled, and later update support must require signed artifacts plus approved channels. |

## Threats And Mitigations

| Threat                                                     | Mitigation                                                                                                                                | Evidence                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Service worker caches `/v1` API data                       | Hard deny-list in `sw.js`; API `no-store`; integration tests in canonical suites                                                          | `tests/integration/document-access/desktop-document-cache.spec.ts`     |
| Offline screen leaks tenant or matter state                | Static `offline.html` has no data-bearing terms or route state                                                                            | `tests/integration/metadata-leakage/desktop-offline-leakage.spec.ts`   |
| Browser back/forward cache exposes authenticated app state | Sensitive app paths receive `no-store` headers from middleware                                                                            | `apps/web/src/middleware.ts`                                           |
| API preview/download cached after audited access           | Global API no-store middleware, plus document audit integration coverage                                                                  | `tests/integration/audit-coverage/desktop-view-download-audit.spec.ts` |
| Desktop origin spoofing                                    | Approved origin policy forbids private endpoint values in repo and requires explicit release refs                                         | `docs/release/desktop-origin-policy.md`                                |
| Native capability bypass in Tauri shell                    | Phase 3 `vault-thin-shell` capability has an empty permission allow-list and no file, shell, dialog, clipboard, share, or updater plugins | `apps/desktop/src-tauri/capabilities/vault-thin-shell.json`            |
| Tampered Tauri origin config                               | Ed25519 signed-origin validation and channel/ref validation fail closed before the webview is created                                     | `apps/desktop/src-tauri/src/origin.rs`                                 |
| Unsigned native update path                                | Updater plugin is absent in Phase 3; later auto-update requires separate signing evidence                                                 | `docs/release/desktop-update-policy.md`                                |
| Sensitive data in desktop logs                             | Desktop log allow-list excludes document names, text, snippets, tokens, cookies, and private URLs                                         | `docs/security/desktop-cache-policy.md`                                |

## Stop Conditions

Stop desktop implementation if any change:

- stores document bytes, matter records, search results, AI context, or audit rows locally;
- caches authenticated `/v1/*`, document, search, audit, records, AI, or external portal responses;
- introduces native file, clipboard, share sheet, mail compose, or external handoff behavior outside server-approved flows;
- records private endpoints, account IDs, secrets, cookies, tokens, or customer data in repo docs or logs;
- moves permission, audit, tenant, search, AI, or records authority into the desktop layer.
