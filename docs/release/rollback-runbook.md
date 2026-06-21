# Rollback Runbook

Status: PREPARED - REHEARSAL REQUIRED BEFORE PRODUCTION

## Rollback Triggers

- Failed post-deploy smoke check.
- Permission-before-search or permission-before-AI regression.
- Tenant isolation failure.
- Audit write failure.
- Unsafe log or secret exposure.
- Migration failure without a verified roll-forward path.
- External sharing or records disposal behavior outside approved scope.

## Immediate Actions

1. Stop further rollout.
2. Preserve logs and CI/deploy evidence without adding sensitive content.
3. Disable public ingress or route traffic back to the previous healthy version.
4. Keep database writes paused only if required for integrity or data leakage
   containment.
5. Notify operator, security owner, and product owner through approved channels.

## Application Rollback

1. Redeploy the previous known-good api, web, and ingestion images.
2. Verify `/health`, login, tenant context, and core authenticated APIs.
3. Verify audit writes after rollback.
4. Verify queue workers are not replaying unsafe jobs.

## Desktop/PWA Rollback

Use this path when the installed PWA, service worker, manifest, offline shell,
or desktop install surface is suspected of caching unsafe content, hiding
permission failures, or confusing users during incident response.

1. Stop promoting the installed-app path and direct users to the approved
   browser URL for the same environment.
2. Deploy a web build that disables new service worker registration in
   `apps/web/src/app/pwa-registration.tsx` or roll back to the previous
   known-good web image.
3. Replace `/sw.js` with a same-origin, `no-store` unregister worker that
   deletes `amic-vault-desktop-shell-*` caches and calls
   `registration.unregister()` for active clients.
4. Keep `/v1`, `/dashboard`, `/search`, `/documents`, `/audit`, `/records`,
   `/ai`, `/external`, and `/login` outside every cache allow-list while the
   rollback is active.
5. Keep `/offline.html` limited to a safe unavailable message with no tenant,
   matter, document, search, audit, AI, token, secret, or client markers.
6. Ask affected users to close and reopen the installed app. If it still uses
   the old worker, remove the installed app and continue in the browser-only
   path until SMOKE-012 through SMOKE-015 are green again.
7. Record only reference IDs, release SHA, check IDs, and non-secret incident
   refs. Do not record screenshots with private URLs, cookies, tokens, local
   storage dumps, document names, snippets, or customer data.

## Desktop Native Artifact Rollback

Use this path when a signed Tauri desktop artifact, installer channel, or
desktop update manifest is suspected of pointing to an unsafe origin, carrying
the wrong release channel, lacking a digest/signature receipt, or confusing
users during incident response.

No desktop native rollback may deploy server production, widen traffic, change
database migrations, alter storage objects, or modify API/web/worker production
state. Roll back the native artifact lane only and keep server-side permission,
audit, document, search, AI, and external-sharing gates authoritative.

1. Stop promotion for the affected native channel and record
   `RB-DESKTOP-NATIVE-001`.
2. Revoke or hide the installer/update manifest from the affected channel. If an
   updater is later enabled, publish a signed hold manifest that points only to a
   reviewed previous artifact for the same channel and digest.
3. Direct users to the approved browser/PWA fallback and record
   `DESKTOP-ROLLBACK-BROWSER-FALLBACK-REF` outside the repository.
4. Verify the replacement or fallback artifact has a sha256 digest, signing ref,
   channel ref, release approval ref, and rollback owner ref.
5. Keep screenshots, private endpoints, provider metadata, account identifiers,
   cookies, tokens, customer document names, snippets, and local storage dumps
   out of repository evidence.
6. Run `pnpm desktop:release-gate` and
   `pnpm desktop:release-gate -- --self-test` before re-opening the native
   channel.
7. Close the rollback only after the browser/PWA fallback is working, affected
   users are notified through the operator-owned channel, and the desktop
   release approval explicitly remains separate from server production deploy.

## Enterprise DMS UI Rollback

Use this path when the Matter-first DMS UI release exposes unsafe upload,
browse, search, governance, integration, or AI prep behavior.

