# Desktop Release Channels

Date: 2026-06-21
Status: PREPARED

## Principle

Desktop channels bind an artifact, an approved origin config, and an evidence ref. A desktop channel does not grant new server authority and does not replace server release gates.

## Channels

| Channel | Purpose | Origin rule | Distribution rule |
|---|---|---|---|
| local | Developer-only local validation | Signed local fixture may target `http://localhost:<port>` | Never distributed to customers. |
| staging | Internal smoke and UAT | Use approved staging origin evidence ref only | Internal users only. |
| pilot | Limited customer/IT validation | Use approved pilot origin evidence ref only | Requires digest, signing, install/uninstall, and rollback evidence. |
| production | Broad desktop distribution | Use approved production origin evidence ref only | Requires explicit desktop release approval separate from server production. |

## Channel Binding

Every channel record must bind:

- app version;
- git SHA;
- artifact digest;
- release channel;
- signed origin config evidence ref;
- signing evidence ref;
- verification receipts;
- rollback ref.

No channel record may include private endpoints, account IDs, tokens, cookies, secret names, or customer data.

## Promotion Rules

Promotion is evidence-based:

1. local proves local scaffold and policy gates;
2. staging proves signed-origin startup, navigation guard, and no-local-storage policy;
3. pilot proves customer IT install/uninstall and rollback;
4. production follows pilot approval and a separate desktop release decision.

Skipping a channel requires operator approval and a risk note in release evidence.

## Rollback

All channels must preserve browser/PWA fallback. A desktop rollback never rolls back server data, permissions, or audit history.
