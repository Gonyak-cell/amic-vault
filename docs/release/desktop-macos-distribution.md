# Desktop macOS Distribution

Date: 2026-06-21
Status: PREPARED

## Distribution Shape

The initial macOS artifact is a signed and notarized `.app` bundle, optionally wrapped in a DMG or MDM package after IT approval.

The app is a Tauri thin shell. It does not include a local Vault database, local document cache, local search index, AI runtime, file sync engine, or server-side authority.

## Required Build Evidence

- approved git SHA;
- `pnpm --filter @amic-vault/desktop validate`;
- `pnpm --filter @amic-vault/desktop test`;
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`;
- `pnpm --filter @amic-vault/desktop tauri:build`;
- `node tools/release/check-desktop-capabilities.mjs`;
- `node tools/release/check-desktop-local-storage.mjs`;
- artifact SHA-256 digest.

## Signing And Notarization

1. Sign with Developer ID Application from an external signing context.
2. Use hardened runtime.
3. Keep entitlements minimal and documented.
4. Submit to Apple notarization.
5. Staple notarization ticket.
6. Verify the stapled app on a clean macOS host.

## Entitlement Policy

Default entitlements must not include:

- file provider;
- automation;
- camera;
- microphone;
- contacts;
- calendar;
- Bluetooth;
- USB;
- full disk access;
- broad file read/write;
- shell execution.

Any entitlement expansion requires an ADR, threat-model delta, and new tests.

## Install And Uninstall

Pilot validation must verify:

- app installs without admin-only assumptions unless IT approves;
- app launches only with approved signed origin config;
- missing or invalid config blocks startup;
- uninstall removes only the desktop shell artifact;
- server data, audit events, permissions, and browser/PWA access remain unchanged.

## Rollback

Rollback is browser/PWA first. If a macOS package is recalled, record artifact digest and reason code, remove distribution, and direct users to the browser/PWA.