1. Stop traffic widening and preserve reference-only evidence.
2. Use route visibility policy to hide unsafe surfaces such as `/files`,
   `/documents/[id]`, `/search/folders`, `/records`, `/audit`, `/walls`,
   `/integrations`, `/integrations/outlook`, `/enterprise`, and admin routes.
3. If Matter app source-of-truth lookup or sync is unhealthy, disable
   production upload/browse by setting Matter source flags to a fail-closed
   state. Server-side flags are `MATTER_APP_SOURCE_MODE`,
   `MATTER_APP_SOURCE_CONFIGURED`, `MATTER_APP_RUNTIME_READY`,
   `ALLOW_VAULT_PROJECTION_MATTER_SOURCE`,
   `MATTER_APP_SOURCE_UPDATED_AT`, and `MATTER_APP_STALENESS_MAX_SECONDS`.
   Browser-visible flags are `NEXT_PUBLIC_MATTER_APP_SOURCE_MODE`,
   `NEXT_PUBLIC_MATTER_APP_SOURCE_CONFIGURED`,
   `NEXT_PUBLIC_MATTER_APP_RUNTIME_READY`,
   `NEXT_PUBLIC_MATTER_APP_SOURCE_UPDATED_AT`, and
   `NEXT_PUBLIC_ALLOW_VAULT_PROJECTION_MATTER_SOURCE`.
   These flags also make the API upload-preflight and document mutation gates
   fail closed; any already issued upload preflight refs are short-lived and
   must not be treated as release evidence.
4. If file organization prep health is unsafe, stop enqueue and worker paths
   with `AI_PREP_ENABLED=false`, `AI_PREP_QUEUE_WORKER_ENABLED=false`, and
   `LOCAL_GEMMA_ENABLED=false`; keep `AI_SUMMARY_GEMMA_ENABLED=false`.
5. If search or document detail leaks metadata, route traffic back to the
   previous known-good web/API image and keep search/detail routes hidden until
   permission-bound smoke passes.
6. Do not hard delete documents, versions, audit events, storage objects, or
   AI prep records. Use reviewed migration rollback or a forward-fix only.
7. Confirm immutable originals, versions, hashes, tenant prefixes, and audit
   append-only invariants after rollback.
8. Continue monitoring upload, extraction/OCR, search, permission/wall,
   AI prep file organization, audit, storage, and integration health until the
   incident owner closes the rollback.

### Enterprise DMS Rollback Drill

Related TUW: DMS-GA-702 and DMS-UX-810.

Status: REQUIRED BEFORE DMS PRODUCTION SIGNOFF - REPOSITORY CONTROLS PREPARED,
EXTERNAL REHEARSAL REFS PENDING.

Rollback owner must be assigned in
`docs/release/enterprise-dms-ui-release-evidence.md` and
`docs/release/production-ui-rollout-checklist.md` before release traffic is
widened. Repository refs below prove the rollback controls are documented and
guarded; they are not production rollback receipts.

No Enterprise DMS rollback step may hard delete documents, document versions,
audit events, queue records, AI prep records, callback records, or storage
objects. Audit history remains append-only. Database changes must use reviewed
migration rollback or a forward-fix only.

