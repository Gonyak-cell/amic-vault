# 08. LazyCodex Desktop Execution Plan

Date: 2026-06-21
Scope: AMIC Vault desktop-app development using LazyCodex as the execution loop.
Base checkout: `/Users/jws/Projects/amic-vault-desktop-lazycodex`
Source material: `/Users/jws/Documents/Codex/vault-desktop/docs/desktop-next`

## 1. Current Truth

AMIC Vault is not yet a native desktop app. The current repository baseline is:

- `apps/web` is the UI source of truth.
- `apps/api` is the server authority for authentication, PermissionService, AuditService, tenant context, document lifecycle, search, AI policy, and records controls.
- PWA desktop installability exists through `apps/web/public/manifest.webmanifest`, `apps/web/public/sw.js`, `apps/web/public/offline.html`, `apps/web/src/app/pwa-registration.tsx`, and related cache/offline tests.
- `apps/desktop`, `src-tauri`, and an Electron implementation are absent from the current mainline checkout.
- Existing desktop strategy is PWA-first, with optional Tauri v2 thin shell only when signed installer or managed desktop distribution is required.

The desktop client must remain an access surface over an approved Vault web origin. It must not become a local Vault runtime.

## 2. LazyCodex Operating Model

Desktop work must run as small LazyCodex goals, not as one large autonomous rewrite.

Each goal has one narrow user-visible outcome, one branch, one evidence directory, and one gate review. A goal is complete only when all of the following are true:

- The smallest correct code or document change is implemented.
- LSP or type diagnostics are clean for changed files.
- Relevant build and test commands pass, or pre-existing failures are identified with exact evidence.
- The matching surface is exercised in the same goal.
- Evidence is recorded under `.omo/evidence/<goal-id>/`.
- A LazyCodex code review, manual QA pass, and final gate review approve the goal.

The standard LazyCodex flow is:

1. `lazycodex-executor` implements the goal and records executor evidence.
2. `lazycodex-code-reviewer` performs read-only diff, test, maintainability, and scope review.
3. `lazycodex-qa-executor` drives the matching surface and records manual QA artifacts.
4. `lazycodex-gate-reviewer` re-audits executor, review, and QA evidence before approval.

Every executor completion message must end with:

```text
EVIDENCE_RECORDED: <path>
```

## 3. Hard Boundaries

All LazyCodex goals must preserve these AMIC Vault invariants:

- Permission-before-search: desktop never builds a local searchable corpus.
- Permission-before-AI: desktop never stores or sends local document content directly to AI.
- Audit-by-default: view, download, and native-open paths retain server audit semantics.
- Fail-closed: missing origin, session, update, policy, or capability config blocks access.
- Immutable original: desktop cannot overwrite or mutate stored originals locally.
- No silent external sharing: no native share sheet, mail compose, public link, or external handoff without a later approved server release path.
- Sensitive data is not logged: logs and evidence must not include document text, names, snippets, tokens, cookies, private endpoints, account IDs, or customer data.

The following paths are out of scope for desktop foundation goals:

- `docs/package/**`
- `db/migrations/**`
- `apps/api/src/modules/permission/**`
- `apps/api/src/modules/audit/**`
- `apps/api/src/modules/search/**`
- `packages/ai/**`
- `workers/ingestion/**`
- external sharing, secure links, Outlook/M365, native share, or mail compose surfaces

Any change to these paths requires a separate approved goal.

## 4. Worktree And Branch Strategy

The root checkout may contain unrelated active work. Desktop work therefore runs in a dedicated worktree:

```bash
/Users/jws/Projects/amic-vault-desktop-lazycodex
```

Recommended branch sequence:

| Order | Goal ID | Branch | Outcome |
|---|---|---|---|
| 0 | `LC-DESKTOP-00` | local setup only | Clean LazyCodex worktree created from current `origin/main`. |
| 1 | `LC-DESKTOP-01` | `docs/desktop-next-lazycodex-plan` | LazyCodex execution plan added as documentation. |
| 2 | `LC-DESKTOP-02` | `docs/desktop-next-plan` | Full desktop-next document package imported and reconciled with current repo truth. |
| 3 | `LC-DESKTOP-03` | `feat/desktop-tauri-foundation` | Minimal `apps/desktop` Tauri v2 thin-shell scaffold. |
| 4 | `LC-DESKTOP-04` | `feat/desktop-origin-guard` | Approved-origin config and fail-closed navigation guard. |
| 5 | `LC-DESKTOP-05` | `feat/desktop-capability-deny` | Native capabilities denied by default with policy checks. |
| 6 | `LC-DESKTOP-06` | `test/desktop-auth-audit-nolocal` | Auth smoke, audit preservation, and no-local-storage evidence. |
| 7 | `LC-DESKTOP-07` | `docs/desktop-signing-updater` | Signing, notarization, updater, release-channel, and customer IT handoff docs. |
| 8 | `LC-DESKTOP-08` | `release/desktop-gate` | Desktop CI, evidence, rollback, and release gate separated from server production deploy. |

