export const auditActions = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'SESSION_REVOKED',
  'PERMISSION_DENIED_HIT',
] as const;

export type AuditAction = (typeof auditActions)[number];

export const auditMetadataKeys = [
  'actor',
  'code',
  'correlation_id',
  'document_id',
  'hash',
  'matter_id',
  'permission_id',
  'session_id',
  'target_id',
  'target_type',
  'tenant_id',
  'user_id',
  'version_id',
] as const;

export type AuditMetadataKey = (typeof auditMetadataKeys)[number];
export type AuditMetadataValue = string | number | boolean | null;
export type AuditMetadata = Partial<Record<AuditMetadataKey, AuditMetadataValue>>;
