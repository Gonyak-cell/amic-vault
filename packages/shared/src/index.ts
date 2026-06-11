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
export {
  canIssueSessionForRole,
  isUserRole,
  userRoles,
  userRoleSchema,
  type UserRole,
} from './permission/roles';
export {
  isRolePermissionAction,
  rolePermissionActions,
  rolePermissionActionSchema,
  type RolePermissionAction,
} from './permission/permission-actions';
export {
  assertCompleteRolePermissionMatrix,
  isRoleAllowedForAction,
  rolePermissionDecision,
  rolePermissionMatrix,
  type RolePermissionDecision,
  type RolePermissionMatrix,
} from './permission/role-permission-matrix';
export { assignUserRoleSchema, type AssignUserRoleDto } from './user/user-role.dto';
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
export { matterTypes, matterTypeSchema, type MatterType } from './matter/matter-type';
export {
  containsSensitiveMatterMetadataKey,
  isMatterDateRangeValid,
  matterMetadataSchema,
  matterOptionalDateSchema,
} from './matter/matter-validation';
export {
  createMatterSchema,
  listMattersQuerySchema,
  matterStatuses,
  matterStatusSchema,
  updateMatterStatusSchema,
  type CreateMatterDto,
  type ListMattersQueryDto,
  type MatterDto,
  type MatterListDto,
  type MatterStatus,
  type UpdateMatterStatusDto,
} from './matter/matter.dto';
export {
  addMatterMemberSchema,
  matterMemberAccessLevelSchema,
  matterMemberAccessLevels,
  matterMemberRoleSchema,
  matterMemberRoles,
  updateMatterMemberSchema,
  type AddMatterMemberDto,
  type MatterMemberAccessLevel,
  type MatterMemberDto,
  type MatterMemberListDto,
  type MatterMemberRole,
  type UpdateMatterMemberDto,
} from './matter/matter-member.dto';
export {
  createEthicalWallSchema,
  ethicalWallStatuses,
  wallMembershipTypes,
  wallSubjectTypes,
  type CreateEthicalWallDto,
  type CreateEthicalWallMemberDto,
  type EthicalWallDto,
  type EthicalWallMembershipDto,
  type EthicalWallStatus,
  type WallMembershipType,
  type WallSubjectType,
} from './ethical-wall/ethical-wall.dto';
