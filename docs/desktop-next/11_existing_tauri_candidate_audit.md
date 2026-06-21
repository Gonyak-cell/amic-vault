# 11. Existing Tauri Candidate Audit

Date: 2026-06-21
Candidate worktree: `/Users/jws/Projects/amic-vault-desktop-pwa`
Candidate branch: `codex/desktop-tauri-phase3`
Candidate HEAD: `3e9d6cc3d0a405e31a37556f1813b1587bdc91ee`

## 1. Purpose

This document records the read-only audit of an existing Tauri thin-shell candidate branch. It does not approve merging the candidate into the active LazyCodex desktop lane. LC-DESKTOP-03 still requires explicit dependency-gate approval before dependency or scaffold changes are imported into the active branch.

## 2. Candidate Contents

The candidate branch already contains:

- `apps/desktop/package.json`
- `apps/desktop/README.md`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/Cargo.lock`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/src/main.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/origin.rs`
- `apps/desktop/src-tauri/capabilities/vault-thin-shell.json`
- `apps/desktop/src-tauri/config/local.signed.json`
- `apps/desktop/tests/desktop-tauri-policy.spec.ts`
- `apps/desktop/tools/validate-tauri-policy.mjs`
- `docs/release/desktop-signing-plan.md`
- `docs/release/desktop-update-policy.md`

## 3. Dependency Snapshot

The candidate desktop package uses:

- `@tauri-apps/api`
- `@tauri-apps/cli`
- Rust crates: `tauri`, `tauri-build`, `anyhow`, `base64`, `ed25519-dalek`, `serde`, `serde_json`, `url`, `tempfile`

The candidate does not include Electron, local database, vector store, embedding, AI/LLM client, search engine, storage client, M365/Outlook, mail, or external sharing packages in `apps/desktop/package.json` or `apps/desktop/src-tauri/Cargo.toml`.

## 4. Security Shape

Observed candidate properties:

- The desktop README states the package is a Tauri v2 thin shell and not a local Vault runtime.
- `tauri.conf.json` has no default app windows; the window is created after origin config validation.
- The shell loads an external webview URL generated from `OriginConfig`.
- Origin config is loaded from `AMIC_VAULT_DESKTOP_ORIGIN_CONFIG`.
- The local fixture is `LOCAL-DEV` and points to `http://localhost:3000`.
- Origin config signature verification uses Ed25519.
- Staging and production origins must use HTTPS and non-local hosts.
- Capability file `vault-thin-shell.json` has an empty `permissions` array.
- Updater is not enabled in the candidate.

## 5. Verification Commands Run

```bash
pnpm --filter @amic-vault/desktop validate
pnpm --filter @amic-vault/desktop test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
rg -n "(AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY|xox[baprs]-|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|arn:aws:[^ ]+|https://[^ )]+amazonaws|account id|private endpoint|customer data|cookie|token)" apps/desktop docs/release/desktop-signing-plan.md docs/release/desktop-update-policy.md || true
git status --short
```

## 6. Verification Results

- `pnpm --filter @amic-vault/desktop validate`: PASS. Output reported `Desktop Tauri policy verified.`
- `pnpm --filter @amic-vault/desktop test`: PASS. Vitest reported 1 file and 3 tests passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: PASS. Rust tests reported 3 passed.
- Secret/policy scan: no credential-shaped secrets found. Matches were policy-language mentions of forbidden tokens/cookies/private endpoints plus the dependency name `cookie` in `Cargo.lock`.
- Candidate worktree status after verification: clean.

## 7. Reuse Recommendation

After operator approval of the LC-DESKTOP-03 dependency gate, use `codex/desktop-tauri-phase3` as the primary implementation candidate rather than creating a new scaffold from scratch.

Before import or merge, re-run:

```bash
pnpm --filter @amic-vault/desktop validate
pnpm --filter @amic-vault/desktop test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm lint
pnpm typecheck
git diff --check
```

Then verify the candidate against the stricter LC-DESKTOP-03 brief:

- all dependency additions are listed in executor evidence;
- `docs/package/**` remains unchanged;
- no private origin or signing secret is committed;
- native capabilities remain closed by default;
- no server permission, audit, search, AI, or storage authority moves into desktop.

## 8. Current Gate State

This audit proves a candidate exists and passes its own policy checks. It does not complete LC-DESKTOP-03 because the active LazyCodex branch has not imported the scaffold and dependency approval is still pending.