Each branch should be opened as a separate PR. No PR should mix desktop native scaffold with server permission, search, AI, audit, or production deploy behavior.

## 5. Goal Backlog

### LC-DESKTOP-00 - Clean Worktree

Purpose: isolate desktop work from unrelated LAI/UI changes.

Success criteria:

- Worktree exists at `/Users/jws/Projects/amic-vault-desktop-lazycodex`.
- Worktree is based on current `origin/main`.
- Worktree has a clean `git status --short`.
- Evidence records branch, SHA, remote, and source checkout status.

Surface to drive: Git/worktree state.

Evidence:

- `.omo/evidence/LC-DESKTOP-00/worktree.md`

### LC-DESKTOP-01 - LazyCodex Execution Plan Document

Purpose: commit the LazyCodex operating model before implementation.

Files:

- Create `docs/desktop-next/08_lazycodex_execution_plan.md`.

Verification:

- `pnpm docs:frozen`
- `pnpm launch:readiness`
- `pnpm launch:execution`
- `pnpm lint`
- `pnpm typecheck`

Manual QA surface:

- Read the rendered Markdown or source file.
- Confirm `docs/package/**` is unchanged.
- Confirm the document states that current desktop truth is PWA-first and future native work is Tauri thin shell.

Evidence:

- `.omo/evidence/LC-DESKTOP-01/executor.md`
- `.omo/evidence/LC-DESKTOP-01/manual-qa.md`
- `.omo/evidence/LC-DESKTOP-01/gate-review.md`

### LC-DESKTOP-02 - Import Full Desktop-Next Package

Purpose: bring the attached desktop-next package into the repo as a planned artifact, reconciled with current mainline.

Files:

- `docs/desktop-next/00_current_state_audit.md`
- `docs/desktop-next/01_desktop_product_decision.md`
- `docs/desktop-next/02_target_architecture.md`
- `docs/desktop-next/03_execution_packs.md`
- `docs/desktop-next/04_file_level_plan.md`
- `docs/desktop-next/05_security_validation_matrix.md`
- `docs/desktop-next/06_release_and_packaging_plan.md`
- `docs/desktop-next/07_open_questions.md`

Required reconciliation:

- Replace stale GitHub-only observations with current local checkout evidence.
- Keep `apps/desktop` described as future work unless it exists in the branch.
- Preserve `PWA/installable web app` versus `Tauri thin shell` terminology.

Manual QA surface:

- Inspect the document package in the repo.
- Run a secret/private-endpoint scan over the imported package.

### LC-DESKTOP-03 - Tauri Foundation

Purpose: create the smallest native desktop package that wraps an approved Vault web origin without adding local data authority.

Files:

