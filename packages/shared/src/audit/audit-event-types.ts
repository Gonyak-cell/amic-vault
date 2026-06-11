export const r1AuditActions = [
  'CLIENT_CREATED',
  'CLIENT_UPDATED',
  'MATTER_CREATED',
  'MATTER_UPDATED',
  'MATTER_STATUS_CHANGED',
  'MATTER_MEMBER_ADDED',
  'MATTER_MEMBER_REMOVED',
  'MATTER_MEMBER_ROLE_CHANGED',
  'PARTY_ADDED',
  'PARTY_RESTRICTED_MARKED',
  'ROLE_ASSIGNED',
  'ROLE_CHANGED',
  'PERMISSION_CHANGED',
  'ACCESS_DENIED',
  'ETHICAL_WALL_CREATED',
  'ETHICAL_WALL_MEMBERSHIP_CHANGED',
  'ETHICAL_WALL_APPLIED',
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
] as const;

const r0CompatibilityActions = ['SESSION_REVOKED', 'PERMISSION_DENIED_HIT'] as const;

export const r2DocumentAuditActions = [
  'DOCUMENT_UPLOADED',
  'DOCUMENT_VIEWED',
  'DOCUMENT_DOWNLOADED',
  'DOCUMENT_DELETED',
  'DOCUMENT_RESTORED',
  'DOCUMENT_VERSION_ADDED',
  'DOCUMENT_METADATA_CHANGED',
  'DOCUMENT_INTEGRITY_ALERT',
  'LEGAL_HOLD_CHANGED',
] as const;

export const auditActions = [
  ...r1AuditActions,
  ...r0CompatibilityActions,
  ...r2DocumentAuditActions,
] as const;

export type R1AuditAction = (typeof r1AuditActions)[number];
export type R2DocumentAuditAction = (typeof r2DocumentAuditActions)[number];
export type AuditAction = (typeof auditActions)[number];

export function isAuditAction(value: string): value is AuditAction {
  return (auditActions as readonly string[]).includes(value);
}
