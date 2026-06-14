# AMIC Vault Desktop

Status: Phase 3 feasibility scaffold.

This package is a Tauri v2 thin shell for the approved AMIC Vault web origin. It
does not store tenant data, matter data, document bytes, search indexes, AI
context, audit rows, session tokens, or private endpoint values.

## Local Run Contract

The shell refuses to start unless `AMIC_VAULT_DESKTOP_ORIGIN_CONFIG` points to a
signed origin config. The committed local fixture is:

```bash
apps/desktop/src-tauri/config/local.signed.json
```

That fixture opens only `http://localhost:3000/dashboard?source=tauri`.

## Native Capability Policy

`src-tauri/capabilities/vault-thin-shell.json` intentionally grants no native
permissions. File system, shell, dialog, clipboard, share, updater, and local
storage authority stay closed until a later ADR, threat-model delta, and release
gate open them.

## Commands

```bash
pnpm --filter @amic-vault/desktop validate
pnpm --filter @amic-vault/desktop test
pnpm --filter @amic-vault/desktop tauri:build
```

`tauri:build` requires Rust/Cargo and the macOS build toolchain.
