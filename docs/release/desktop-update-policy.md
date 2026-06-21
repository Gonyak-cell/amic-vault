# Desktop Update Policy

Date: 2026-06-21
Status: UPDATER DISABLED

## Current Position

The Tauri updater remains disabled. This is intentional: the desktop app starts with no updater plugin, no update URL, no update signing key, and an empty native capability allow-list.

LC-DESKTOP-07 documents the future update gate only. It does not enable updater behavior.

## Preconditions Before Enabling Updates

Updater work may start only after all are approved:

- ADR for desktop updater strategy;
- threat-model delta for signed updates and rollback;
- updater signing key custody plan;
- signed update manifest format;
- channel binding for local, staging, pilot, and production;
- digest pinning requirements;
- negative tests for unsigned, wrong-channel, stale, downgraded, and tampered updates;
- operator rollback procedure to browser/PWA.

## Manifest Rules

Future updater manifests must include only:

- app version;
- git SHA;
- artifact digest;
- release channel;
- signing evidence ref;
- origin config evidence ref;
- minimum supported shell version;
- rollback ref.

Future updater manifests must not include:

- private endpoint values;
- cloud account IDs;
- ARNs;
- cookies;
- tokens;
- signing secret names;
- customer data;
- customer-specific private URLs.

## Rejection Rules

The desktop app or external updater gate must reject an update when:

- artifact signature verification fails;
- manifest signature verification fails;
- artifact digest does not match the pinned digest;
- channel in the manifest differs from the installed channel;
- manifest git SHA differs from the approved release evidence ref;
- origin config signature fails;
- update would downgrade below the minimum supported shell version without rollback approval;
- manifest or artifact contains forbidden private endpoint, account, token, cookie, or customer-data markers.

## Wrong-Channel Handling

Channels are not interchangeable:

- local builds cannot update to staging, pilot, or production;
- staging cannot update to production;
- pilot cannot update to broad production without operator approval;
- production cannot update from local or staging manifests.

A wrong-channel artifact must be rejected before download or install.

## Rollback

Rollback must not depend on the updater. The baseline rollback path is:

1. stop desktop artifact distribution;
2. instruct users to access AMIC Vault through browser/PWA;
3. keep server permission, audit, and auth behavior unchanged;
4. record recalled artifact digest, version, channel, and reason code.

## Evidence

For any future updater release, record evidence refs and digests only. Do not record secrets, private endpoints, account IDs, tokens, cookies, or customer data.
