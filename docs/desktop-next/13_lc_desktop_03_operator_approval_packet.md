# 13. LC-DESKTOP-03 Operator Approval Packet

Date: 2026-06-21
Decision requested: approve or reject the dependency gate for LC-DESKTOP-03.

> Current-state note, 2026-06-22: this approval packet is historical. The
> current checkout already contains the desktop scaffold and later desktop
> security tests. Keep this file as the dependency-gate record, not as a pending
> operator decision.

## 1. Decision Text

To approve LC-DESKTOP-03 implementation, reply with exactly:

```text
Approve LC-DESKTOP-03 dependency gate for a minimal Tauri v2 thin-shell scaffold: yes.
```

To reject or pause, reply with:

```text
Approve LC-DESKTOP-03 dependency gate for a minimal Tauri v2 thin-shell scaffold: no.
```

Default until explicit approval: no dependency changes and no active-branch `apps/desktop` scaffold import.

## 2. Why Approval Is Required

LC-DESKTOP-03 is the first step that changes dependencies and creates a native desktop package. AMIC Vault `AGENTS.md` says new package additions are allowed only when PACK/TUW scope explicitly permits them or when the issue is escalated. The desktop-next plan now defines the intended Tauri dependency gate, but the implementation should not proceed until the operator or reviewer approves this dependency family.

## 3. What Approval Allows

Approval allows importing the LC-DESKTOP-03 subset from the verified candidate branch:

- Candidate worktree: `/Users/jws/Projects/amic-vault-desktop-pwa`
- Candidate branch: `codex/desktop-tauri-phase3`
- Candidate HEAD: `3e9d6cc3d0a405e31a37556f1813b1587bdc91ee`

Allowed import subset:

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

## 4. What Approval Does Not Allow

Approval does not allow importing unrelated candidate changes:

- `.codex/environments/environment.toml`
- `.gitignore` changes unrelated to generated Tauri outputs
- `script/build_and_run.sh`
- `docs/ledger/execution.md`
- `docs/release/evidence-register.md`
- `docs/release/launch-readiness-pack.md`
- `tools/release/check-launch-readiness.mjs`
- `tools/release/check-launch-execution.mjs`
- release-gate behavior changes
- server API, permission, audit, search, AI, records, storage, auth, database, or worker changes

Signing and updater docs from the candidate are reserved for LC-DESKTOP-07:

- `docs/release/desktop-signing-plan.md`
- `docs/release/desktop-update-policy.md`

## 5. Approved Dependency Family

If approved, LC-DESKTOP-03 may include only these observed dependency families.

Node:

- `@tauri-apps/api`
- `@tauri-apps/cli`

Rust:

- `tauri`
- `tauri-build`
- `anyhow`
- `base64`
- `ed25519-dalek`
- `serde`
- `serde_json`
- `url`
- `tempfile`

Disallowed:

- Electron
- local databases
- vector stores
- embedding packages
- AI or LLM clients
- search engines
- storage clients used directly by desktop
- M365, Outlook, mail, external sharing, scanner, OCR, folder watch, or local AI packages

## 6. Evidence Already Collected

Candidate verification already passed read-only:

```bash
pnpm --filter @amic-vault/desktop validate
pnpm --filter @amic-vault/desktop test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Results:

- Desktop policy validator passed.
- Vitest passed 3 tests.
- Cargo passed 3 Rust tests.
- Candidate worktree remained clean.
- Secret scan found no credential-shaped secret; matches were policy-language references and dependency names.

Evidence files:

- `.omo/evidence/LC-DESKTOP-03/dependency-gate.md`
- `.omo/evidence/LC-DESKTOP-03/candidate-audit.md`
- `.omo/evidence/LC-DESKTOP-03/import-map.md`

## 7. Checks Required After Approval

After importing the approved subset into the active branch, rerun:

```bash
pnpm install --frozen-lockfile
pnpm --filter @amic-vault/desktop validate
pnpm --filter @amic-vault/desktop test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm lint
pnpm typecheck
git diff --check
git diff --name-only -- docs/package
```

Manual QA must verify:

- missing approved-origin config fails closed or renders only a non-sensitive safe state;
- no local server, database, worker, storage, search, vector, AI, or document store starts;
- no Electron dependency appears;
- native capability policy remains empty.

## 8. Gate Review Position

Historical recommendation: APPROVE, limited to the import subset and dependency family above.

Rationale:

- the candidate is already implemented and verified in a separate worktree;
- it matches the PWA-first plus optional Tauri thin-shell strategy;
- it does not move server authority to desktop;
- it has an empty native capability policy;
- it uses signed local-origin config validation;
- the import map prevents broader release/evidence/helper-script changes from leaking into LC-DESKTOP-03.
