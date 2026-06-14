# Desktop Update Policy

Status: PREPARED - UPDATER DISABLED IN PHASE 3
Date: 2026-06-14

## Phase 3 Position

The Tauri updater remains disabled in Phase 3. This is intentional: with no
updater plugin and an empty native capability allow-list, unsigned or
wrong-channel update artifacts have no in-app execution path.

## Future Updater Requirements

Before enabling desktop updates, the release must add:

- a new ADR and threat-model delta,
- Tauri updater plugin configuration,
- public verification key pinned in source,
- signed update manifest,
- channel binding for local, staging, pilot, and production,
- negative tests for unsigned artifacts, wrong-channel artifacts, stale
  manifests, and downgrade attempts,
- rollback plan that pins users to browser/PWA or a previous signed shell.

## Rejection Rules

An update must be rejected when:

- artifact signature verification fails,
- update channel does not match the approved channel,
- manifest release SHA differs from the approved evidence ref,
- origin config signature fails,
- manifest or artifact contains private endpoint values, account IDs, ARNs,
  cookies, tokens, customer data, or secret names.

## Evidence

Record evidence refs only: app version, git SHA, artifact digest, updater
manifest digest, signing evidence ref, origin config evidence ref, and rollout
channel. Do not record private URLs, signing credentials, tokens, or customer
data.
