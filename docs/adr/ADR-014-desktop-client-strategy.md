# ADR-014: Desktop Client Strategy

Status: Proposed

Source: post-R14 launch planning. Trace: DEC-01, DEC-03, DEC-04, DEC-09, DEC-11, DEC-14, DEC-17, DEC-18.

## Context

AMIC Vault is currently a Next.js web client, NestJS API, PostgreSQL RLS, MinIO/S3-compatible storage, and Python ingestion worker system. The release lane has completed R14 technical preparation and AWS staging evidence, while production execution remains a separate controlled runbook step.

Law-firm desktop distribution is useful for discoverability, operator trust, managed updates, and customer IT packaging. It must not create a second source of truth, store confidential documents locally, bypass server-side permissions, or weaken audit-by-default behavior.

Desktop packaging also cannot change the core deployment decision: Vault remains a private-region, containerized server system with on-prem portability. The desktop client is an access surface over the server, not an embedded Vault runtime.

## Decision

Adopt a PWA-first desktop strategy, with an optional Tauri v2 thin shell only when installer-grade distribution is required.

1. The first desktop milestone is an installable PWA built from `apps/web`.
2. The PWA may cache only static app-shell assets required for load performance and installability.
3. Sensitive API responses, document bodies, previews, downloads, search results, AI citations, audit rows, and launch evidence must remain network-bound and `no-store`.
4. If a native installer is required, create `apps/desktop` as a Tauri v2 thin shell that loads an approved Vault web origin.
5. The Tauri shell must not bundle the NestJS API, PostgreSQL, MinIO, ingestion worker, search index, vector store, model gateway, or any local document database.
6. Native capabilities are disabled by default and opened only through explicit allow-listed capabilities with tests.
7. Electron is not the default desktop path. It remains a fallback only if a future required OS integration is impractical in Tauri.

## Options Considered

### Option A: PWA-only

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Security surface | Lowest |
| Existing-code reuse | Highest |
| Installer control | Limited |
| Enterprise IT packaging | Medium |

Pros:

- Reuses `apps/web` without a second UI codebase.
- Keeps all permission, audit, tenant, and AI policy decisions on the server.
- Minimizes local storage and native attack surface.
- Ships quickest for controlled pilot users.

Cons:

- Install and update controls depend on browser/OS PWA behavior.
- Less useful where customer IT requires signed desktop installers.
- Limited native OS integration.

### Option B: Tauri thin shell over hosted Vault

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Security surface | Low to medium |
| Existing-code reuse | High |
| Installer control | High |
| Enterprise IT packaging | High |

Pros:

- Provides signed macOS/Windows installers while preserving the hosted Vault architecture.
- Smaller runtime footprint than Electron.
- Capability-based native API exposure can keep the shell narrow.
- Can support enterprise conveniences such as deep links, managed update policy, and app identity.

Cons:

- Adds signing, notarization, updater, and OS QA obligations.
- Remote webview/native capability boundaries need careful testing.
- Same-origin/session behavior must be verified across browser and webview runtimes.

### Option C: Electron client

| Dimension | Assessment |
|---|---|
| Complexity | Medium to high |
| Security surface | Medium to high |
| Existing-code reuse | High |
| Installer control | High |
| Enterprise IT packaging | High |

Pros:

- Mature packaging ecosystem and broad OS integration.
- Can reuse web UI.

Cons:

- Larger runtime and patch surface.
- Requires strict sandbox, context isolation, preload IPC controls, and dependency monitoring.
- Harder to justify for a document vault unless a specific OS integration requires it.

### Option D: Fully native or Flutter client

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Security surface | Medium |
| Existing-code reuse | Low |
| Installer control | High |
| Enterprise IT packaging | High |

Pros:

- Full native UX and managed distribution.

Cons:

- Reimplements the existing Next.js UI surface.
- Doubles product QA and permission/audit regression coverage.
- Not justified for the current release/pilot path.

## Consequences

- The web app remains the product UI source of truth.
- Desktop work is gated as a release-hardening lane, not as a new product runtime.
- The first implementation should add PWA manifest/service-worker behavior and cache-control tests before any native shell.
- A Tauri shell may follow only after the PWA passes security, offline, installability, and staging smoke checks.
- Any local file association, folder watch, scanner import, or offline queue feature requires a separate ADR because it changes the threat model.

## Guardrails

- No local document body cache.
- No local full-text, vector, graph, or AI index.
- No local database containing tenant, matter, document, audit, or AI evidence rows.
- No desktop-native route that calls storage, worker, model, search, or document APIs without server authentication and PermissionService evaluation.
- No native download/open behavior unless `DOCUMENT_DOWNLOADED` or `DOCUMENT_VIEWED` audit semantics remain server-authoritative.
- No external model route changes.
- No `docs/package/` modification.

## Review Triggers

Revisit this ADR if:

- a customer contract requires offline document access,
- a customer IT policy requires a signed desktop installer before pilot,
- OS-level DMS/scanner/file-association integration becomes mandatory,
- live IdP SSO/SAML behavior evolves beyond the R13 reference-only provider registry baseline,
- production incident review finds webview/PWA session behavior insufficient.
