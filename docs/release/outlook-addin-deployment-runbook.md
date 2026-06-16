# Outlook Add-in Deployment Runbook

Status: OA10 technical-prepared. No live Microsoft 365 tenant deployment is
authorized by this repository artifact.

Pack: PACK-OA-10

## Purpose

Define the staged rollout, evidence, support, disable, and rollback procedure
for the AMIC Vault Outlook Web Add-in after ADR-015 and the live Microsoft 365
integration gate are approved. The Outlook add-in remains a thin Office.js
client over Vault APIs. It is not a desktop shell embed, local runtime, local
cache, mailbox sync authority, or audit authority.

## Non-Negotiable Boundaries

- No tenant id, tenant domain, tenant-bound app/client id, admin consent URL,
  redirect URL, private endpoint, account id, token, cookie,
  provider-console screenshot, mailbox address, raw Outlook id, raw folder
  name, raw folder path, document body, filename, or customer document is
  committed to this repository.
- No production Outlook deployment before OA11 evidence, tenant-admin approval,
  and operator rollout approval.
- No live Graph/NAA/Smart Alert behavior unless the corresponding server gate,
  manifest gate, and external admin-consent evidence are approved.
- No external sharing link behavior before the R11+ external-sharing policy gate
  permits the exact channel.
- No Outlook-local Vault cache, offline filing queue, local document bytes, or
  mailbox-derived local persistence is introduced.
- All evidence committed here is reference-only. Concrete provider evidence
  stays in approved external systems.

## Deployment Authorities

| Role | Authority | Repository rule |
|---|---|---|
| Operator | Approves each rollout ring and production enablement | Records reference IDs only |
| Microsoft 365 admin | Deploys, scopes, disables, and removes the add-in in Integrated Apps | Does not commit admin-center screenshots or URLs |
| Security/Ops | Approves Graph scopes, NAA registration evidence, and rollback readiness | Records scope/evidence refs only |
| Product/Support owner | Approves pilot support readiness and user communication | Records support ref only |
| Codex | Maintains repo-local checks, docs, tests, and PR evidence | Does not self-merge Risk=C packs |

## Required Repository Evidence

| Evidence ID | Requirement | Source |
|---|---|---|
| `EV-OUTLOOK-001` | ADR, threat model, API contract, OA00-OA11 plan prepared | `docs/release/evidence-register.md` |
| `EV-OUTLOOK-002` | Non-production manifest validation evidence ref prepared or blocked | `docs/release/evidence-register.md` |
| `EV-OUTLOOK-003` | Graph scope and admin-consent external ref prepared or blocked | `docs/release/outlook-addin-graph-scope-matrix.md` |
| `EV-OUTLOOK-004` | OA11 verification matrix prepared | `docs/execution/TUW_OUTLOOK_ADDIN_OA00_OA11.md` |
| `EV-OUTLOOK-005` | Disable and rollback path prepared | This runbook |
| `EV-OUTLOOK-006` | Auth and Graph gate implementation evidence prepared | PACK-OA-06 |
| `EV-OUTLOOK-007` | Smart Alert send-and-file evidence prepared | PACK-OA-07 |
| `EV-OUTLOOK-008` | Insert-from-Vault evidence prepared | PACK-OA-08 |
| `EV-OUTLOOK-009` | Folder mapping and auto-file evidence prepared | PACK-OA-09 |
| `EV-OUTLOOK-010` | OA10 deployment readiness checklist prepared | This runbook and `pnpm outlook:deployment:check` |
| `EV-OUTLOOK-011` | OA11 verification closeout prepared | `docs/release/outlook-addin-verification-matrix.md` |
| `EV-OUTLOOK-012` | Operational gate implementation prepared | `docs/release/outlook-operational-gates.md` and `pnpm outlook:operational:check` |

## Runtime Gate Order

All gates default to false in the repository and must be enabled only in an
approved environment after the matching evidence exists:

1. `OUTLOOK_ADDIN_ENABLED`
2. `OUTLOOK_AUTH_EXCHANGE_ENABLED`
3. `OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED`
4. `OUTLOOK_SMART_ALERTS_ENABLED`
5. `OUTLOOK_SEND_FILE_ENABLED`
6. `OUTLOOK_DOCUMENT_INSERTION_ENABLED`
7. `OUTLOOK_FOLDER_MAPPING_ENABLED`
8. `OUTLOOK_AUTOFILE_ENABLED`

Gate enablement must be recorded as an external change ticket or deployment ref.
The repository stores the ref, not the runtime values, target endpoints, tenant
ids, or screenshots.

This is the operational enablement sequence, not a claim that server runtime
checks are chained in this exact order; each endpoint still enforces its own
fail-closed permission, audit, tenant, and feature gates.

## Manifest Validation

The committed manifest is a development artifact and may use localhost URLs.
Non-development manifests are produced outside the repository from approved
environment configuration.

