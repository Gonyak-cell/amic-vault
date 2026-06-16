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
  'DOCUMENT_TEXT_EXTRACTED',
] as const;

export const r3SearchAuditActions = ['SEARCH_REINDEX_REQUESTED', 'SEARCH_EXECUTED'] as const;

export const r4DlpAuditActions = ['DLP_SCAN_COMPLETED', 'DLP_FINDING_RECORDED'] as const;

export const r5DlpAuditActions = ['DLP_EGRESS_BLOCKED'] as const;

export const r5BreakGlassAuditActions = [
  'BREAK_GLASS_REQUESTED',
  'BREAK_GLASS_APPROVED',
  'BREAK_GLASS_ACTIVATED',
  'BREAK_GLASS_USED',
  'BREAK_GLASS_REVOKED',
  'BREAK_GLASS_EXPIRED',
] as const;

export const r5AuditConsoleActions = ['AUDIT_QUERY_EXECUTED', 'AUDIT_EXPORT_CREATED'] as const;

export const r6AiPolicyAuditActions = ['AI_POLICY_EVALUATED'] as const;

export const r6AiAuditActions = [
  'AI_QUERY_SUBMITTED',
  'AI_RETRIEVAL',
  'AI_RESPONSE',
  'AI_CITED_DOCUMENT',
  'AI_RETRIEVAL_EXCLUDED',
] as const;

export const r6AiPrepAuditActions = [
  'AI_PREP_REQUESTED',
  'AI_PREP_COMPLETED',
  'AI_PREP_BLOCKED',
  'AI_PREP_FAILED',
  'AI_PREP_REJECTED',
  'AI_PREP_STALE',
] as const;

export const r6AiFeedbackAuditActions = ['AI_FEEDBACK_RECORDED'] as const;

export const r7GraphAuditActions = [
  'GRAPH_SYNCED',
  'GRAPH_QUERY_EXECUTED',
  'GRAPH_CONSISTENCY_CHECKED',
] as const;

export const r8ContractAuditActions = [
  'CONTRACT_CLASSIFIED',
  'CONTRACT_CLAUSES_EXTRACTED',
  'CONTRACT_TERMS_EXTRACTED',
  'CONTRACT_REDLINE_PARSED',
  'PLAYBOOK_RULE_CHANGED',
  'CONTRACT_RULE_EVALUATED',
  'CONTRACT_CLAUSE_BANK_VIEWED',
] as const;

export const r9DdAuditActions = [
  'DD_RFI_CHANGED',
  'DD_DATA_ROOM_MAPPED',
  'DD_ISSUE_CHANGED',
  'DD_RISK_CHANGED',
  'DD_TRACE_VIEWED',
] as const;

export const r10LitigationAuditActions = [
  'LIT_EVIDENCE_CHANGED',
  'LIT_FACT_CHANGED',
  'LIT_ISSUE_TREE_CHANGED',
  'LIT_PLEADING_CHANGED',
  'LIT_CASE_MAP_VIEWED',
] as const;

export const r11ExternalAuditActions = [
  'EXTERNAL_USER_CHANGED',
  'EXTERNAL_WORKSPACE_CHANGED',
  'EXTERNAL_LINK_CREATED',
  'EXTERNAL_LINK_REVOKED',
  'EXTERNAL_LINK_ACCESSED',
  'EXTERNAL_NDA_ACCEPTED',
  'EXTERNAL_DLP_WARNING_BLOCKED',
  'EXTERNAL_DLP_WARNING_ACCEPTED',
  'EXTERNAL_DOWNLOAD_REQUESTED',
  'EXTERNAL_QA_MESSAGE_RECORDED',
] as const;

export const r12RecordsAuditActions = [
  'RETENTION_POLICY_CHANGED',
  'LEGAL_HOLD_APPLIED',
  'LEGAL_HOLD_RELEASED',
  'RECORD_ARCHIVED',
  'DISPOSAL_REQUESTED',
  'DISPOSAL_APPROVED',
  'DISPOSAL_EXECUTED',
  'DISPOSAL_CERTIFICATE_CREATED',
] as const;

export const r13EnterpriseAuditActions = [
  'SSO_PROVIDER_CHANGED',
  'SSO_METADATA_VIEWED',
  'BYOK_KEY_REFERENCE_CHANGED',
  'SIEM_EXPORT_RECORDED',
  'BACKUP_SNAPSHOT_RECORDED',
  'COMPLIANCE_EVIDENCE_RECORDED',
  'ENTERPRISE_READINESS_VIEWED',
] as const;

