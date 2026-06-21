# Desktop Windows Distribution

Date: 2026-06-21
Status: PREPARED

## Distribution Decision Tree

Choose one Windows distribution path before pilot:

| Option | Use when | Requirements |
|---|---|---|
| MSIX | Customer IT prefers managed app packaging | Signing service, package identity, install/uninstall validation, rollback evidence. |
| MSI | Customer IT requires traditional installer | Signed installer, install path policy, uninstall validation, rollback evidence. |
| MDM/software center package | Enterprise IT owns deployment | Signed payload, IT packaging evidence ref, staged rollout plan. |

No Windows installer is approved by this document alone.

## Signing

Windows signing material must live outside the repo in an HSM-backed signing service or enterprise secret manager. The repo may record only signer evidence refs and artifact digests.

## Required Build Evidence

- approved git SHA;
- desktop validator and tests;
- capability checker;
- local-storage checker;
- signed artifact digest;
- install/uninstall smoke evidence;
- rollback evidence.

## Policy Constraints

The Windows desktop shell must not introduce:

- local Vault database;
- document cache;
- search index;
- AI runtime;
- background sync;
- shell execution;
- broad filesystem access;
- Outlook or external sharing integration.

Those capabilities require separate ADRs and threat-model updates.

## Rollback

Rollback is browser/PWA first. A recalled Windows artifact must be removed from distribution channels, and the recalled artifact digest and reason code must be recorded.