Manifest validation requires:

- XML parse succeeds with `xmllint --noout apps/web/public/outlook-addin/manifest.xml`;
- `ReadItem` is the only base mailbox permission;
- no `ReadWriteMailbox`, `Mail.Send`, broad Graph scope, token, or
  `WebApplicationInfo` value is committed in the development manifest;
- Smart Alerts `OnMessageSend` remains soft-block and policy-server driven;
- the non-production manifest origin, app registration, redirect URI, and
  admin-consent state are recorded only by external evidence ref;
- add-in/API cross-origin and cookie-domain behavior is validated in the target
  environment before enabling Smart Alerts.

Stop if any manifest evidence includes tenant domains, app ids, consent URLs,
private endpoints, provider-console screenshots, or account identifiers.

## Microsoft 365 Integrated Apps Rollout Rings

| Ring | Audience | Enablement | Exit criteria |
|---|---|---|---|
| Ring 0 | IT/security admins | Integrated Apps deployment to admin-only group | Manifest validation, scope review, task pane launch, disable/remove rehearsal, and reference-only evidence pass |
| Ring 1 | Pilot practice group | Selected internal matter team | Filing, suggestion, send-policy, insert, folder mapping, denied states, and support triage pass OA11 matrix |
| Ring 2 | Broader firm pilot | Additional practice groups | Telemetry counters are stable, duplicate/idempotency behavior is proven, support issues are resolved or logged |
| Ring 3 | Production availability | Approved firm-wide audience | Operator approval, OA11 matrix pass, rollback evidence, support readiness, and external admin evidence complete |

No ring may expand while an earlier ring has an open permission, tenant
isolation, audit, DLP, Graph-scope, metadata leakage, duplicate filing, or
rollback finding.

## Ring 0 Procedure

1. Verify this repository is at an approved merge SHA.
2. Run repo-local validation:
   - `pnpm outlook:deployment:check`
   - `pnpm docs:frozen`
   - `pnpm backlog:validate`
   - `git diff --check`
3. Validate the development manifest statically and the environment manifest in
   the non-production tenant.
4. Confirm `docs/release/outlook-addin-graph-scope-matrix.md` still approves
   only the least-privilege scopes.
5. Deploy through Microsoft 365 Integrated Apps to the admin-only group.
6. Keep all Outlook feature gates disabled until task pane visibility and
   disable/remove behavior are proven.
7. Enable one gate at a time only if its matching implementation evidence is
   green and the external rollout ref exists.
8. Record a reference-only evidence ID. Do not commit provider screenshots,
   tenant ids, domains, URLs, cookies, tokens, or account identifiers.

## Ring 1 And Ring 2 Procedure

1. Confirm Ring 0 disable/remove rehearsal passed.
2. Confirm support owner and rollback authority are assigned.
3. Enable only the feature flags approved for that ring.
4. Run the OA11 matrix for the exact ring scope:
   - permission negative paths,
   - audit action coverage,
   - metadata leakage checks,
   - tenant isolation checks,
   - idempotency/dedupe checks,
   - Graph scope drift checks,
   - offline and Smart Alert failure paths.
5. Review bounded telemetry counters. Do not inspect or export raw mailbox
   content, subjects, addresses, filenames, folder names, or Graph payloads.
6. Expand only after all blocking findings are closed.

## Production Readiness Checklist

Production enablement is blocked until every item is proven by reference-only
evidence:

- [ ] ADR-015 is accepted by the operator/human decision process.
- [ ] Outlook threat model delta is accepted.
- [ ] API contract is implemented or explicitly marked deferred for every
      endpoint in the target rollout scope.
- [ ] `EV-OUTLOOK-001` through `EV-OUTLOOK-010` are present and current.
- [ ] `EV-OUTLOOK-011` and `EV-OUTLOOK-012` are present and current.
- [ ] `EV-OUTLOOK-002` manifest validation is no longer blocked for the target
      non-production tenant.
- [ ] `EV-OUTLOOK-003` admin consent evidence is no longer blocked for the
      approved Graph scope set.
- [ ] `pnpm outlook:deployment:check` passes.
- [ ] `pnpm outlook:verification:check` passes.
- [ ] `pnpm outlook:redaction:check` passes.
- [ ] `pnpm outlook:operational:check -- --target production --mode enforce` passes.
- [ ] Production runtime uses `NODE_ENV=production`, approved rollout ring,
      opaque evidence refs, and `OUTLOOK_AUDIT_AVAILABLE=true` before any
      Outlook feature flag is enabled.
- [ ] `pnpm docs:frozen` passes.
- [ ] OA11 permission, audit, leakage, tenant isolation, idempotency, Graph
      scope, offline, Smart Alert, and evidence matrices pass.
- [ ] Microsoft 365 admin can disable and remove the add-in for the target
      audience.