| Control ID | Repository evidence ref | Trigger refs | Required rollback action | Verification |
| --- | --- | --- | --- | --- |
| DMS-RB-001 | `RB-DMS-001-ROUTE-VISIBILITY` | `MON-DMS-001`, `MON-DMS-003`, `MON-DMS-004`, `MON-DMS-008` | Hide unsafe `/files`, `/documents/[id]`, `/search/folders`, `/records`, `/audit`, `/walls`, `/integrations`, `/integrations/outlook`, `/enterprise`, and admin routes through route visibility and role policy. | `pnpm ui:production-smoke` verifies route policy and production inventory alignment. |
| DMS-RB-002 | `RB-DMS-002-MATTER-SOURCE-FLAGS` | `MON-DMS-001`, `MON-DMS-008` | Set `MATTER_APP_SOURCE_MODE` and related Matter app source flags to a fail-closed state so production upload/browse and mutation gates block when canonical Matter source is unavailable or stale. | `pnpm release:dms-smoke -- --check-env --json` must remain `HOLD` without approved source credentials; API gates fail closed. |
| DMS-RB-003 | `RB-DMS-003-WORKER-FLAGS` | `MON-DMS-002`, `MON-DMS-005` | Disable unsafe processing with `AI_PREP_ENABLED=false`, `AI_PREP_QUEUE_WORKER_ENABLED=false`, `LOCAL_GEMMA_ENABLED=false`, and `AI_SUMMARY_GEMMA_ENABLED=false`. | Worker/AI prep health receipts remain reference-only; no legal analysis or summary scope is opened. |
| DMS-RB-004 | `RB-DMS-004-DB-AUDIT-INVARIANTS` | `MON-DMS-006` | Use reviewed migration rollback or forward-fix only; preserve audit append-only records and records governance invariants. | `pnpm release:prod-preflight`, migration rehearsal refs, and audit write checks must pass before rollback closure. |
| DMS-RB-005 | `RB-DMS-005-STORAGE-INTEGRITY` | `MON-DMS-007` | Preserve immutable originals, FileObject versions, hashes, tenant storage prefixes, and storage/audit refs. | Storage integrity checks prove no hard delete and no hash or tenant-prefix drift. |
| DMS-RB-006 | `RB-DMS-006-MONITOR-TRIGGERS` | `MON-DMS-001` through `MON-DMS-008` | Keep upload, extraction/OCR, search/reindex, permission/wall, AI prep, audit, storage, Matter source, Outlook, and Office/OneDrive monitors active during rollback. | Every `MON-DMS-*` query ref must have owner-reviewed external evidence before DMS-UX-812 can pass. |
| DMS-RB-007 | `RB-DMS-007-OFFICE-ONEDRIVE-GATE` | `MON-DMS-008` | Keep `/integrations/onedrive` hidden, reject unsafe callbacks/jobs, disable unsafe consent/token material, and remove Office open/save, coauthoring, live edit, lock, or sync claims. | ADR-017, `apps/web/src/lib/features.ts`, and `pnpm ui:production-smoke` guard the planning-only gate. |

Before DMS rollback is closed, the rollback owner must attach an external drill
or incident ref for each `RB-DMS-*` row, cite the triggering `MON-DMS-*` refs,
and confirm the incident communication path. If any owner row or drill ref is
blank, DMS-UX-812 remains `HOLD`.

### Office/OneDrive Gate Rollback

Use this path if any release candidate or production UI claims OneDrive is
connected, Office open/save is available, coauthoring/live edit is available, or
sync is running before the approved auth/storage/version/audit/callback/rollback
contract exists.

1. Keep `/integrations/onedrive` at `hidden_until_api_ready` and
   `showInNavigation: false` in `apps/web/src/lib/features.ts`.
2. Remove or roll back any OneDrive route link, Office open/save action,
   coauthoring control, live edit control, lock-state claim, or sync success
   copy from production UI.
3. Reject Microsoft callback, sync, or save-back jobs until the approved
   callback contract and audit path exist.
4. Revoke or disable any tenant-level Microsoft consent or token material
   introduced by the unsafe release path.
5. Preserve immutable originals, FileObject versions, hashes, tenant storage
   prefixes, and audit append-only records. Do not hard delete documents,
   versions, audit events, callback records, queue records, or storage objects.
6. Verify the integration parent route shows only gated states and that
   `pnpm ui:production-smoke` proves ADR-017 and the route policy before
   reopening traffic.

## Database Rollback

Database rollback is allowed only when:

- A pre-migration backup snapshot exists.
- Restore rehearsal evidence exists for the same release class.
- Records and audit append-only invariants can be preserved.
- The security owner approves the restore path.

If database rollback could violate append-only audit or records governance,
prefer a forward-fix migration and keep production traffic restricted until the
forward fix passes smoke checks.

## Exit Criteria

- Previous known-good application version is live or forward fix is deployed.
- Permission, tenant isolation, audit, DLP, search, external portal, records, and
  AI policy smoke checks pass.
- Desktop/PWA rollback, if used, proves service worker invalidation or
  browser-only fallback and SMOKE-012 through SMOKE-015 pass or are explicitly
  disabled by an approved incident ref.
- Incident evidence is reference-only and logged in the learning ledger.
- Any unresolved item is recorded in the launch blocker ledger.
