# Desktop Signing Plan

Status: PREPARED - NO SIGNING SECRETS COMMITTED
Date: 2026-06-14

## Scope

This plan covers the optional Tauri thin shell only. Server production release,
browser/PWA release, and AWS runtime deployment remain governed by the existing
release runbooks.

## Signing Inputs

| Input                                | Storage Rule                                     |
| ------------------------------------ | ------------------------------------------------ |
| Apple Developer Team ID              | Evidence ref only, not account metadata          |
| Developer ID Application certificate | Secret manager or local keychain only            |
| Notarization credentials             | Secret manager or local keychain only            |
| Windows code-signing certificate     | Secret manager or signing service only           |
| Desktop origin signing private key   | Offline signer or secret manager only            |
| Signed origin config                 | May be packaged only after evidence ref approval |

Do not commit signing secrets. No certificate, private key, notarization
password, account ID, private endpoint, or customer data may be committed to the
repository.

## macOS Procedure

1. Build from an approved git SHA.
2. Verify `pnpm --filter @amic-vault/desktop validate` and
   `pnpm --filter @amic-vault/desktop test`.
3. Build Tauri app bundle with the signed origin config for the approved
   release channel.
4. Sign the `.app` with Developer ID Application in an external signing context.
5. Notarize and staple the notarization ticket.
6. Record only SHA, bundle hash, signer evidence ref, notarization evidence ref,
   origin config evidence ref, and smoke/UAT evidence refs.

## Windows Procedure

Windows packaging remains feasibility-only in Phase 3. Before producing a
customer installer, create a separate Windows distribution runbook with signing
service refs, installer hash refs, and rollback instructions.

## Release Gate

Desktop artifact approval is distinct from server production approval. A server
release approval does not authorize a signed desktop installer.
