# 12. LC-DESKTOP-03 Candidate Import Map

Date: 2026-06-21
Candidate source: `/Users/jws/Projects/amic-vault-desktop-pwa`
Candidate branch: `codex/desktop-tauri-phase3`
Candidate HEAD: `3e9d6cc3d0a405e31a37556f1813b1587bdc91ee`

> Current-state note, 2026-06-22: this map is pre-import planning evidence.
> The live checkout now contains `apps/desktop`; use this file only to
> understand the original import boundary, not as current work remaining.

## 1. Purpose

The existing candidate branch is broader than LC-DESKTOP-03. This import map defines how to reuse it without mixing later LC work into the Tauri foundation PR.

LC-DESKTOP-03 may import the Tauri thin-shell implementation subset after the dependency gate is approved. It must not import release-gate, app-runner, ledger, production evidence, or unrelated documentation changes in the same LC.

## 2. Candidate Files By LC

### Import In LC-DESKTOP-03

These files are the primary Tauri foundation candidate:

- `apps/desktop/README.md`
- `apps/desktop/package.json`
- `apps/desktop/tsconfig.json`
- `apps/desktop/src-tauri/Cargo.lock`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/build.rs`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/desktop-shell/index.html`
- `apps/desktop/src-tauri/icons/icon.png`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/main.rs`
- `apps/desktop/src-tauri/src/origin.rs`
- `apps/desktop/src-tauri/config/local.signed.json`
- `apps/desktop/src-tauri/capabilities/vault-thin-shell.json`
- `apps/desktop/tests/desktop-tauri-policy.spec.ts`
- `apps/desktop/tools/validate-tauri-policy.mjs`
- `pnpm-lock.yaml` changes required by the desktop package only

Although `origin.rs` and `vault-thin-shell.json` overlap with LC-DESKTOP-04 and LC-DESKTOP-05 themes, they are part of the candidate's minimum safe scaffold: no window is created before signed origin config validation, and the capability allow-list is empty. LC-DESKTOP-04 and LC-DESKTOP-05 should still run afterward as hardening/evidence goals, even if they require little or no production-code change.

### Reserve For LC-DESKTOP-04

These candidate parts are relevant to origin guard verification and should be reviewed or extended in LC-DESKTOP-04:

- `apps/desktop/src-tauri/src/origin.rs`
- `apps/desktop/src-tauri/config/local.signed.json`
- origin-related tests in `apps/desktop/tests/desktop-tauri-policy.spec.ts`
- any non-secret refinement to `docs/release/desktop-origin-policy.md`

LC-DESKTOP-04 should add or confirm negative cases for missing config, tampered signature, HTTP staging, invalid channel, non-origin URL, credentials in URL, and unknown scheme.

### Reserve For LC-DESKTOP-05

These candidate parts are relevant to capability-deny verification and should be reviewed or extended in LC-DESKTOP-05:

- `apps/desktop/src-tauri/capabilities/vault-thin-shell.json`
- capability tests in `apps/desktop/tests/desktop-tauri-policy.spec.ts`
- `apps/desktop/tools/validate-tauri-policy.mjs`

LC-DESKTOP-05 should confirm the policy checker fails if a native permission is added without a later ADR reference.

### Reserve For LC-DESKTOP-07

These files belong to signing/updater documentation, not LC-DESKTOP-03:

- `docs/release/desktop-signing-plan.md`
- `docs/release/desktop-update-policy.md`

They should be imported or rewritten during LC-DESKTOP-07 after LC-DESKTOP-03 through LC-DESKTOP-06 have established the shell and security evidence.

### Reserve For LC-DESKTOP-08 Or Later

These candidate changes touch release evidence, launch checks, or operator tooling and should not be imported during LC-DESKTOP-03:

- `docs/release/evidence-register.md`
- `docs/release/launch-readiness-pack.md`
- `tools/release/check-launch-readiness.mjs`
- `tools/release/check-launch-execution.mjs`
- `docs/ledger/execution.md`

They belong to a later release-gate LC after the desktop shell, origin guard, capability denial, auth/audit/no-local-storage validation, and signing/update docs are complete.

### Do Not Import Without Separate Approval

These candidate files are useful locally but outside the current LC-DESKTOP-03 scope:

- `.codex/environments/environment.toml`
- `script/build_and_run.sh`
- `.gitignore` changes unrelated to generated Tauri outputs

If a helper runner is needed later for manual QA, it should be added as its own explicit LC artifact with bounded commands and evidence.

## 3. Dependency Import Notes

Expected approved dependencies from the candidate:

### Node

- `@tauri-apps/api`
- `@tauri-apps/cli`

### Rust

- `tauri`
- `tauri-build`
- `anyhow`
- `base64`
- `ed25519-dalek`
- `serde`
- `serde_json`
- `url`
- `tempfile`

No Electron, local database, vector store, embedding package, AI/LLM client, search engine, storage client, M365/Outlook package, mail package, or external sharing package is expected.

## 4. LC-DESKTOP-03 Import Procedure

After the operator approves the dependency gate:

1. Create or switch to branch `feat/desktop-tauri-foundation` from the approved planning baseline.
2. Import only the LC-DESKTOP-03 file set above.
3. Re-run candidate checks in the active branch:

```bash
pnpm install --frozen-lockfile
pnpm --filter @amic-vault/desktop validate
pnpm --filter @amic-vault/desktop test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm lint
pnpm typecheck
git diff --check
```

4. Run the LC-DESKTOP-03 secret scan:

```bash
rg -n "(AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY|xox[baprs]-|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|arn:aws:[^ ]+|https://[^ )]+amazonaws)" apps/desktop pnpm-lock.yaml || true
```

5. Record:
   - `.omo/evidence/LC-DESKTOP-03/executor.md`
   - `.omo/evidence/LC-DESKTOP-03/manual-qa.md`
   - `.omo/evidence/LC-DESKTOP-03/review.md`
   - `.omo/evidence/LC-DESKTOP-03/gate-review.md`

## 5. Import Stop Conditions

Do not import the candidate if:

- dependency gate approval is missing;
- `.codex`, helper script, release evidence, launch checker, or ledger changes would be pulled in with the foundation scaffold;
- Electron or a prohibited dependency appears;
- any private origin, token, cookie, account ID, signing secret, or customer data appears;
- `docs/package/**` changes;
- native permissions are opened beyond the empty `vault-thin-shell` policy.

## 6. Current Decision

The candidate was approved for reuse only after the LC-DESKTOP-03 dependency gate. In the current checkout this map is documentation of the approved import boundary; it is not an open instruction to import more files.
