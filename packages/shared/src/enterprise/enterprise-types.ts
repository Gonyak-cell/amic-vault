import { z } from 'zod';
import { userRoleSchema } from '../permission/roles';

const uuidSchema = z.string().uuid();
const keySchema = z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const codeSchema = z.string().trim().min(2).max(80).regex(/^[A-Z0-9][A-Z0-9._-]*$/);
const hash64Schema = z.string().trim().regex(/^[a-f0-9]{64}$/iu).transform((value) => value.toLowerCase());
const fingerprintSchema = z
  .string()
  .trim()
  .regex(/^[A-Fa-f0-9:]{47,95}$/)
  .transform((value) => value.toUpperCase());
const safeLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/(password|secret|token|api[_ -]?key|body|snippet|raw|metadata)/iu.test(value), {
    message: 'unsafe enterprise label',
  });

export const enterpriseSsoProviderStatuses = ['draft', 'active', 'disabled'] as const;
export const enterpriseSsoEnforcementModes = ['optional', 'password_disabled'] as const;
export const enterpriseKeyProviders = ['local_kms', 'cloud_kms', 'hsm'] as const;
export const enterpriseKeyStatuses = ['pending', 'active', 'rotating', 'disabled'] as const;
export const enterpriseSiemSinkTypes = ['syslog', 'webhook', 's3'] as const;
export const enterpriseBackupScopes = ['tenant', 'audit', 'configuration'] as const;
export const enterpriseBackupStatuses = ['recorded', 'verified', 'failed'] as const;
export const enterpriseComplianceFrameworks = ['soc2', 'iso27001'] as const;
export const enterpriseComplianceStatuses = ['ready', 'gap', 'accepted'] as const;

export const enterpriseSsoProviderStatusSchema = z.enum(enterpriseSsoProviderStatuses);
export const enterpriseSsoEnforcementModeSchema = z.enum(enterpriseSsoEnforcementModes);
export const enterpriseKeyProviderSchema = z.enum(enterpriseKeyProviders);
export const enterpriseKeyStatusSchema = z.enum(enterpriseKeyStatuses);
export const enterpriseSiemSinkTypeSchema = z.enum(enterpriseSiemSinkTypes);
export const enterpriseBackupScopeSchema = z.enum(enterpriseBackupScopes);
export const enterpriseBackupStatusSchema = z.enum(enterpriseBackupStatuses);
export const enterpriseComplianceFrameworkSchema = z.enum(enterpriseComplianceFrameworks);
export const enterpriseComplianceStatusSchema = z.enum(enterpriseComplianceStatuses);

export const createEnterpriseSsoProviderRequestSchema = z
  .object({
    providerKey: keySchema,
    displayName: safeLabelSchema,
    idpEntityId: keySchema,
    ssoUrlHash: hash64Schema,
    certificateFingerprint: fingerprintSchema,
    metadataHash: hash64Schema,
    defaultRole: userRoleSchema.exclude(['external_user']),
    enforcementMode: enterpriseSsoEnforcementModeSchema.default('optional'),
  })
  .strict();

