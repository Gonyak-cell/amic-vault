import type {
  DocumentConfidentialityLevel,
  DocumentPrivilegeStatus,
  UserRole,
} from '@amic-vault/shared';

export type DocumentPermissionAction =
  | 'read'
  | 'download'
  | 'checkout'
  | 'save_subversion'
  | 'read_subversion'
  | 'checkin'
  | 'promote_version';

export function effectiveConfidentialityLevel(input: {
  confidentialityLevel: DocumentConfidentialityLevel;
  privilegeStatus: DocumentPrivilegeStatus;
}): DocumentConfidentialityLevel {
  if (input.confidentialityLevel !== 'standard') return input.confidentialityLevel;
  return input.privilegeStatus === 'none' ? 'standard' : 'high';
}

export function requiresExplicitDocumentAllow(level: DocumentConfidentialityLevel): boolean {
  return level === 'high' || level === 'restricted';
}

export function requiresDownloadReason(level: DocumentConfidentialityLevel): boolean {
  return requiresExplicitDocumentAllow(level);
}

export function roleAllowsDocumentAction(role: UserRole, action: DocumentPermissionAction): boolean {
  if (role === 'external_user') return false;
  if (action === 'read') {
    return (
      role === 'firm_admin' ||
      role === 'security_admin' ||
      role === 'matter_owner' ||
      role === 'matter_member' ||
      role === 'limited_reviewer' ||
      role === 'knowledge_manager'
    );
  }
  if (action === 'download' || action === 'read_subversion') {
    return role === 'matter_owner' || role === 'matter_member' || role === 'limited_reviewer';
  }
  if (action === 'promote_version') {
    return role === 'matter_owner';
  }
  return role === 'matter_owner' || role === 'matter_member';
}
