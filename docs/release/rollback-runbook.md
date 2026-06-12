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
- Incident evidence is reference-only and logged in the learning ledger.
- Any unresolved item is recorded in the launch blocker ledger.
