# AMIC Vault Desktop

Status: Thin-shell runtime candidate. External signing, channel approval, and
customer distribution evidence remain separate release decisions.

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

## Approved Domain Contract

Non-local desktop channels load the existing approved AMIC Vault domain through a
signed origin config. Do not commit customer domains, private endpoints, signing
keys, certificates, tokens, cookies, or generated non-local configs.

Allowed channels:

- `staging`: `originRef` starts with `STAGE-`, origin is public HTTPS.
- `pilot`: `originRef` starts with `PILOT-`, origin is public HTTPS.
- `production`: `originRef` starts with `PROD-`, origin is public HTTPS.

Before launching or packaging a desktop candidate, verify the signed config
outside source control:

```bash
pnpm --filter @amic-vault/desktop origin:verify -- /path/to/signed-origin.json
AMIC_VAULT_DESKTOP_ORIGIN_CONFIG=/path/to/signed-origin.json pnpm --filter @amic-vault/desktop tauri:dev
```

The verifier prints only a success/failure status. It must not print the
approved origin value.

## Native Capability Policy

`src-tauri/capabilities/vault-thin-shell.json` intentionally grants no native
permissions. File system, shell, dialog, clipboard, share, updater, and local
storage authority stay closed until a later ADR, threat-model delta, and release
gate open them.

## Commands

```bash
pnpm --filter @amic-vault/desktop validate
pnpm --filter @amic-vault/desktop origin:verify -- apps/desktop/src-tauri/config/local.signed.json
pnpm --filter @amic-vault/desktop test
pnpm --filter @amic-vault/desktop tauri:build
```

`tauri:build` requires Rust/Cargo and the macOS build toolchain.
