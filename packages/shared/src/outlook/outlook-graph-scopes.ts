export const outlookGraphScopePurposes = [
  'session_exchange',
  'attachment_acquisition',
  'admin_consent_broker',
] as const;
export type OutlookGraphScopePurpose = (typeof outlookGraphScopePurposes)[number];

export const outlookGraphConsentKinds = [
  'admin-required',
  'admin-preferred',
  'msal-broker-default',
] as const;
export type OutlookGraphConsentKind = (typeof outlookGraphConsentKinds)[number];

export interface OutlookGraphScopeRegistryEntry {
  scopeId: string;
  scope: string;
  resource: 'microsoft-identity-platform' | 'microsoft-graph';
  permissionType: 'oidc' | 'delegated';
  purpose: OutlookGraphScopePurpose;
  consent: OutlookGraphConsentKind;
  tokenStorage: 'none' | 'prohibited';
  leastPrivilege: boolean;
  notes: string;
}

export const outlookApprovedGraphScopeRegistry = [
  {
    scopeId: 'naa.openid',
    scope: 'openid',
    resource: 'microsoft-identity-platform',
    permissionType: 'oidc',
    purpose: 'session_exchange',
    consent: 'msal-broker-default',
    tokenStorage: 'none',
    leastPrivilege: true,
    notes: 'Identity claim bootstrap for NAA; Vault stores no token value.',
  },
  {
    scopeId: 'naa.profile',
    scope: 'profile',
    resource: 'microsoft-identity-platform',
    permissionType: 'oidc',
    purpose: 'session_exchange',
    consent: 'msal-broker-default',
    tokenStorage: 'none',
    leastPrivilege: true,
    notes: 'MSAL broker default identity scope; Vault stores no profile payload.',
  },
  {
    scopeId: 'naa.offline-access',
    scope: 'offline_access',
    resource: 'microsoft-identity-platform',
    permissionType: 'oidc',
    purpose: 'admin_consent_broker',
    consent: 'msal-broker-default',
    tokenStorage: 'prohibited',
    leastPrivilege: true,
    notes: 'Consent URI may include it for MSAL/NAA, but server refresh-token storage is prohibited.',
  },
  {
    scopeId: 'graph.mail-read.attachments',
    scope: 'Mail.Read',
    resource: 'microsoft-graph',
    permissionType: 'delegated',
    purpose: 'attachment_acquisition',
    consent: 'admin-required',
    tokenStorage: 'none',
    leastPrivilege: true,
    notes: 'Least-privileged delegated permission for reading message attachments.',
  },
] as const satisfies readonly OutlookGraphScopeRegistryEntry[];

export const outlookRejectedGraphScopes = [
  'Mail.ReadWrite',
  'Mail.Send',
  'MailboxSettings.ReadWrite',
  'User.Read.All',
  'Files.Read',
  'Files.Read.All',
  'Sites.Read.All',
  'Mail.Read.Shared',
  'Mail.ReadBasic',
] as const;

export function outlookApprovedScopeNames(): readonly string[] {
  return outlookApprovedGraphScopeRegistry.map((entry) => entry.scope);
}

export function outlookApprovedScopeSetHashSource(): string {
  return outlookApprovedGraphScopeRegistry
    .map((entry) => `${entry.scopeId}:${entry.resource}:${entry.scope}:${entry.permissionType}`)
    .sort()
    .join('|');
}
