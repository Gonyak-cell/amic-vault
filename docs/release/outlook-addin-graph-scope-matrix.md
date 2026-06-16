# Outlook Add-in Graph Scope Matrix

Status: technical-prepared, live tenant consent pending
Date: 2026-06-16
Pack: PACK-OA-06

This matrix defines the least-privilege Microsoft identity and Graph scope set
for the Outlook add-in auth/attachment gate. It does not authorize production
Microsoft 365 deployment, live mailbox access, or token storage.

## Sources

- Microsoft Graph permissions reference:
  https://learn.microsoft.com/en-us/graph/permissions-reference
- Office Add-ins nested app authentication setup:
  https://learn.microsoft.com/en-us/office/dev/add-ins/develop/enable-nested-app-authentication-in-your-add-in
- Microsoft identity platform permissions and consent overview:
  https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview
- Microsoft Graph get attachment API:
  https://learn.microsoft.com/en-us/graph/api/attachment-get?view=graph-rest-1.0
- Office Add-in admin consent for Graph scopes:
  https://learn.microsoft.com/en-us/office/dev/add-ins/publish/publish-nested-app-auth-add-in
- Microsoft identity scopes and offline access:
  https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc

## Approved Scope Registry

| Scope ID | Scope | Resource | Type | Purpose | Consent | Server token storage |
|---|---|---|---|---|---|---|
| `naa.openid` | `openid` | Microsoft identity platform | OIDC | Add-in session exchange identity bootstrap | MSAL/NAA broker default | none |
| `naa.profile` | `profile` | Microsoft identity platform | OIDC | Add-in session exchange identity bootstrap | MSAL/NAA broker default | none |
| `naa.offline-access` | `offline_access` | Microsoft identity platform | OIDC | Admin-consent broker compatibility for MSAL/NAA | MSAL/NAA broker default | prohibited |
| `graph.mail-read.attachments` | `Mail.Read` | Microsoft Graph | delegated | Read selected message attachment after Vault checks | admin-required | none |

`Mail.Read` is the only approved Microsoft Graph delegated permission for OA06
attachment acquisition. Application permissions are not approved for the add-in
path.

## Rejected Scope Examples

The OA06 implementation and review must reject over-broad or out-of-scope
permissions, including:

- `Mail.ReadWrite`
- `Mail.Send`
- `MailboxSettings.ReadWrite`
- `User.Read.All`
- `Files.Read`
- `Files.Read.All`
- `Sites.Read.All`
- `Mail.Read.Shared`
- `Mail.ReadBasic`

`Mail.ReadBasic` is not sufficient for attachment acquisition because the
attachment API requires message attachment access.

## Admin Consent Evidence

External consent reference: `PENDING-TENANT-ADMIN-CONSENT`

No tenant id, client id, concrete consent URL, redirect URL, admin account,
provider-console screenshot, token, cookie, or private endpoint is committed in
this repository. Before live enablement, Security/Ops must provide a
reference-only external evidence id proving:

- the add-in app registration has the NAA broker SPA redirect for the approved
  origin;
- the admin consent flow covers only the approved scopes above;
- consent was granted by an authorized tenant admin;
- the manifest/web application information matches the approved app
  registration;
- production runtime config keeps server-side token storage disabled.

## Runtime Gates

The repository defaults remain fail-closed:

- `OUTLOOK_AUTH_EXCHANGE_ENABLED=false`
- `OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED=false`

Even if those gates are enabled in a non-production environment, the default
identity verifier and Graph attachment transport deny by default until a
reviewed provider is wired in. The database stores only hashes, Vault refs,
safe statuses, counts, and scope-set hashes.

## Evidence Prohibitions

OA06 evidence must not include:

- access token, refresh token, id token, cookie, or raw identity assertion;
- raw mailbox address, account id, tenant id, or provider user id;
- raw Graph message id or attachment id;
- raw Graph response payload;
- attachment bytes, filenames, subject, body, headers, or participant addresses;
- concrete private endpoints or provider-console metadata.
