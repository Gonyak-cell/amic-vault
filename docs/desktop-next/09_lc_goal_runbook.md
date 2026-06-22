# 09. LC Desktop Goal Runbook

Date: 2026-06-21
Scope: Detailed LazyCodex goal plan for LC-DESKTOP-00 through LC-DESKTOP-07.
Active top-level goal: complete the AMIC Vault LazyCodex desktop execution lane from LC-DESKTOP-00 through LC-DESKTOP-07 in order.

> Current-state note, 2026-06-22: this runbook is historical lane control
> evidence. The live checkout now includes `apps/desktop`, Tauri origin and
> capability controls, desktop tests, and release-gate tooling. Instructions
> below that say `apps/desktop` is absent describe the pre-import state only.

## 1. Continuation Contract

This runbook is the control surface for continuing desktop work. The active goal is not complete until LC-DESKTOP-00 through LC-DESKTOP-07 all have:

- an isolated branch or explicitly documented local setup step;
- changed files limited to the LC scope;
- verification commands recorded;
- manual QA evidence recorded under `.omo/evidence/<lc-id>/`;
- code-review or document-review evidence where relevant;
- gate-review evidence or an explicit operator approval note;
- no unresolved stop condition.

When one LC finishes, the next LC starts automatically unless a stop condition applies. Stop only for:

- missing external secret, signing credential, platform prerequisite, or customer decision;
- dependency approval not yet recorded;
- AMIC Vault constitution conflict;
- repeated validation failure after root-cause attempts;
- dirty worktree conflict that cannot be isolated without user decision.

## 2. Shared Evidence Shape

Each LC evidence directory should contain:

| File | Purpose |
|---|---|
| `executor.md` | What changed, exact commands, outputs summarized, result. |
| `manual-qa.md` | Surface scenarios, invocations, artifacts, verdicts. |
| `review.md` | Read-only review findings or document-review summary. |
| `gate-review.md` | Final approve/reject decision for that LC. |
| `artifacts/` | Screenshots, logs, command transcripts, marker scans, or generated fixtures. |

For document-only LC goals, `review.md` and `gate-review.md` may be a concise self-contained review artifact if an external LazyCodex reviewer is unavailable. For implementation goals, a dedicated read-only review is required before merge.

## 3. LC-DESKTOP-00 - Clean Desktop Worktree

### Objective

Create and verify an isolated worktree for desktop work so unrelated LAI, UI, production, or Outlook changes do not pollute desktop PRs.

### Branch

No PR branch is required if this is pure local setup. The first branch created in the worktree is `docs/desktop-next-lazycodex-plan`.

### Inputs

- Source checkout: `/Users/jws/Projects/amic-vault`
- Target worktree: `/Users/jws/Projects/amic-vault-desktop-lazycodex`
- Base: current `origin/main`

### Steps

1. Inspect source checkout status and branch.
2. Fetch `origin/main`.
3. Confirm target worktree path is absent or safe to reuse.
4. Create the target worktree from `origin/main`.
5. Record branch, SHA, remote, and source dirty state.

### Commands

```bash
git status --short
git branch --show-current
git fetch origin main
git worktree add -b docs/desktop-next-lazycodex-plan /Users/jws/Projects/amic-vault-desktop-lazycodex origin/main
git -C /Users/jws/Projects/amic-vault-desktop-lazycodex status --short
git -C /Users/jws/Projects/amic-vault-desktop-lazycodex log -1 --oneline --decorate
```

### Success Criteria

- Worktree exists at `/Users/jws/Projects/amic-vault-desktop-lazycodex`.
- Worktree is based on `origin/main`.
- Source dirty state is recorded and isolated.
- No runtime code is changed.

### Evidence

- `.omo/evidence/LC-DESKTOP-00/worktree.md`

### Next LC

Proceed to LC-DESKTOP-01.

## 4. LC-DESKTOP-01 - LazyCodex Execution Plan Document

### Objective

Add the LazyCodex-first execution plan that defines the operating model and ordered LC lane.

### Branch

`docs/desktop-next-lazycodex-plan`

