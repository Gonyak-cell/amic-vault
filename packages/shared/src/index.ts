import { z } from 'zod';

export const ERROR_CODES = [
  'AUTH_REQUIRED',
  'PERMISSION_DENIED',
  'ETHICAL_WALL_BLOCKED',
  'AI_POLICY_BLOCKED',
  'DOCUMENT_LOCKED',
  'VALIDATION_FAILED',
  'UNSUPPORTED_FILE_TYPE',
  'EXTERNAL_LINK_EXPIRED',
  'TENANT_ISOLATION_VIOLATION',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);

export interface ApiErrorResponse {
  code: ErrorCode;
  message?: string;
  requestId?: string;
}

export {
  auditActions,
  auditMetadataKeys,
  type AuditAction,
  type AuditMetadata,
  type AuditMetadataKey,
  type AuditMetadataValue,
} from './types/audit';

export {
  tenantStatuses,
  workspaceStatuses,
  type TenantId,
  type TenantStatus,
  type TenantSummary,
  type WorkspaceStatus,
} from './types/tenant';
export type { TenantSettingsDto } from './dto/tenant-settings.dto';