export const enterpriseSsoProviderSchema = z
  .object({
    providerId: uuidSchema,
    providerKey: keySchema,
    displayName: z.string().min(1).max(200),
    protocol: z.literal('saml2'),
    status: enterpriseSsoProviderStatusSchema,
    idpEntityId: keySchema,
    ssoUrlHash: hash64Schema,
    certificateFingerprint: fingerprintSchema,
    metadataHash: hash64Schema,
    defaultRole: userRoleSchema.exclude(['external_user']),
    enforcementMode: enterpriseSsoEnforcementModeSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const enterpriseSsoProviderListResponseSchema = z
  .object({
    providers: z.array(enterpriseSsoProviderSchema).max(50),
  })
  .strict();

export const enterpriseSsoSpMetadataSchema = z
  .object({
    tenantId: uuidSchema,
    entityId: z.string().min(1).max(200),
    acsPath: z.literal('/v1/auth/saml/acs'),
    protocol: z.literal('saml2'),
    activeProviderCount: z.number().int().min(0).max(50),
  })
  .strict();

export const createEnterpriseKeyReferenceRequestSchema = z
  .object({
    keyLabel: safeLabelSchema,
    keyProvider: enterpriseKeyProviderSchema,
    keyRefHash: hash64Schema,
    keyFingerprint: hash64Schema,
    rotationDueAt: z.string().datetime().optional(),
  })
  .strict();

export const enterpriseKeyReferenceSchema = z
  .object({
    keyReferenceId: uuidSchema,
    keyLabel: z.string().min(1).max(200),
    keyProvider: enterpriseKeyProviderSchema,
    keyRefHash: hash64Schema,
    keyFingerprint: hash64Schema,
    status: enterpriseKeyStatusSchema,
    rotationDueAt: z.string().datetime().nullable(),
    lastVerifiedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const enterpriseKeyReferenceListResponseSchema = z
  .object({
    keys: z.array(enterpriseKeyReferenceSchema).max(50),
  })
  .strict();

export const createEnterpriseSiemExportRequestSchema = z
  .object({
    sinkType: enterpriseSiemSinkTypeSchema,
    endpointHash: hash64Schema,
    fromSeq: z.coerce.number().int().min(1).optional(),
    toSeq: z.coerce.number().int().min(1).optional(),
  })
  .strict()
  .refine((value) => !value.fromSeq || !value.toSeq || value.fromSeq <= value.toSeq, {
    message: 'fromSeq must be <= toSeq',
    path: ['fromSeq'],
  });

export const enterpriseSiemExportSchema = z
  .object({
    siemExportId: uuidSchema,
    sinkType: enterpriseSiemSinkTypeSchema,
    endpointHash: hash64Schema,
    seqStart: z.number().int().min(0),
    seqEnd: z.number().int().min(0),
    eventCount: z.number().int().min(0),
    manifestHash: hash64Schema,
    status: z.literal('recorded'),
    createdAt: z.string().datetime(),
  })
  .strict();

export const enterpriseSiemExportListResponseSchema = z
  .object({
    exports: z.array(enterpriseSiemExportSchema).max(50),
  })
  .strict();

export const createEnterpriseBackupSnapshotRequestSchema = z
  .object({
    scope: enterpriseBackupScopeSchema,
    reasonCode: codeSchema,
  })
  .strict();

export const enterpriseBackupSnapshotSchema = z
  .object({
    backupSnapshotId: uuidSchema,
    scope: enterpriseBackupScopeSchema,
    status: enterpriseBackupStatusSchema,
    manifestHash: hash64Schema,
    rowCountsHash: hash64Schema,
    tableCount: z.number().int().min(0),
    reasonCode: codeSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const enterpriseBackupSnapshotListResponseSchema = z
  .object({
    snapshots: z.array(enterpriseBackupSnapshotSchema).max(50),
  })
  .strict();

export const createEnterpriseComplianceEvidenceRequestSchema = z
  .object({
    framework: enterpriseComplianceFrameworkSchema,
    controlId: codeSchema,
    status: enterpriseComplianceStatusSchema,
    evidenceRef: keySchema,
    evidenceHash: hash64Schema,
    ownerUserId: uuidSchema.optional(),
  })
  .strict();

export const enterpriseComplianceEvidenceSchema = z
  .object({
    complianceEvidenceId: uuidSchema,
    framework: enterpriseComplianceFrameworkSchema,
    controlId: codeSchema,
    status: enterpriseComplianceStatusSchema,
    evidenceRef: keySchema,
    evidenceHash: hash64Schema,
    ownerUserId: uuidSchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const enterpriseComplianceEvidenceListResponseSchema = z
  .object({
    evidence: z.array(enterpriseComplianceEvidenceSchema).max(100),
  })
  .strict();

export const enterpriseReadinessSummarySchema = z
  .object({
    activeSsoProviderCount: z.number().int().min(0),
    activeKeyReferenceCount: z.number().int().min(0),
    siemExportCount: z.number().int().min(0),
    backupSnapshotCount: z.number().int().min(0),
    complianceReadyCount: z.number().int().min(0),
    complianceGapCount: z.number().int().min(0),
    technicalPass: z.boolean(),
  })
  .strict();

export type CreateEnterpriseSsoProviderRequestDto = z.infer<typeof createEnterpriseSsoProviderRequestSchema>;
export type EnterpriseSsoProviderDto = z.infer<typeof enterpriseSsoProviderSchema>;
export type EnterpriseSsoProviderListResponseDto = z.infer<typeof enterpriseSsoProviderListResponseSchema>;
export type EnterpriseSsoSpMetadataDto = z.infer<typeof enterpriseSsoSpMetadataSchema>;
export type CreateEnterpriseKeyReferenceRequestDto = z.infer<typeof createEnterpriseKeyReferenceRequestSchema>;
export type EnterpriseKeyReferenceDto = z.infer<typeof enterpriseKeyReferenceSchema>;
export type EnterpriseKeyReferenceListResponseDto = z.infer<typeof enterpriseKeyReferenceListResponseSchema>;
export type CreateEnterpriseSiemExportRequestDto = z.infer<typeof createEnterpriseSiemExportRequestSchema>;
export type EnterpriseSiemExportDto = z.infer<typeof enterpriseSiemExportSchema>;
export type EnterpriseSiemExportListResponseDto = z.infer<typeof enterpriseSiemExportListResponseSchema>;
export type CreateEnterpriseBackupSnapshotRequestDto = z.infer<typeof createEnterpriseBackupSnapshotRequestSchema>;
export type EnterpriseBackupSnapshotDto = z.infer<typeof enterpriseBackupSnapshotSchema>;
export type EnterpriseBackupSnapshotListResponseDto = z.infer<typeof enterpriseBackupSnapshotListResponseSchema>;
export type CreateEnterpriseComplianceEvidenceRequestDto = z.infer<typeof createEnterpriseComplianceEvidenceRequestSchema>;
export type EnterpriseComplianceEvidenceDto = z.infer<typeof enterpriseComplianceEvidenceSchema>;
export type EnterpriseComplianceEvidenceListResponseDto = z.infer<typeof enterpriseComplianceEvidenceListResponseSchema>;
export type EnterpriseReadinessSummaryDto = z.infer<typeof enterpriseReadinessSummarySchema>;
