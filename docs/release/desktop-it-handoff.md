# Desktop IT Handoff

Date: 2026-06-21
Status: PREPARED

## Purpose

This handoff template gives customer or internal IT the non-secret facts required to validate, distribute, and roll back the AMIC Vault desktop shell.

## Handoff Fields

| Field | Value rule |
|---|---|
| App name | AMIC Vault |
| App version | Release evidence ref |
| Git SHA | Approved source SHA |
| Release channel | local, staging, pilot, or production |
| Artifact digest | SHA-256 digest |
| Signing evidence ref | Evidence ref only |
| Notarization evidence ref | macOS only, evidence ref only |
| Origin config evidence ref | Evidence ref only |
| Install method | `.app`, DMG, MSIX, MSI, or IT-managed package |
| Rollback ref | Browser/PWA fallback instruction |
| Support owner | Internal owner group ref |

Do not include private endpoint values, cloud account IDs, ARNs, tokens, cookies, signing secrets, customer data, or customer-private URLs.

## IT Validation Checklist

- Verify artifact digest.
- Verify signature or notarization status.
- Confirm release channel matches the approved channel.
- Confirm updater is disabled unless a future updater ADR is approved.
- Confirm browser/PWA fallback is available.
- Confirm uninstall removes only the desktop shell.
- Confirm no local document/search/AI/audit cache is created by the desktop package.

## Distribution Evidence Worksheet

Use `docs/release/desktop-native-distribution-evidence.md` to collect the
reference-only distribution evidence before pilot or production. Completed
customer/provider evidence stays in the external evidence workspace; repo
updates may record only refs, digests, owner roles, counters, and decisions.

## Support Notes

The desktop app is a thin shell over the approved AMIC Vault web origin. Server-side permission, audit, auth, search, document storage, records, and AI policy remain authoritative.

## Rollback Message

If rollback is needed, instruct users to stop using the desktop shell and access AMIC Vault through the approved browser/PWA origin while IT removes or replaces the signed desktop artifact.
