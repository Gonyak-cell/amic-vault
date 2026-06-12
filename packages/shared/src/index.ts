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
  r2DocumentAuditActions,
  r3SearchAuditActions,
  r4DlpAuditActions,
  type AuditAction,
  type AuditMetadata,
  type AuditMetadataKey,
  type AuditMetadataValue,
  type R1AuditAction,
  type R2DocumentAuditAction,
  type R3SearchAuditAction,
  type R4DlpAuditAction,
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
export type { FileObjectDto } from './types/file-object';
export {
  documentConfidentialityLevelSchema,
  documentConfidentialityLevels,
  documentPrivilegeStatusSchema,
  documentPrivilegeStatuses,
  documentExtractionMethods,
  documentExtractionStatuses,
  documentStatusSchema,
  documentStatuses,
  documentTypeSchema,
  documentTypes,
  type DocumentConfidentialityLevel,
  type DocumentDto,
  type DocumentExtractionMethod,
  type DocumentExtractionStatus,
  type DocumentPrivilegeStatus,
  type DocumentStatus,
  type DocumentType,
} from './types/document';
export {
  dlpFindingTypes,
  dlpRuleIds,
  type DlpDetection,
  type DlpFindingType,
  type DlpRuleId,
  type DlpScanOptions,
} from './dlp/dlp-types';
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
export {
  allowPermission,
  denyPermission,
  type PermissionDecision,
  type PermissionEffect,
  type PermissionReasonCode,
} from './permission/permission-decision';
export type {
  DocumentPermissionService,
  PermissionContext,
} from './permission/document-permission.interface';
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
  uploadDocumentFieldsSchema,
  type DocumentMetadataSuggestionDto,
  type UploadDocumentFieldsDto,
  type UploadDocumentResponseDto,
} from './dto/document/upload-document.dto';
export {
  addDocumentVersionFieldsSchema,
  type AddDocumentVersionFieldsDto,
  type AddDocumentVersionResponseDto,
} from './dto/document/add-version.dto';
export {
  documentVersionStatusSchema,
  documentVersionStatuses,
  listDocumentVersionsQuerySchema,
  type DocumentVersionDto,
  type DocumentVersionListDto,
  type DocumentVersionStatus,
  type ListDocumentVersionsQueryDto,
} from './dto/document/version-list.dto';
export {
  updateDocumentMetadataSchema,
  type UpdateDocumentMetadataDto,
} from './dto/document/update-document-metadata.dto';
export {
  documentDownloadReasonCodes,
  documentDownloadReasonCodeSchema,
  documentDownloadReasonQuerySchema,
  type DocumentDownloadReasonCode,
  type DocumentDownloadReasonQueryDto,
} from './dto/document/download-reason.dto';
export { updateLegalHoldSchema, type UpdateLegalHoldDto } from './dto/legal-hold.dto';
export {
  bulkUploadFileSchema,
  bulkUploadJobItemSchema,
  bulkUploadJobSchema,
  bulkUploadQueueName,
  type BulkUploadFailedItemDto,
  type BulkUploadItemResultDto,
  type BulkUploadJobDto,
  type BulkUploadJobItemDto,
  type BulkUploadReportDto,
  type BulkUploadSuccessItemDto,
} from './dto/document/bulk-upload.dto';
export {
  documentAuditQueryEventTypeSchema,
  documentAuditQuerySchema,
  type DocumentAuditEventDto,
  type DocumentAuditEventListDto,
  type DocumentAuditQueryDto,
  type DocumentAuditQueryEventType,
} from './dto/audit/audit-query.dto';
export {
  searchDocumentTypeFilterSchema,
  searchFiltersSchema,
  searchIsoDateTimeSchema,
  searchQuerySchema,
  searchVersionStatusSchema,
  searchVersionStatusValues,
  type SearchDateRangeFacetDto,
  type SearchDocumentTypeFilterDto,
  type SearchFacetBucketDto,
  type SearchFacetsDto,
  type SearchFiltersDto,
  type SearchHighlightDto,
  type SearchQueryDto,
  type SearchResponseDto,
  type SearchResultDto,
  type SearchVersionStatus,
} from './search/search-query.dto';

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
  updateMatterSchema,
  updateMatterStatusSchema,
  type CreateMatterDto,
  type ListMattersQueryDto,
  type MatterDto,
  type MatterListDto,
  type MatterStatus,
  type UpdateMatterDto,
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
export {
  partyRoleSchema,
  partyRoles,
  partyTypeSchema,
  partyTypes,
  type PartyRole,
  type PartyType,
} from './party/party-enums';
export {
  createPartySchema,
  listPartiesQuerySchema,
  updatePartySchema,
  type CreatePartyDto,
  type ListPartiesQueryDto,
  type PartyDto,
  type PartyListDto,
  type UpdatePartyDto,
} from './party/party.dto';
