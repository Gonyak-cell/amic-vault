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
