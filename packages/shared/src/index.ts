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
  isAuditAction,
  isAuditMetadataKey,
  r1AuditActions,
  type AuditAction,
  type AuditMetadata,
  type AuditMetadataKey,
  type AuditMetadataValue,
  type R1AuditAction,
} from './types/audit';

export {
  tenantStatuses,
  workspaceStatuses,
  type TenantId,
  type TenantStatus,
  type TenantSummary,
  type WorkspaceStatus,
} from './types/tenant';
export { userStatuses, type UserStatus, type UserSummary } from './types/user';
export type {
  LoginRequestDto,
  LoginResponseDto,
  PasswordResetAcceptedDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
} from './dto/auth.dto';
export type { TenantSettingsDto } from './dto/tenant-settings.dto';

export {
  clientConfidentialityLevels,
  clientConfidentialityLevelSchema,
  clientStatuses,
  clientStatusSchema,
  clientTypes,
  clientTypeSchema,
  type ClientConfidentialityLevel,
  type ClientStatus,
  type ClientType,
} from './client/client-enums';
export {
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
  type ClientDto,
  type ClientListDto,
  type CreateClientDto,
  type ListClientsQueryDto,
  type UpdateClientDto,
} from './client/client.dto';
