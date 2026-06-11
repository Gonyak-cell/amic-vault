export const auditMetadataKeys = [
  'before_ref',
  'after_ref',
  'reason_code',
  'role_before',
  'role_after',
  'diff_keys',
  'wall_id',
  'member_user_id',
  'client_id',
  'matter_id',
  'party_id',
  'correlation_id',
  'ip_address',
  'document_id',
  'version_id',
  'hash',
  'extraction_status',
  'extraction_method',
  'confidence',
  'channel',
  'scope_type',
  'scope_id',
  'enqueued_job_count',
] as const;

export type AuditMetadataKey = (typeof auditMetadataKeys)[number];
export type AuditMetadataValue = string | number | boolean | null | readonly string[];
export type AuditMetadata = Partial<Record<AuditMetadataKey, AuditMetadataValue>>;

export function isAuditMetadataKey(value: string): value is AuditMetadataKey {
  return (auditMetadataKeys as readonly string[]).includes(value);
}