### Files

- Create `docs/desktop-next/08_lazycodex_execution_plan.md`.
- Do not modify runtime code.
- Do not modify `docs/package/**`.

### Steps

1. Read existing desktop strategy docs.
2. Confirm repository truth for the target branch. For the original LC-DESKTOP-01 branch this was PWA-first with `apps/desktop` absent; for the current checkout `apps/desktop` exists.
3. Add the execution plan.
4. Verify document-only checks.
5. Record executor and manual QA evidence.

### Verification

```bash
pnpm install --frozen-lockfile
pnpm docs:frozen
pnpm launch:readiness
pnpm launch:execution
pnpm lint
pnpm typecheck
git diff --check
```

### Manual QA

- Inspect the Markdown source.
- Confirm it accurately states the branch-local native desktop state.
- Confirm it defines LC-DESKTOP-00 through LC-DESKTOP-08.
- Confirm `docs/package/**` is unchanged.
- Run a credential-shaped token scan on the new document.

### Success Criteria

- New plan is present.
- Existing desktop/PWA truth is accurately stated.
- LazyCodex executor, code-reviewer, QA executor, and gate-reviewer flow is described.
- Verification passes.
- Evidence exists under `.omo/evidence/LC-DESKTOP-01/`.

### Evidence

- `.omo/evidence/LC-DESKTOP-01/executor.md`
- `.omo/evidence/LC-DESKTOP-01/manual-qa.md`

### Next LC

Proceed to LC-DESKTOP-02.

## 5. LC-DESKTOP-02 - Import And Reconcile Desktop-Next Package

### Objective

Import the attached desktop-next package into the repo and reconcile it with the current LazyCodex worktree truth.

### Branch

Continue on `docs/desktop-next-lazycodex-plan`, or split to `docs/desktop-next-plan` if the operator wants one PR per LC.

### Files

- Create `docs/desktop-next/00_current_state_audit.md`.
- Create `docs/desktop-next/01_desktop_product_decision.md`.
- Create `docs/desktop-next/02_target_architecture.md`.
- Create `docs/desktop-next/03_execution_packs.md`.
- Create `docs/desktop-next/04_file_level_plan.md`.
- Create `docs/desktop-next/05_security_validation_matrix.md`.
- Create `docs/desktop-next/06_release_and_packaging_plan.md`.
- Create `docs/desktop-next/07_open_questions.md`.
- Update only narrow lines needed to reflect local worktree verification and LazyCodex execution.

### Inputs

- `/Users/jws/Documents/Codex/vault-desktop/docs/desktop-next`
- Current worktree SHA and tree state.
- Existing repo docs:
  - `docs/desktop/desktop-app-plan.md`
  - `docs/adr/ADR-014-desktop-client-strategy.md`
  - `docs/release/desktop-origin-policy.md`
  - `docs/security/desktop-threat-model.md`
  - `docs/security/desktop-cache-policy.md`

### Steps

1. Copy or import `00` through `07` from the attached package.
2. Reconcile `00_current_state_audit.md` from GitHub-only language to local LazyCodex worktree verification.
3. Reconcile `03_execution_packs.md` so PACKs map to `LC-DESKTOP-*` goals and evidence directories.
4. Run document and repo checks.
5. Record executor, manual QA, and review evidence.

### Verification

```bash
pnpm docs:frozen
pnpm launch:readiness
pnpm launch:execution
pnpm lint
pnpm typecheck
git diff --check
rg -n "(AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY|xox[baprs]-|sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|arn:aws:[^ ]+)" docs/desktop-next || true
git diff --name-only -- docs/package
```

### Manual QA

- Inspect `00_current_state_audit.md` for accurate current-truth wording.
- Inspect `03_execution_packs.md` for LazyCodex evidence mapping.
- Confirm no new top-level integration suite paths are invented beyond the canonical suite model.
- Confirm `apps/desktop` state matches the target branch: future work only for the original pre-import branch, implemented Tauri thin shell for the current checkout.
- Confirm no private endpoint, token, cookie, signing secret, AWS account id, or customer data is present.

