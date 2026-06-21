# Desktop Signing Plan

Date: 2026-06-21
Status: PREPARED - NO SIGNING SECRETS IN REPO

## Scope

This plan covers the optional Tauri thin shell only. Server production release, browser/PWA release, database migration, and AWS runtime deployment remain governed by their existing release runbooks.

Desktop artifact approval is separate from server production approval. A server deploy approval does not authorize a signed desktop installer, and a desktop pilot approval does not authorize server production rollout.

## Signing Material Custody

| Material | Custody rule | Repo rule |
|---|---|---|
| Apple Developer ID Application certificate | macOS keychain, signing service, or enterprise secret manager | Do not commit. Record evidence ref only. |
| Apple notarization credential | App Store Connect keychain profile or enterprise secret manager | Do not commit. Record evidence ref only. |
| Windows code-signing certificate | HSM-backed signing service or enterprise secret manager | Do not commit. Record evidence ref only. |
| Desktop origin signing private key | Offline signer or enterprise secret manager | Do not commit. Record key evidence ref only. |
| Signed origin config | Generated per channel after approval | Commit only non-secret local fixture; package non-local configs by evidence ref. |
| Update signing key | Disabled until updater ADR and policy are approved | Do not commit. Record evidence ref only. |

Never commit private keys, certificate exports, passwords, API tokens, cookie values, private endpoints, cloud account IDs, ARNs, customer names, customer domains, or customer data.

## macOS Signing Flow

1. Build from an approved git SHA.
2. Run desktop verification:
   - `pnpm --filter @amic-vault/desktop validate`
   - `pnpm --filter @amic-vault/desktop test`
   - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
   - `pnpm --filter @amic-vault/desktop tauri:build`
3. Verify `apps/desktop/src-tauri/capabilities/vault-thin-shell.json` has `permissions: []`.
4. Package only the approved channel origin config evidence ref. Do not write non-local origin values into tracked source.
5. Sign the `.app` with Developer ID Application in an external signing context.
6. Enable hardened runtime with minimal entitlements:
   - no file provider entitlement;
   - no arbitrary network client entitlement beyond normal webview access;
   - no automation, camera, microphone, contacts, calendar, Bluetooth, USB, or full-disk entitlements;
   - no app sandbox relaxation unless a later ADR approves it.
7. Notarize the signed app.
8. Staple the notarization ticket.
9. Record only:
   - git SHA;
   - app version;
   - artifact digest;
   - signer evidence ref;
   - notarization evidence ref;
   - origin config evidence ref;
   - verification command receipts.

## Windows Signing Flow

Windows remains a documented distribution path until a pilot requires a Windows artifact. Before customer distribution:

1. Choose MSIX, MSI, or enterprise-managed installer in `desktop-windows-distribution.md`.
2. Build from an approved git SHA.
3. Sign with an HSM-backed signing service or enterprise secret manager.
4. Pin artifact digest and signing evidence ref.
5. Validate installation, uninstall, and rollback on a clean Windows test host.
6. Record only evidence refs and digests.

## Digest Pinning

Every desktop artifact must have a SHA-256 digest recorded before handoff. The digest is the stable artifact identity for IT approval, rollback, and incident response.

Digest records must not include private URLs, secret names, customer data, account IDs, or raw certificate material.

## Rollback

The default rollback is browser/PWA. If a signed desktop artifact is rejected or recalled:

1. withdraw the desktop package from the release channel;
2. instruct users to use the browser/PWA origin;
3. preserve server-side access, audit, and permission behavior;
4. record recalled artifact digest and reason code only.

## Release Gate

Signing is blocked unless all are true:

- source SHA is approved;
- capability checker passes;
- origin policy evidence ref is approved;
- artifact digest is recorded;
- signing material custody is outside the repo;
- rollback to browser/PWA is available.
