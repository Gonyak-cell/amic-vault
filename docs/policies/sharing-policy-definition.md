# Sharing Policy Definition Only

Status: R5 definition-only control.

This policy records future sharing-control names for tenant configuration without enabling any
external sharing behavior before R11.

Allowed policy keys:

- `external_sharing`
- `secure_link`
- `external_user_access`

R5 enforcement:

- `status` must be `disabled_until_r11`.
- `enforcement_mode` must be `deny_all`.
- No endpoint may create secure links, external users, invitations, or outside-user sessions.
- No UI may expose an external recipient flow.

Implementation anchor:

- `sharing_policy_definitions` is tenant-scoped and RLS-protected.
- The table stores policy codes only. It must not store document body, client secrets, recipient
  PII, or access tokens.
