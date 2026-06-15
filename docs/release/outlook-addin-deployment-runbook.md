# Outlook Add-in Deployment Runbook

Status: planning only. No live Microsoft 365 tenant deployment is authorized by
this runbook.

## Purpose

Define how AMIC Vault will deploy an Outlook Web Add-in after ADR-015 and the
live Microsoft 365 integration gate are approved. This runbook keeps tenant
admin rollout, consent, rollback, support, and evidence separated from the
desktop PWA/Tauri path.

## Non-Negotiable Boundaries

- No tenant id, domain, admin consent URL, private endpoint, account id, token,
  cookie, screenshot with provider metadata, or customer document in repo.
- No production Outlook deployment before OA11 evidence and tenant approval.
- No live Graph/NAA/Smart Alert behavior before OA06/OA07 approval.
- No external sharing link behavior before the R11+ external-sharing policy
  gate permits the exact channel.
- No local Vault cache or offline filing queue.

## Rollout Rings

| Ring | Audience | Purpose | Exit Criteria |
|---|---|---|---|
| Ring 0 | IT/security admins | Manifest, consent, scope, disable/rollback rehearsal | Admin can deploy and remove add-in without data exposure. |
| Ring 1 | Internal product/legal pilot | File-to-matter happy path and safe denied states | OA11 permission/audit/leakage matrix green. |
| Ring 2 | One practice group | Matter suggestions and filing throughput | Support runbook and telemetry are sufficient. |
| Ring 3 | Broader firm | Firm-wide Outlook availability | Rollback and alert paths pass. |

## Pre-Deployment Checklist

- ADR-015 accepted by operator/human decision.
- Outlook threat model delta accepted.
- API contract implemented and tested.
- Filing request idempotency tests green.
- Matter suggestion permission tests green.
- Audit event allow-list updated and tested.
- Graph scope matrix approved.
- Tenant admin consent external evidence ref recorded outside repo.
- Add-in manifest validated in a non-production tenant.
- Rollback rehearsal completed.
- Support owner and escalation path recorded.

## Deployment Steps

1. Validate manifest in a non-production Microsoft 365 tenant.
2. Confirm requested scopes match the approved Graph scope registry.
3. Deploy to Ring 0 through Microsoft 365 Integrated Apps.
4. Run OA11 smoke and negative tests.
5. Record reference-only evidence ID in `docs/release/evidence-register.md`.
6. Expand to Ring 1 only after Ring 0 rollback rehearsal passes.
7. Expand by ring after support and telemetry review.

## Rollback

Rollback is the default response to unexpected metadata leakage, permission
denial mismatch, audit gap, excessive Graph scope, or Outlook client failure.

Steps:

1. Disable the add-in in Microsoft 365 admin center for the affected group.
2. Confirm task pane/ribbon commands disappear for pilot users.
3. Disable corresponding Vault feature flags if server endpoints were enabled.
4. Keep PWA/browser filing paths available.
5. Preserve filing request/job/audit records; do not delete evidence rows.
6. Record a reference-only rollback evidence ref.

## Support Signals

Track only bounded counters and refs:

- add-in session exchange success/denial count,
- filing request queued/completed/denied/failed count,
- duplicate idempotency hit count,
- matter suggestion denied count,
- Smart Alert unavailable count,
- Graph acquisition denied count,
- insert policy denied count,
- folder mapping disabled/changed count.

Do not record message subject/body, participant addresses, filenames, raw folder
names, prompt/response text, Graph payloads, endpoint URLs, token values, or
provider-console screenshots.

## Evidence IDs

Use the `EV-OUTLOOK-*` family:

- `EV-OUTLOOK-001`: ADR/threat model/API planning complete.
- `EV-OUTLOOK-002`: non-production manifest validation prepared.
- `EV-OUTLOOK-003`: Graph scope/admin consent reference prepared.
- `EV-OUTLOOK-004`: OA11 verification matrix prepared.
- `EV-OUTLOOK-005`: deployment rollback rehearsal prepared.

All concrete tenant/provider evidence remains outside the repository.