### Success Criteria

- Full desktop-next package exists in repo.
- Imported package is locally reconciled.
- `docs/package/**` remains unchanged.
- Verification passes.
- Evidence exists under `.omo/evidence/LC-DESKTOP-02/`.

### Evidence

- `.omo/evidence/LC-DESKTOP-02/executor.md`
- `.omo/evidence/LC-DESKTOP-02/manual-qa.md`
- `.omo/evidence/LC-DESKTOP-02/review.md`

### Next LC

Proceed to LC-DESKTOP-03 only after dependency approval for Tauri is recorded or explicitly deferred to operator review.

## 6. LC-DESKTOP-03 - Tauri Foundation

### Objective

Create the smallest Tauri v2 thin-shell scaffold under `apps/desktop` without adding local Vault runtime authority.

### Branch

`feat/desktop-tauri-foundation`

### Files

- `apps/desktop/package.json`
- `apps/desktop/README.md`
- `apps/desktop/tsconfig.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/Cargo.lock`
- `apps/desktop/src-tauri/build.rs`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/main.rs`
- `apps/desktop/src-tauri/src/origin.rs`
- `apps/desktop/src-tauri/capabilities/vault-thin-shell.json`
- `apps/desktop/src-tauri/config/local.signed.json`
- `apps/desktop/src-tauri/desktop-shell/index.html`
- `apps/desktop/src-tauri/icons/icon.png`
- `apps/desktop/tests/desktop-tauri-policy.spec.ts`
- `apps/desktop/tools/validate-tauri-policy.mjs`
- Minimal `pnpm-lock.yaml` updates caused by approved dependencies.
- `.gitignore` generated-output entries only.
- Modify `turbo.json` only if required for desktop tasks.
- Modify `pnpm-workspace.yaml` only if `apps/*` is insufficient.

### Dependency Gate

Tauri dependency additions are allowed only when the LC-DESKTOP-03 brief names exact packages and versions, or operator/reviewer approves dependency resolution in the PR.

### Steps

1. Create branch from merged desktop-next planning baseline.
2. Add minimal desktop package metadata.
3. Add Tauri Rust scaffold.
4. Configure a window shell without private origin.
5. Disable updater until LC-DESKTOP-07.
6. Configure default capabilities as closed.
7. Add README stating the desktop app is not a local Vault runtime.

### Verification

```bash
pnpm --filter @amic-vault/desktop lint
pnpm --filter @amic-vault/desktop typecheck
pnpm --filter @amic-vault/desktop test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm --filter @amic-vault/desktop tauri:build
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

If platform prerequisites prevent native build, record the exact blocker and pass static checks.

### Manual QA

- Launch debug shell if platform prerequisites allow.
- Confirm missing approved origin blocks or renders a non-sensitive safe state.
- Confirm no local server, database, storage, worker, model gateway, or search process starts.

### Stop Conditions

- Electron dependency added.
- API, database, storage, worker, search, vector, AI, or document body storage bundled into desktop.
- Private origin hard-coded.
- Native capability opened by default.

### Evidence

- `.omo/evidence/LC-DESKTOP-03/executor.md`
- `.omo/evidence/LC-DESKTOP-03/manual-qa.md`
- `.omo/evidence/LC-DESKTOP-03/review.md`
- `.omo/evidence/LC-DESKTOP-03/gate-review.md`

### Next LC

Proceed to LC-DESKTOP-04.

## 7. LC-DESKTOP-04 - Origin Guard

### Objective

Add fail-closed approved-origin resolution and navigation blocking.

### Branch

`feat/desktop-origin-guard`

### Files

- `apps/desktop/src-tauri/src/origin_guard.rs`
- `apps/desktop/src-tauri/src/main.rs`
- `apps/desktop/tests/origin-guard.spec.ts` or Rust equivalent
- Non-secret refinement to `docs/release/desktop-origin-policy.md` only if needed

### Required Negative Cases

- Missing origin config.
- Unapproved HTTPS origin.
- Non-local HTTP origin.
- Unknown scheme.
- Private endpoint-looking value in repo config.
- External IdP origin without explicit policy.

### Verification

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml origin
pnpm --filter @amic-vault/desktop test -- origin
pnpm lint
pnpm typecheck
git diff --check
```

### Manual QA

- Drive the guard harness or desktop shell for every negative case.
- Confirm log output contains only reason code, approved origin ref, app version, channel, OS family, and correlation ref.

### Stop Conditions

- Any unapproved origin renders.
- Logs include full private URL, token, cookie, account ID, secret, or customer data.
- Fallback allows access on malformed config.

### Evidence

- `.omo/evidence/LC-DESKTOP-04/executor.md`
- `.omo/evidence/LC-DESKTOP-04/manual-qa.md`
- `.omo/evidence/LC-DESKTOP-04/review.md`
- `.omo/evidence/LC-DESKTOP-04/gate-review.md`

### Next LC

Proceed to LC-DESKTOP-05.

## 8. LC-DESKTOP-05 - Capability Deny

### Objective

Prove all native capabilities remain denied unless a separate ADR opens them.

### Branch

`feat/desktop-capability-deny`

### Files

- `apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/tests/capability-deny.spec.ts`
- optional `tools/release/check-desktop-capabilities.mjs`

### Denied Capabilities

- filesystem read/write
- clipboard
- dialog
- shell open
- notification
- global shortcut
- share/mail compose
- arbitrary external URL open

### Verification

```bash
pnpm --filter @amic-vault/desktop test -- capability
node tools/release/check-desktop-capabilities.mjs
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm lint
pnpm typecheck
git diff --check
```

### Manual QA

- Run static capability policy check.
- Run runtime denial checks where platform support exists.
- Confirm any future capability opening requires ADR ref.

### Stop Conditions

- Capability opens without ADR.
- Policy checker can be bypassed by adding a new capability file.
- Native open/download bypasses server audit routes.

### Evidence

- `.omo/evidence/LC-DESKTOP-05/executor.md`
- `.omo/evidence/LC-DESKTOP-05/manual-qa.md`
- `.omo/evidence/LC-DESKTOP-05/review.md`
- `.omo/evidence/LC-DESKTOP-05/gate-review.md`

### Next LC

Proceed to LC-DESKTOP-06.

## 9. LC-DESKTOP-06 - Auth, Audit, And No Local Storage

### Objective

Prove desktop preserves server authority and does not persist sensitive document/search/AI/audit data locally.

### Branch

`test/desktop-auth-audit-nolocal`

### Files

- `apps/desktop/tests/auth-session-smoke.spec.ts`
- `apps/desktop/tests/audit-preserve.spec.ts`
- `apps/desktop/tests/no-local-storage.spec.ts`
- optional `tools/release/check-desktop-local-storage.mjs`

### Required Scenarios

- Unauthenticated launch redirects to login.
- Synthetic login reaches dashboard.
- Logout makes protected route require login again.
- Document view/download uses server routes and records server audit events.
- Unauthorized document/search attempts are safe-denied.
- Offline/search/document/AI/audit markers are absent from desktop cache, appdata, temp files, and logs.

### Verification

```bash
pnpm --filter @amic-vault/desktop test -- auth
pnpm --filter @amic-vault/desktop test -- audit
pnpm --filter @amic-vault/desktop test -- no-local-storage
pnpm test:integration -- desktop-document-cache
pnpm test:integration -- desktop-offline-leakage
pnpm test:integration -- desktop-view-download-audit
pnpm lint
pnpm typecheck
git diff --check
```

### Manual QA

- Drive the desktop shell if available.
- If native shell cannot run, drive the PWA/browser equivalent for the server/PWA portions and record the native prerequisite blocker separately.
- Capture marker-scan artifacts.

### Stop Conditions

- Any document body, search result, AI context, audit row, token, cookie, private endpoint, account ID, or customer data appears in local storage or logs.
- View/download completes without server audit semantics.
- Unauthorized data leaks title, snippet, count, facet, metadata, or existence.

### Evidence

- `.omo/evidence/LC-DESKTOP-06/executor.md`
- `.omo/evidence/LC-DESKTOP-06/manual-qa.md`
- `.omo/evidence/LC-DESKTOP-06/review.md`
- `.omo/evidence/LC-DESKTOP-06/gate-review.md`

### Next LC

Proceed to LC-DESKTOP-07.

## 10. LC-DESKTOP-07 - Signing, Updater, And Packaging Docs

### Objective

Define enterprise packaging and update policy without committing secrets or coupling desktop artifact release to server production deploy.

### Branch

`docs/desktop-signing-updater`

### Files

- `docs/release/desktop-signing-plan.md`
- `docs/release/desktop-update-policy.md`
- `docs/release/desktop-release-channels.md`
- `docs/release/desktop-macos-distribution.md`
- `docs/release/desktop-windows-distribution.md`
- `docs/release/desktop-it-handoff.md`

### Required Content

- macOS Developer ID, hardened runtime, notarization, stapling, entitlement minimization.
- Windows signing and MSIX/installer decision tree.
- Signing material custody outside repo.
- Release channels: local, staging, pilot, production.
- Updater disabled until signed update policy exists.
- Wrong-channel and unsigned update rejection rules.
- Digest pinning.
- Rollback to browser/PWA.
- Customer IT handoff fields.

### Verification

```bash
pnpm docs:frozen
pnpm launch:readiness
pnpm launch:execution
pnpm lint
pnpm typecheck
git diff --check
rg -n "(AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY|xox[baprs]-|sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|arn:aws:[^ ]+)" docs/release/desktop-*.md || true
```

### Manual QA

- Inspect each packaging doc.
- Confirm no private key, signing password, notarization credential, private URL, token, cookie, account ID, or customer data is included.
- Confirm desktop release is explicitly separate from server production deploy.

### Stop Conditions

- Any signing secret or credential would be committed.
- Production custom domain/ref is missing but broad production rollout is requested.
- Updater policy cannot reject unsigned or wrong-channel artifacts.
- Rollback to browser/PWA is unavailable.

### Evidence

- `.omo/evidence/LC-DESKTOP-07/executor.md`
- `.omo/evidence/LC-DESKTOP-07/manual-qa.md`
- `.omo/evidence/LC-DESKTOP-07/review.md`
- `.omo/evidence/LC-DESKTOP-07/gate-review.md`

### Completion

When LC-DESKTOP-07 is approved, the top-level goal may advance to native release-gate work, currently described as LC-DESKTOP-08 in `08_lazycodex_execution_plan.md`.

## 11. LC-DESKTOP-08 - Desktop Release Gate

### Goal

Separate native desktop artifact release from server production deploy and make
the desktop release gate executable with synthetic pass/fail fixtures.

### Scope

- Add a desktop-only CI workflow for the thin shell and release gate.
- Add `tools/release/check-desktop-release-gate.mjs`.
- Add synthetic fixtures covering pass, missing digest, unsigned customer
  artifact, wrong-channel update, missing rollback ref, and private
  endpoint/token-shaped evidence.
- Extend release evidence and rollback documentation with native desktop gate
  refs.

### Manual QA Surface

Run the gate checker against passing and failing synthetic fixtures:

```bash
pnpm desktop:release-gate
pnpm desktop:release-gate -- --self-test
```

### Evidence

- `.omo/evidence/LC-DESKTOP-08/executor.md`
- `.omo/evidence/LC-DESKTOP-08/manual-qa.md`
- `.omo/evidence/LC-DESKTOP-08/review.md`
- `.omo/evidence/LC-DESKTOP-08/gate-review.md`

### Completion

LC-DESKTOP-08 is complete when the release gate checker passes live docs,
synthetic failure fixtures are rejected with their expected codes, desktop CI is
defined separately from server production deploy, and no private endpoint,
token, signing secret, or customer data is committed.

## 12. Current Progress

| LC | Status | Evidence |
|---|---|---|
| LC-DESKTOP-00 | Complete | `.omo/evidence/LC-DESKTOP-00/worktree.md` |
| LC-DESKTOP-01 | Complete | `.omo/evidence/LC-DESKTOP-01/executor.md`, `.omo/evidence/LC-DESKTOP-01/manual-qa.md` |
| LC-DESKTOP-02 | Complete | `.omo/evidence/LC-DESKTOP-02/executor.md`, `.omo/evidence/LC-DESKTOP-02/manual-qa.md`, `.omo/evidence/LC-DESKTOP-02/review.md` |
| LC-DESKTOP-03 | Complete | `.omo/evidence/LC-DESKTOP-03/dependency-gate.md`, `.omo/evidence/LC-DESKTOP-03/candidate-audit.md`, `.omo/evidence/LC-DESKTOP-03/import-map.md`, `.omo/evidence/LC-DESKTOP-03/approval-packet.md`, `.omo/evidence/LC-DESKTOP-03/executor.md`, `.omo/evidence/LC-DESKTOP-03/manual-qa.md`, `.omo/evidence/LC-DESKTOP-03/review.md`, `.omo/evidence/LC-DESKTOP-03/gate-review.md`; operator approved Tauri dependency gate, scaffold imported, missing-config startup blocks with sanitized reason code, `tauri:build` passed |
| LC-DESKTOP-04 | Complete | `.omo/evidence/LC-DESKTOP-04/executor.md`, `.omo/evidence/LC-DESKTOP-04/manual-qa.md`, `.omo/evidence/LC-DESKTOP-04/review.md`, `.omo/evidence/LC-DESKTOP-04/gate-review.md`; approved-origin navigation guard implemented and required negative cases verified |
| LC-DESKTOP-05 | Complete | `.omo/evidence/LC-DESKTOP-05/executor.md`, `.omo/evidence/LC-DESKTOP-05/manual-qa.md`, `.omo/evidence/LC-DESKTOP-05/review.md`, `.omo/evidence/LC-DESKTOP-05/gate-review.md`; capability directory checker and tests prove native permissions remain denied |
| LC-DESKTOP-06 | Complete | `.omo/evidence/LC-DESKTOP-06/executor.md`, `.omo/evidence/LC-DESKTOP-06/manual-qa.md`, `.omo/evidence/LC-DESKTOP-06/review.md`, `.omo/evidence/LC-DESKTOP-06/gate-review.md`; desktop auth/audit/no-local-storage tests and existing desktop integration specs passed |
| LC-DESKTOP-07 | Complete | `.omo/evidence/LC-DESKTOP-07/executor.md`, `.omo/evidence/LC-DESKTOP-07/manual-qa.md`, `.omo/evidence/LC-DESKTOP-07/review.md`, `.omo/evidence/LC-DESKTOP-07/gate-review.md`; signing, updater-disabled, release-channel, macOS/Windows distribution, and IT handoff docs added |
| LC-DESKTOP-08 | Complete | `.omo/evidence/LC-DESKTOP-08/executor.md`, `.omo/evidence/LC-DESKTOP-08/manual-qa.md`, `.omo/evidence/LC-DESKTOP-08/review.md`, `.omo/evidence/LC-DESKTOP-08/gate-review.md`; desktop CI, release gate checker, synthetic pass/fail fixtures, evidence register, and native rollback docs added |

## 13. Post-Merge RC Closeout

| Closeout | Status | Evidence |
|---|---|---|
| LC-DESKTOP-RC-CLOSEOUT | Verification pass | `.omo/evidence/LC-DESKTOP-RC-CLOSEOUT/executor.md`, `.omo/evidence/LC-DESKTOP-RC-CLOSEOUT/manual-qa.md`, `.omo/evidence/LC-DESKTOP-RC-CLOSEOUT/review.md`, `.omo/evidence/LC-DESKTOP-RC-CLOSEOUT/gate-review.md`; records merge commit `1c7cba2`, PR #291, main desktop/CI workflow success, staging desktop/auth smoke pass=15 fail=0 skip=0, DMS synthetic smoke pass=13 fail=0 skip=0, and production native artifact hold pending digest/signature/signing/customer IT approval |