export const r14ScaleLearningAuditActions = [
  'SCALE_PERFORMANCE_RECORDED',
  'SCALE_COST_SNAPSHOT_RECORDED',
  'SCALE_EVAL_RUN_RECORDED',
  'SCALE_MIGRATION_DRILL_RECORDED',
  'SCALE_LEARNING_EVENT_RECORDED',
  'ADVANCED_AI_GATE_REVIEWED',
  'SCALE_READINESS_VIEWED',
] as const;

export const r4EmailAuditActions = [
  'EMAIL_IMPORTED',
  'EMAIL_DUPLICATE_BLOCKED',
  'EMAIL_METADATA_UPDATED',
  'EMAIL_FILED',
] as const;

export const outlookAuditActions = [
  'OUTLOOK_ADDIN_SESSION_EXCHANGED',
  'OUTLOOK_ADDIN_SESSION_DENIED',
  'OUTLOOK_EMAIL_FILE_REQUESTED',
  'OUTLOOK_EMAIL_FILE_COMPLETED',
  'OUTLOOK_EMAIL_FILE_DENIED',
  'OUTLOOK_EMAIL_FILE_FAILED',
  'OUTLOOK_EMAIL_FILE_CANCELLED',
  'OUTLOOK_ATTACHMENT_FILED',
  'OUTLOOK_MATTER_SUGGESTIONS_VIEWED',
  'OUTLOOK_SEND_FILE_REQUESTED',
  'OUTLOOK_SEND_FILE_DENIED',
  'OUTLOOK_DOCUMENT_INSERT_REQUESTED',
  'OUTLOOK_DOCUMENT_INSERT_DENIED',
  'OUTLOOK_FOLDER_MAPPING_CHANGED',
  'OUTLOOK_AUTOFILE_JOB_RECORDED',
  'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_REQUESTED',
  'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRED',
  'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_DENIED',
] as const;

export const auditActions = [
  ...r1AuditActions,
  ...r0CompatibilityActions,
  ...r2DocumentAuditActions,
  ...r3SearchAuditActions,
  ...r4DlpAuditActions,
  ...r5DlpAuditActions,
  ...r5BreakGlassAuditActions,
  ...r5AuditConsoleActions,
  ...r6AiPolicyAuditActions,
  ...r6AiAuditActions,
  ...r6AiPrepAuditActions,
  ...r6AiFeedbackAuditActions,
  ...r7GraphAuditActions,
  ...r8ContractAuditActions,
  ...r9DdAuditActions,
  ...r10LitigationAuditActions,
  ...r11ExternalAuditActions,
  ...r12RecordsAuditActions,
  ...r13EnterpriseAuditActions,
  ...r14ScaleLearningAuditActions,
  ...r4EmailAuditActions,
  ...outlookAuditActions,
] as const;

export type R1AuditAction = (typeof r1AuditActions)[number];
export type R2DocumentAuditAction = (typeof r2DocumentAuditActions)[number];
export type R3SearchAuditAction = (typeof r3SearchAuditActions)[number];
export type R4DlpAuditAction = (typeof r4DlpAuditActions)[number];
export type R5DlpAuditAction = (typeof r5DlpAuditActions)[number];
export type R5BreakGlassAuditAction = (typeof r5BreakGlassAuditActions)[number];
export type R5AuditConsoleAction = (typeof r5AuditConsoleActions)[number];
export type R6AiPolicyAuditAction = (typeof r6AiPolicyAuditActions)[number];
export type R6AiAuditAction = (typeof r6AiAuditActions)[number];
export type R6AiPrepAuditAction = (typeof r6AiPrepAuditActions)[number];
export type R6AiFeedbackAuditAction = (typeof r6AiFeedbackAuditActions)[number];
export type R7GraphAuditAction = (typeof r7GraphAuditActions)[number];
export type R8ContractAuditAction = (typeof r8ContractAuditActions)[number];
export type R9DdAuditAction = (typeof r9DdAuditActions)[number];
export type R10LitigationAuditAction = (typeof r10LitigationAuditActions)[number];
export type R11ExternalAuditAction = (typeof r11ExternalAuditActions)[number];
export type R12RecordsAuditAction = (typeof r12RecordsAuditActions)[number];
export type R13EnterpriseAuditAction = (typeof r13EnterpriseAuditActions)[number];
export type R14ScaleLearningAuditAction = (typeof r14ScaleLearningAuditActions)[number];
export type R4EmailAuditAction = (typeof r4EmailAuditActions)[number];
export type OutlookAuditAction = (typeof outlookAuditActions)[number];
export type AuditAction = (typeof auditActions)[number];

export function isAuditAction(value: string): value is AuditAction {
  return (auditActions as readonly string[]).includes(value);
}
