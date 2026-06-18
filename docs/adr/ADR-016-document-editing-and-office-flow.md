# ADR-016: Document Editing And Office Flow

Status: Proposed

Source: DMS-UX PR-B document operations plan (`DMS-UX-208`, `DMS-UX-210`).

## Context

The document detail surface needs to feel like an enterprise DMS action center,
but it must not imply editing semantics that the server does not yet enforce.
Vault already has immutable original handling, version creation, preview,
download, metadata update, legal hold state, permission checks, and audit
expectations. It does not yet have a complete controlled editing contract.

The missing pieces for live editing are:

- document lock ownership and lease/expiry behavior,
- check-out/check-in/cancel-checkout APIs,
- conflict handling when a new version appears during editing,
- Office open/save integration or coauthoring authority,
- audit events for lock, edit, check-in, abandoned edit, and conflict,
- rollback and recovery behavior if Office or storage callbacks fail.

## Decision

Adopt a read/download-only launch model for PR-B.

The production document action center may expose:

1. preview when the existing preview endpoint permits it,
2. controlled download with a reason code,
3. metadata profile read/edit through the existing metadata endpoint,
4. version history through the existing version list endpoint,
5. new version upload through the existing immutable version endpoint.

The production document action center must not expose:

1. generic "edit document" buttons,
2. check-out/check-in/cancel-checkout controls,
3. Office live edit or coauthoring claims,
4. local desktop editing bridges,
5. external sharing links as an editing workaround.

## Deferred Options

### Option A: Explicit check-out/check-in

This remains the preferred DMS-native path if Vault later implements lock state,
lease expiry, conflict handling, version upload from check-in, and audit events.

### Option B: Office integration

Office integration is deferred to the Microsoft 365/OneDrive lane. It requires
auth, storage, versioning, audit, coauthoring/lock, callback validation, and
rollback design before production UI may claim live Office editing.

### Option C: Continue read/download-only

This is accepted for PR-B. Users can preview, download, and upload a new
version without the UI pretending to support controlled editing.

## Guardrails

- No check-out/check-in UI before the backing API and audit model exist.
- No Office integration UI before the M365 integration gate approves it.
- No external sharing, secure link, client portal, or VDR path as a shortcut.
- No raw document body, raw source text, prompt, model response, token, or
  storage object URI may appear in UI evidence or logs.
- New versions must create a new version and must not overwrite the original.

## Review Triggers

Revisit this ADR when:

- lock/check-out/check-in schema and APIs are approved,
- Office or OneDrive integration receives production gate approval,
- version conflict handling becomes a user-facing workflow,
- customer requirements demand controlled editing before broader DMS rollout.