- [ ] Browser/PWA fallback path is available and does not use Outlook-local
      cached Vault data.
- [ ] Support escalation owner and incident communication path are approved.
- [ ] No private tenant/provider evidence is present in the repository.

## Disable And Rollback

Rollback is the default response to unexpected metadata leakage, permission
denial mismatch, audit gap, excessive Graph scope, unexpected Outlook host
behavior, tenant isolation issue, duplicate filing, or support-critical client
failure.

### Immediate Disable

1. Stop ring expansion.
2. Disable the affected feature gates in the runtime environment, starting with
   the most recently enabled gate.
3. Disable or remove the add-in for the affected Microsoft 365 group through
   Integrated Apps.
4. Keep PWA/browser Vault paths available when server-side permission and audit
   gates are healthy.
5. Preserve filing request, insertion, folder mapping, auto-file job, and audit
   rows. Do not delete evidence rows.
6. Record only reference IDs, release SHA, check IDs, support ticket refs, and
   non-secret incident refs.

### Feature Flag Rollback Map

| Symptom | First rollback action | Secondary action |
|---|---|---|
| Task pane launch or manifest error | Remove add-in from affected ring | Return users to browser/PWA |
| Session exchange mismatch | Disable `OUTLOOK_AUTH_EXCHANGE_ENABLED` | Remove add-in if identity ambiguity remains |
| Graph scope or attachment issue | Disable `OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED` | Revoke or narrow external consent before retry |
| Smart Alert unavailable or host failure | Disable `OUTLOOK_SMART_ALERTS_ENABLED` | Keep send allowed without local filing success |
| Send-and-file audit/permission issue | Disable `OUTLOOK_SEND_FILE_ENABLED` | Use task pane filing only if OA11 still passes |
| Insert policy issue | Disable `OUTLOOK_DOCUMENT_INSERTION_ENABLED` | Continue browser document access |
| Folder mapping issue | Disable `OUTLOOK_FOLDER_MAPPING_ENABLED` | Preserve mappings for audit; do not delete |
| Auto-file issue | Disable `OUTLOOK_AUTOFILE_ENABLED` | Keep manual filing available if safe |

### Browser/PWA Fallback

The fallback path is the approved Vault browser/PWA surface. It must:

- use the same server-owned permission, audit, search, records, AI, and tenant
  controls;
- avoid Outlook-local document bytes, mailbox payloads, or offline filing
  success claims;
- keep offline shell content non-data-bearing;
- keep support instructions free of private endpoints or provider metadata.

## Support Escalation

| Severity | Trigger | Owner | Required evidence |
|---|---|---|---|
| Sev 1 | Tenant isolation, permission bypass, audit write failure, metadata leak | Security/Ops and operator | Incident ref, disabled gate refs, check IDs |
| Sev 2 | Filing duplicate, Smart Alert unexpected block, Graph consent/scope mismatch | Engineering and Microsoft 365 admin | Ring ref, bounded status counts, rollback decision |
| Sev 3 | Task pane UI issue, manifest visibility issue, user education gap | Support owner | Support ticket ref, affected ring, no private screenshots |

Support evidence must not include mailbox content, subject/body text, folder
names, filenames, raw addresses, provider-console screenshots, endpoint URLs,
cookies, tokens, or customer data.

## Bounded Telemetry

Track only counters and reference IDs:

- add-in session exchange success/denial count,
- filing request queued/completed/denied/failed count,
- duplicate idempotency hit count,
- matter suggestion denied count,
- Smart Alert unavailable count,
- Smart Alert allow/warn/block policy count,
- send-and-file requested/denied count,
- Graph acquisition denied count,
- insert policy denied count,
- folder mapping disabled/changed count,
- auto-file disabled/queued/denied/retrying count.

Do not record message subject/body, participant addresses, filenames, raw folder
names, raw folder paths, prompt/response text, Graph payloads, endpoint URLs,
token values, cookies, provider-console screenshots, or account identifiers.

## Stop Conditions

Stop deployment and escalate if any of the following occurs:

- PermissionService, tenant validation, or audit writes are bypassed.
- Any raw Outlook field, mailbox identifier, folder name, folder path, filename,
  subject, body, Graph payload, token, cookie, tenant id, endpoint, or provider
  metadata is committed or logged.
- Graph scopes differ from `docs/release/outlook-addin-graph-scope-matrix.md`.
- A ring cannot be disabled or removed by Microsoft 365 admin.
- OA11 verification evidence is incomplete, stale, or contradictory.
- Rollback depends on deleting audit, filing, folder mapping, auto-file, or
  request rows.

## Evidence IDs

Use the `EV-OUTLOOK-*` family. All concrete tenant/provider evidence remains
outside the repository. Repository evidence may contain only evidence IDs,
status, owner role, command names, non-secret check refs, PR refs, and release
SHAs.
