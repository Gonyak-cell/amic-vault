# ADR-015: Outlook Add-in Strategy

Status: Proposed

Source: post-R14 desktop and Microsoft 365 integration planning. Trace: ADR-014,
DEC-09, DEC-14, DEC-17, DEC-23, DEC-26, and the desktop deferred native
integration boundary in `docs/desktop/desktop-app-plan.md`.

## Context

AMIC Vault already has a PWA-first desktop strategy. That strategy deliberately
keeps the desktop surface as an access layer over the hosted Vault origin. It is
not a local Vault runtime, local document store, local search index, or audit
authority.

Law-firm users still expect Outlook-native filing flows comparable to iManage:

- file an email and attachments to a matter,
- send and file from compose,
- insert a Vault document into an email,
- reuse recent and suggested matter locations,
- map Outlook folders to matter filing targets,
- deploy the integration centrally through Microsoft 365 administration.

Those workflows must not embed the desktop client inside Outlook or create a
native bridge that bypasses the server. Outlook is a separate client surface with
its own Microsoft-hosted runtime and its own security model.

## Decision

Adopt an Outlook Web Add-in strategy for Microsoft Outlook integration. The
add-in is a thin Office.js client that talks to Vault APIs. It does not embed the
PWA or Tauri shell and does not share the browser/PWA session cookie.

The model is:

1. Keep the PWA/Tauri desktop client and Outlook add-in as separate surfaces.
2. Share identity, tenant mapping, and API contracts, not browser sessions.
3. Keep PermissionService, AuditService, PostgreSQL RLS, storage, search, email
   filing, records, external sharing policy, and AI policy on the Vault server.
4. Treat every Outlook-originated action as a normal `/v1` server action with
   permission checks, audit, idempotency, and fail-closed behavior.
5. Keep live Microsoft Graph, Nested App Authentication, tenant admin consent,
   Smart Alerts, folder mapping, and auto-file implementations blocked until a
   later integration gate approves live Microsoft 365 behavior.

The Outlook add-in can be designed now, but live implementation is split by
gate:

- OA00-OA03: governance, ADR, threat model, API contract, DTOs, and evidence
  plans are allowed now.
- OA04-OA05: server filing implementation requires Email Vault and search gates
  to remain intact.
- OA06-OA09: live Microsoft 365 behavior requires an explicit integration gate
  after the R13 reference-only enterprise baseline.
- OA08 external insertion behavior is additionally blocked by R11 external
  sharing controls.
- OA10-OA11 deployment and verification can be planned now, but production
  rollout evidence remains reference-only until live tenant approval.

## Options Considered

### Option A: Embed the desktop client in Outlook

Rejected. Outlook add-ins are not a supported place to host a local Vault
runtime or the desktop shell. This would blur session boundaries, add local
state, and increase the risk of PermissionService and AuditService bypasses.

### Option B: COM/VSTO or native Outlook plugin

Rejected as the default. New Outlook and cross-platform Outlook clients center
on web add-ins. COM/VSTO is Windows-specific and would create a parallel client
surface with higher deployment and support cost.

### Option C: Outlook Web Add-in over Vault API

Accepted as the target direction. This provides Outlook-native task pane,
ribbon command, and event handler experiences while preserving server authority.

### Option D: Server-only mailbox ingestion with no add-in

Deferred as a complementary path. Server-side Graph ingestion may later support
auto-file or folder mapping, but it cannot replace user-facing quick filing,
send-and-file confirmation, or insert-from-Vault UX.

## Consequences

- Outlook add-in work is not a desktop runtime expansion. It is a Microsoft 365
  client surface.
- The add-in cannot store document bytes, matter records, search results, audit
  rows, prompts, responses, or external sharing artifacts locally.
- Matter suggestions and recent locations are search-like surfaces and must be
  generated server-side with query-stage permission filters.
- Send-and-file Smart Alerts are UX aids, not the sole compliance control.
- Insert-from-Vault must not create public, guest, or secure links before the
  external sharing gate permits them.
- Folder mapping is sensitive matter metadata and needs audit, admin controls,
  and tenant isolation.

## Guardrails

- No shared browser/PWA session cookie.
- No Outlook-local Vault cache.
- No Graph scope wider than the approved contract.
- No live Graph/NAA/Smart Alert behavior before the integration gate.
- No public link, guest link, secure link, VDR link, or external-user path before
  the relevant R11+ controls.
- No PermissionService bypass for search, matter suggestions, filing, insert,
  status, or folder mapping.
- No audit best-effort logging; audit is part of the transaction or job
  transition.
- No document body, filename, email subject/body, raw headers, prompt, response,
  token, cookie, private endpoint, account id, or secret in repo evidence.

## Review Triggers

Revisit this ADR if:

- Microsoft 365 tenant approval is granted for live add-in deployment,
- live Entra/NAA auth is approved beyond the R13 reference-only baseline,
- a customer requires Outlook folder auto-filing before manual filing,
- insert-from-Vault requires external recipients or secure links,
- Smart Alerts fail in a supported Outlook client,
- Graph scope needs expand beyond the approved minimum.