- `apps/desktop/package.json`
- `apps/desktop/README.md`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/src/main.rs`
- Minimal workspace or Turbo changes only if required.

Stop conditions:

- Any attempt to bundle API, PostgreSQL, MinIO, worker, search, vector, model gateway, or local document database.
- Any hard-coded private origin.
- Any Electron dependency.
- Any broad native capability opened by default.

Manual QA surface:

- Launch local debug shell if dependencies are available.
- If native launch is blocked by missing platform prerequisites, record the blocker and prove the scaffold passes static checks.

### LC-DESKTOP-04 - Origin Guard

Purpose: fail closed unless the desktop shell loads an approved Vault origin.

Required negative cases:

- missing origin config
- unapproved HTTPS origin
- non-local HTTP origin
- unknown scheme
- private endpoint-looking value in repo config

Manual QA surface:

- Drive the desktop shell or a faithful origin-guard harness for each negative case.
- Evidence must include invocation, result, and non-secret logs.

### LC-DESKTOP-05 - Capability Deny

Purpose: prove native capabilities are closed unless a later ADR opens them.

Required denied capabilities:

- filesystem read/write
- clipboard
- dialog
- shell open
- notification
- global shortcut
- share/mail compose
- arbitrary external URL open

Manual QA surface:

- Static capability policy check.
- Runtime denial check where the platform supports it.

### LC-DESKTOP-06 - Auth, Audit, No-Local-Storage

Purpose: prove desktop preserves server authority and does not persist sensitive data locally.

Required scenarios:

- unauthenticated desktop launch redirects to login
- authenticated synthetic login reaches dashboard
- logout returns protected route to login
- document view/download uses server routes and records server audit events
- offline/search/document/AI/audit markers are absent from local cache, app data, and logs

Manual QA surface:

- Desktop shell or PWA/browser equivalent for PWA-only portions.
- Artifact-backed marker scans.

### LC-DESKTOP-07 - Signing And Updater Docs

Purpose: define enterprise packaging without committing secrets.

Files:

- `docs/release/desktop-signing-plan.md`
- `docs/release/desktop-update-policy.md`
- `docs/release/desktop-release-channels.md`
- `docs/release/desktop-macos-distribution.md`
- `docs/release/desktop-windows-distribution.md`
- `docs/release/desktop-it-handoff.md`

Manual QA surface:

- Document review.
- Secret/private endpoint scan.

### LC-DESKTOP-08 - Desktop Release Gate

Purpose: separate desktop artifact release from server production deploy.

Files:

- `.github/workflows/desktop.yml` or existing CI equivalent
- `docs/release/evidence-register.md`
- `docs/release/rollback-runbook.md`
- optional `tools/release/check-desktop-release-gate.mjs`

Required gate failures:

- missing digest
- unsigned customer artifact
- wrong-channel update
- missing rollback ref
- private endpoint or token in evidence

Manual QA surface:

- Run the gate checker against passing and failing synthetic fixtures.

## 6. Verification Sets

Document-only goals:

```bash
pnpm docs:frozen
pnpm launch:readiness
pnpm launch:execution
pnpm lint
pnpm typecheck
git diff --check
```

PWA/security baseline goals:

```bash
pnpm test -- apps/web/src/lib/pwa/cache-policy.spec.ts
pnpm test:integration -- desktop-document-cache
pnpm test:integration -- desktop-offline-leakage
pnpm test:integration -- desktop-view-download-audit
pnpm release:smoke -- --dry-run
```

Tauri goals, once `apps/desktop` exists:

```bash
pnpm --filter @amic-vault/desktop lint
pnpm --filter @amic-vault/desktop typecheck
pnpm --filter @amic-vault/desktop test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm --filter @amic-vault/desktop tauri build --debug
```

Release-candidate goals:

```bash
pnpm test:integration
pnpm launch:readiness
pnpm launch:execution
pnpm docs:frozen
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 7. LazyCodex Goal Brief Template

Use this template for each LazyCodex execution:

```text
Goal: <LC-DESKTOP-XX name>

Repo: /Users/jws/Projects/amic-vault-desktop-lazycodex
Branch: <branch-name>

User-visible outcome:
<One observable outcome.>

Scope:
- <Allowed files>
- Do not modify docs/package/**.
- Do not touch server permission/search/audit/AI logic unless this goal explicitly says so.
- Do not commit secrets, private endpoints, tokens, cookies, account IDs, or customer data.

Success criteria:
- <Criterion 1>
- <Criterion 2>
- <Criterion 3>

Required verification:
- <Command 1>
- <Command 2>
- Manual QA with artifact-backed evidence under .omo/evidence/<goal-id>/

Final response must end with:
EVIDENCE_RECORDED: .omo/evidence/<goal-id>/<evidence-file>
```

## 8. First Command Sequence

Run the first LazyCodex implementation slice from the clean worktree:

```bash
cd /Users/jws/Projects/amic-vault-desktop-lazycodex
git status --short
omo run "Goal: LC-DESKTOP-01 LazyCodex Execution Plan Document

Repo: /Users/jws/Projects/amic-vault-desktop-lazycodex
Branch: docs/desktop-next-lazycodex-plan

User-visible outcome:
The repository contains a LazyCodex-first desktop execution plan that starts from current PWA-first repo truth and defines small evidence-backed desktop goals.

Scope:
- Create or update docs/desktop-next/08_lazycodex_execution_plan.md.
- Do not modify docs/package/**.
- Do not change runtime code.

Success criteria:
- The document states current truth: apps/web/apps/api exist, apps/desktop is future work, PWA assets exist.
- The document defines LC-DESKTOP-00 through LC-DESKTOP-08.
- The document describes executor, code-reviewer, QA executor, and gate reviewer evidence flow.
- Secret/private endpoint/customer-data handling is fail-closed and reference-only.
- Verification and manual QA evidence are written under .omo/evidence/LC-DESKTOP-01/.

Required verification:
- pnpm docs:frozen
- pnpm launch:readiness
- pnpm launch:execution
- pnpm lint
- pnpm typecheck
- git diff --check
- Manual QA source inspection and docs/package unchanged check

Final response must end with:
EVIDENCE_RECORDED: .omo/evidence/LC-DESKTOP-01/executor.md"
```

## 9. Promotion Rule

Do not start `LC-DESKTOP-03` native scaffold until:

- `LC-DESKTOP-01` and `LC-DESKTOP-02` are merged or explicitly approved by the operator.
- The dependency allowance for Tauri is recorded in the desktop-next plan or PR review.
- A reviewer confirms that `apps/desktop` remains a thin shell over approved Vault web origin.

If any goal exposes a conflict with AMIC Vault constitution, stop and append an escalation note rather than implementing around it.
