export const auditMetadataKeys = [
  'before_ref',
  'after_ref',
  'reason_code',
  'role_before',
  'role_after',
  'diff_keys',
  'wall_id',
  'request_id',
  'requester_user_id',
  'approver_user_id',
  'revoked_by_user_id',
  'approval_count',
  'expires_at',
  'member_user_id',
  'client_id',
  'matter_id',
  'party_id',
  'correlation_id',
  'ip_address',
  'document_id',
  'file_object_id',
  'version_id',
  'hash',
  'extraction_status',
  'extraction_method',
  'confidence',
  'channel',
  'scope_type',
  'scope_id',
  'enqueued_job_count',
  'query_hash',
  'query_length',
  'filter_refs',
  'result_count',
  'duration_ms',
  'export_format',
  'policy_id',
  'model_route',
  'decision_ref',
  'document_count',
  'blocked_reason',
] as const;

export type AuditMetadataKey = (typeof auditMetadataKeys)[number];
export type AuditMetadataValue = string | number | boolean | null | readonly string[];
export type AuditMetadata = Partial<Record<AuditMetadataKey, AuditMetadataValue>>;

export function isAuditMetadataKey(value: string): value is AuditMetadataKey {
  return (auditMetadataKeys as readonly string[]).includes(value);
}
