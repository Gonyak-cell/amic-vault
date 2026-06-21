# Desktop Native Distribution Evidence Worksheet

Date: 2026-06-21
Status: TEMPLATE - EXTERNAL REFS REQUIRED BEFORE PILOT OR PRODUCTION

## Purpose

This worksheet defines the non-secret evidence required before an AMIC Vault
native desktop artifact can move from staging RC closeout to pilot or production
distribution.

The repository copy is a template. Completed customer, provider, signing,
notarization, endpoint, ticket, screenshot, and installer evidence must stay in
the external evidence workspace. Repo-tracked updates may record reference IDs,
sha256 digests, pass/fail counters, owner roles, and release decisions only.

## Scope Boundary

Desktop native distribution approval does not authorize API, web, worker,
database, storage, search, records, AI, traffic, tenant, or server production
changes.

The desktop app remains a thin shell over an approved Vault web origin. Server
auth, PermissionService, AuditService, document storage, search, records, and AI
policy remain authoritative.

## Candidate Identity

| Field | Required value | Status |
|---|---|---|
| Release evidence ID | `EV-DESKTOP-*` row for this candidate | PENDING |
| Source commit | Approved git SHA or release ref | PENDING |
| Source PR or tag | PR, tag, or release ref | PENDING |
| App version | Desktop app version | PENDING |
| Release channel | staging, pilot, or production | PENDING |
| Approved origin ref | Evidence ref only, no raw endpoint | PENDING |
| Server production deploy coupled? | Must be `NO` | PENDING |

## Artifact Identity

| Field | Required value | Status |
|---|---|---|
| Artifact type | `.app`, DMG, PKG, MSIX, MSI, signed installer, or IT-managed package | PENDING |
| Artifact digest | `sha256:<64 hex chars>` | PENDING |
| Digest evidence ref | `DESKTOP-ARTIFACT-DIGEST-REF` or successor | PENDING |
| Signature evidence ref | `DESKTOP-ARTIFACT-SIGNATURE-REF` or successor | PENDING |
| Signing material custody ref | External custody ref only | PENDING |
| Artifact storage or delivery ref | External ref only, no private URL | PENDING |
| Rebuild supersession ref | Required if artifact is rebuilt | PENDING |

## Platform Evidence

| Platform | Required evidence | Status |
|---|---|---|
| macOS | Developer ID signature ref, hardened runtime ref, entitlement review ref, notarization ref, stapling verification ref, Gatekeeper smoke ref | PENDING WHEN MACOS ARTIFACT EXISTS |
| Windows | Signing ref, installer/package type ref, install ref, uninstall ref, SmartScreen/customer IT note ref | PENDING WHEN WINDOWS ARTIFACT EXISTS |
| Managed IT distribution | Customer or internal IT packaging ref, deployment scope ref, rollback owner ref | PENDING WHEN MANAGED DISTRIBUTION EXISTS |

## Verification Receipts

| Check | Required receipt | Status |
|---|---|---|
| Desktop release gate | `pnpm desktop:release-gate` | PENDING |
| Desktop release gate self-test | `pnpm desktop:release-gate -- --self-test` | PENDING |
| Desktop package validation | `pnpm --filter @amic-vault/desktop validate` | PENDING |
| Desktop tests | `pnpm --filter @amic-vault/desktop test` | PENDING |
| Tauri/Rust tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | PENDING |
| Native build | `pnpm --filter @amic-vault/desktop tauri:build` or platform-specific approved build ref | PENDING |
| Capability denial | `node tools/release/check-desktop-capabilities.mjs` | PENDING |
| Local storage marker scan | `node tools/release/check-desktop-local-storage.mjs` | PENDING |
| Staging smoke | Desktop/auth smoke ref with pass/fail/skip counters | PENDING |
| DMS smoke | DMS synthetic or approved DMS smoke ref with pass/fail/skip counters | PENDING |

## Customer Or Internal IT Acceptance

| Acceptance item | Required ref | Status |
|---|---|---|
| Install validation | External install ref | PENDING |
| Launch approved origin | External launch ref, no raw private URL | PENDING |
| Logout/session validation | External auth ref | PENDING |
| No local document/search/AI/audit cache | External marker-scan ref | PENDING |
| Uninstall validation | External uninstall ref | PENDING |
| Browser/PWA fallback validation | `DESKTOP-ROLLBACK-BROWSER-FALLBACK-REF` or successor | PENDING |
| Support owner | Owner group or role ref | PENDING |
| Rollback owner | Owner group or role ref | PENDING |

## Release Decision

| Decision field | Required value | Status |
|---|---|---|
| Decision | `HOLD`, `APPROVE_PILOT`, `APPROVE_PRODUCTION`, or `ROLLBACK` | HOLD |
| Decision owner | Operator/security/customer IT owner role refs | PENDING |
| Decision timestamp | External ref timestamp | PENDING |
| Release scope | Channel, tenant class, and distribution scope refs only | PENDING |
| Explicit exclusions | Server production deploy, updater enablement, native capability expansion, local Vault runtime | REQUIRED |
| Rollback ref | `RB-DESKTOP-NATIVE-*` and browser/PWA fallback ref | PENDING |

## Stop Conditions

Stop distribution if any of these are true:

- artifact digest is missing or does not match;
- signature, notarization, or platform signing evidence is missing for a
  customer-distributed artifact;
- origin evidence is a raw private endpoint instead of an approved ref;
- updater is enabled without signed manifest, matching channel, digest
  validation, rollback evidence, and security approval;
- native capabilities are widened without ADR approval;
- local document, search, AI, audit, token, cookie, endpoint, account, or
  customer-data markers appear in app storage, logs, screenshots, or evidence;
- server production deploy is coupled to desktop artifact release;
- browser/PWA fallback is unavailable.

## Evidence Hygiene

Do not commit private endpoints, cloud account IDs, ARNs, cookies, tokens,
signing secrets, provider metadata, customer names, customer domains, document
names, document snippets, screenshots with private URLs, installer download
URLs, certificate exports, local storage dumps, or raw customer IT tickets.
