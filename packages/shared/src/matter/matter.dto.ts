import { z } from 'zod';
import { matterTypeSchema } from './matter-type';
import type { DisplayFieldsDto } from '../display/display-fields.dto';
import {
  containsSensitiveMatterMetadataKey,
  isMatterDateRangeValid,
  matterMetadataSchema,
  matterOptionalDateSchema,
} from './matter-validation';

export const matterStatuses = [
  'proposed',
  'open',
  'active',
  'closing',
  'closed',
  'archived',
  'disposal_review',
  'disposed',
] as const;

export const matterStatusSchema = z.enum(matterStatuses);

export const matterAccessScopes = ['firm_open', 'restricted'] as const;
export const matterAccessScopeSchema = z.enum(matterAccessScopes);

export const matterConfidentialityLevels = ['standard', 'high', 'restricted'] as const;
export const matterConfidentialityLevelSchema = z.enum(matterConfidentialityLevels);

export const matterConflictStatuses = ['not_started', 'in_review', 'cleared', 'blocked'] as const;
export const matterConflictStatusSchema = z.enum(matterConflictStatuses);

export const matterRelationTypes = ['preceding', 'parallel', 'subsequent'] as const;
export const matterRelationTypeSchema = z.enum(matterRelationTypes);

export const matterIntakeTemplateCodes = ['default_open', 'restricted'] as const;
export const matterIntakeTemplateCodeSchema = z.enum(matterIntakeTemplateCodes);
export const matterIntakeTemplateAccessScopes = {
  default_open: 'firm_open',
  restricted: 'restricted',
} as const satisfies Record<
  (typeof matterIntakeTemplateCodes)[number],
  (typeof matterAccessScopes)[number]
>;

export const matterIssueStatuses = ['open', 'monitoring', 'resolved'] as const;
export const matterIssueStatusSchema = z.enum(matterIssueStatuses);

export const matterIssueRiskLevels = ['low', 'medium', 'high', 'critical'] as const;
export const matterIssueRiskLevelSchema = z.enum(matterIssueRiskLevels);

export const matterKeyDateTypes = ['court', 'contractual', 'internal'] as const;
export const matterKeyDateTypeSchema = z.enum(matterKeyDateTypes);

export const matterKeyDateStatuses = ['pending', 'completed', 'cancelled'] as const;
export const matterKeyDateStatusSchema = z.enum(matterKeyDateStatuses);

export const matterKeyDateSourceTypes = ['core', 'litigation_pleading', 'dd_rfi'] as const;
export const matterKeyDateSourceTypeSchema = z.enum(matterKeyDateSourceTypes);

export const matterClosingChecklistItemCodes = [
  'execution_copy_designated',
  'official_final_version',
  'legal_hold_clear',
  'external_links_clear',
  'issues_resolved',
] as const;
export const matterClosingChecklistItemCodeSchema = z.enum(matterClosingChecklistItemCodes);

export const matterClosingChecklistStatuses = ['pending', 'passed', 'waived'] as const;
export const matterClosingChecklistStatusSchema = z.enum(matterClosingChecklistStatuses);

export const matterClosingBinderStatuses = ['draft', 'finalized'] as const;
export const matterClosingBinderStatusSchema = z.enum(matterClosingBinderStatuses);

export const matterClosingBinderItemTypes = [
  'execution_copy',
  'final_version',
  'key_email',
] as const;
export const matterClosingBinderItemTypeSchema = z.enum(matterClosingBinderItemTypes);

export const knowledgeCandidateTypes = ['executed', 'opinion', 'clause_source'] as const;
export const knowledgeCandidateTypeSchema = z.enum(knowledgeCandidateTypes);

export const knowledgeCandidateStatuses = ['proposed', 'approved', 'rejected'] as const;
export const knowledgeCandidateStatusSchema = z.enum(knowledgeCandidateStatuses);

export const knowledgeCandidateReviewActions = ['approve', 'reject'] as const;
export const knowledgeCandidateReviewActionSchema = z.enum(knowledgeCandidateReviewActions);

export const matterWikiPageKinds = ['overview', 'issue', 'party', 'timeline'] as const;
export const matterWikiPageKindSchema = z.enum(matterWikiPageKinds);

export const matterWikiPageProvenances = ['derived', 'ai_proposed', 'human_confirmed'] as const;
export const matterWikiPageProvenanceSchema = z.enum(matterWikiPageProvenances);

export const matterWikiReviewStatuses = ['proposed', 'confirmed', 'rejected'] as const;
export const matterWikiReviewStatusSchema = z.enum(matterWikiReviewStatuses);

export const matterWikiReviewActions = ['confirm', 'reject'] as const;
export const matterWikiReviewActionSchema = z.enum(matterWikiReviewActions);

const safeMatterWorkItemTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine((value) => !/(password|secret|token)/iu.test(value), {
    message: 'unsafe title token',
  });

const safeMatterWorkItemSummarySchema = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => !/(password|secret|token)/iu.test(value), {
    message: 'unsafe summary token',
  });

const baseMatterMutationSchema = z
  .object({
    accessScope: matterAccessScopeSchema.optional(),
    clientId: z.string().uuid(),
    confidentialityLevel: matterConfidentialityLevelSchema.default('standard'),
    intakeTemplateCode: matterIntakeTemplateCodeSchema.optional(),
    matterCode: z.string().trim().min(1).max(120),
    matterName: z.string().trim().min(1).max(1000),
    matterType: matterTypeSchema,
    leadLawyerId: z.string().uuid().optional(),
    leadPartnerId: z.string().uuid().optional(),
    leadAssociateId: z.string().uuid().optional(),
    practiceGroup: z.string().trim().min(1).max(128).optional(),
    openedAt: matterOptionalDateSchema,
    closedAt: matterOptionalDateSchema,
    metadata: matterMetadataSchema.optional(),
  })
  .strict();

export const createMatterSchema = baseMatterMutationSchema
  .refine((input) => isMatterDateRangeValid(input.openedAt, input.closedAt), {
    message: 'closedAt must be after openedAt',
    path: ['closedAt'],
  })
  .refine((input) => !containsSensitiveMatterMetadataKey(input.metadata ?? {}), {
    message: 'metadata contains sensitive keys',
    path: ['metadata'],
  });

export const updateMatterSchema = z
  .object({
    accessScope: matterAccessScopeSchema.optional(),
    confidentialityLevel: matterConfidentialityLevelSchema.optional(),
    leadPartnerId: z.string().uuid().nullable().optional(),
    leadAssociateId: z.string().uuid().nullable().optional(),
    matterName: z.string().trim().min(1).max(1000).optional(),
    practiceGroup: z.string().trim().min(1).max(128).optional(),
    metadata: matterMetadataSchema.optional(),
  })
  .strict()
  .refine((input) => !containsSensitiveMatterMetadataKey(input.metadata ?? {}), {
    message: 'metadata contains sensitive keys',
    path: ['metadata'],
  });

export const listMattersQuerySchema = z
  .object({
    status: matterStatusSchema.optional(),
    matterType: matterTypeSchema.optional(),
    clientId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const updateMatterStatusSchema = z
  .object({
    status: matterStatusSchema,
  })
  .strict();

export const waiveMatterClosingChecklistItemSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(8)
      .max(500)
      .refine((value) => !/(password|secret|token)/iu.test(value), {
        message: 'unsafe waive reason token',
      }),
  })
  .strict();

export const reviewKnowledgeCandidateSchema = z
  .object({
    action: knowledgeCandidateReviewActionSchema,
    reviewReason: z
      .string()
      .trim()
      .min(8)
      .max(500)
      .refine((value) => !/(password|secret|token)/iu.test(value), {
        message: 'unsafe review reason token',
      })
      .default('work_queue_review'),
  })
  .strict();

export const reviewMatterWikiPageSchema = z
  .object({
    action: matterWikiReviewActionSchema,
    reviewReason: z
      .string()
      .trim()
      .min(8)
      .max(500)
      .refine((value) => !/(password|secret|token)/iu.test(value), {
        message: 'unsafe review reason token',
      })
      .default('wiki_page_review'),
  })
  .strict();

export const createMatterRelatedMatterSchema = z
  .object({
    relatedMatterId: z.string().uuid(),
    relationType: matterRelationTypeSchema,
  })
  .strict();

export const deleteMatterRelatedMatterQuerySchema = z
  .object({
    relationType: matterRelationTypeSchema,
  })
  .strict();

export const createMatterIssueSchema = z
  .object({
    title: safeMatterWorkItemTitleSchema,
    summary: safeMatterWorkItemSummarySchema.nullish(),
    status: matterIssueStatusSchema.default('open'),
    riskLevel: matterIssueRiskLevelSchema.default('medium'),
  })
  .strict();

export const updateMatterIssueSchema = z
  .object({
    title: safeMatterWorkItemTitleSchema.optional(),
    summary: safeMatterWorkItemSummarySchema.nullish(),
    status: matterIssueStatusSchema.optional(),
    riskLevel: matterIssueRiskLevelSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  });

export const createMatterKeyDateSchema = z
  .object({
    title: safeMatterWorkItemTitleSchema,
    dueDate: z.string().date(),
    dateType: matterKeyDateTypeSchema.default('internal'),
    status: matterKeyDateStatusSchema.default('pending'),
    assignedToUserId: z.string().uuid().nullish(),
  })
  .strict();

export const updateMatterKeyDateSchema = z
  .object({
    title: safeMatterWorkItemTitleSchema.optional(),
    dueDate: z.string().date().optional(),
    dateType: matterKeyDateTypeSchema.optional(),
    status: matterKeyDateStatusSchema.optional(),
    assignedToUserId: z.string().uuid().nullish(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  });

export interface MatterDto extends DisplayFieldsDto {
  accessScope?: MatterAccessScope;
  matterId: string;
  tenantId: string;
  clientId: string;
  clientDisplayName?: string | null;
  confidentialityLevel: MatterConfidentialityLevel;
  matterCode: string;
  matterName: string;
  matterType: string;
  status: string;
  conflictsStatus: MatterConflictStatus;
  openedAt: string | null;
  closedAt: string | null;
  leadLawyerId: string | null;
  leadLawyerDisplayName?: string | null;
  leadLawyerDisplayEmail?: string | null;
  leadPartnerId: string | null;
  leadPartnerDisplayName?: string | null;
  leadPartnerDisplayEmail?: string | null;
  leadAssociateId: string | null;
  leadAssociateDisplayName?: string | null;
  leadAssociateDisplayEmail?: string | null;
  practiceGroup: string | null;
  metadata: Record<string, string>;
  legalHold: boolean;
  ethicalWallActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatterRelatedMatterDto extends DisplayFieldsDto {
  linkId: string;
  matterId: string;
  relatedMatterId: string;
  relationType: MatterRelationType;
  canReadRelatedMatter: boolean;
  relatedMatterCode: string | null;
  relatedMatterName: string | null;
  relatedMatterStatus: MatterStatus | null;
  relatedMatterType: string | null;
  createdAt: string;
}

export interface MatterRelatedMatterListDto {
  items: MatterRelatedMatterDto[];
}

export interface MatterIssueDto {
  issueId: string;
  matterId: string;
  title: string;
  summary: string | null;
  status: MatterIssueStatus;
  riskLevel: MatterIssueRiskLevel;
  createdAt: string;
  updatedAt: string;
}

export interface MatterIssueListDto {
  matterId: string;
  items: MatterIssueDto[];
}

export interface MatterKeyDateDto {
  keyDateId: string;
  coreKeyDateId: string | null;
  matterId: string;
  title: string;
  dueDate: string;
  dateType: MatterKeyDateType;
  status: MatterKeyDateStatus;
  assignedToUserId: string | null;
  sourceType: MatterKeyDateSourceType;
  sourceId: string;
  mutable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatterKeyDateListDto {
  matterId: string;
  items: MatterKeyDateDto[];
}

export interface MatterClosingChecklistItemDto {
  checklistItemId: string;
  matterId: string;
  itemCode: MatterClosingChecklistItemCode;
  status: MatterClosingChecklistStatus;
  reasonCode: string;
  evidenceRef: string | null;
  waivedBy: string | null;
  waivedReason: string | null;
  evaluatedAt: string;
  updatedAt: string;
}

export interface MatterClosingChecklistDto {
  matterId: string;
  complete: boolean;
  items: MatterClosingChecklistItemDto[];
}

export interface MatterClosingBinderManifestItemDto {
  itemId: string;
  itemType: MatterClosingBinderItemType;
  title: string;
  sha256: string;
  documentId: string | null;
  versionId: string | null;
  versionLabel: string | null;
  emailId: string | null;
  sourceRef: string;
}

export interface MatterClosingBinderManifestDto {
  schemaVersion: 1;
  matterId: string;
  generatedAt: string;
  items: MatterClosingBinderManifestItemDto[];
}

export interface MatterClosingBinderDto {
  closingBinderId: string;
  matterId: string;
  status: MatterClosingBinderStatus;
  manifestSha256: string;
  manifest: MatterClosingBinderManifestDto;
  recordsArchiveCount: number;
  createdBy: string;
  finalizedBy: string | null;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatterClosingBinderResponseDto {
  matterId: string;
  binder: MatterClosingBinderDto | null;
}

export interface MatterClosingBinderManifestDownloadDto {
  body: string;
  filename: string;
  mimeType: string;
}

export interface KnowledgeCandidateDto {
  candidateId: string;
  matterId: string;
  documentId: string;
  versionId: string;
  candidateType: KnowledgeCandidateType;
  status: KnowledgeCandidateStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  workItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatterWikiSourceRefDto {
  sourceRef: string;
  sourceKind: 'ai_claim' | 'litigation_fact' | 'dd_issue' | 'dd_risk' | 'graph_node';
  documentId?: string | null;
  versionId?: string | null;
  nodeId?: string | null;
}

export interface MatterWikiPageDto {
  pageId: string;
  matterId: string;
  pageKind: MatterWikiPageKind;
  title: string;
  markdownBody: string;
  sourceRefs: MatterWikiSourceRefDto[];
  provenance: MatterWikiPageProvenance;
  reviewStatus: MatterWikiReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  workItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatterWikiListDto {
  matterId: string;
  pages: MatterWikiPageDto[];
}

export interface MatterWikiRegenerateResponseDto extends MatterWikiListDto {
  generatedCount: number;
}

export interface MatterWikiExportDto {
  filename: string;
  mimeType: 'application/zip';
  body: Uint8Array;
  pageCount: number;
  sha256: string;
}

export interface MatterDashboardMatterSummaryDto {
  matterCode: string;
  matterName: string;
  clientDisplayName: string | null;
  status: MatterStatus;
  confidentialityLevel: MatterConfidentialityLevel;
}

export interface MatterDashboardRecentActivityDto {
  actionLabel: string;
  targetLabel: string;
  resultLabel: string;
  occurredAt: string;
}

export interface MatterDashboardKeyDocumentDto {
  title: string;
  source: string;
  versionLabel: string | null;
  versionSignificance: string;
  updatedAt: string;
}

export interface MatterDashboardIssueSummaryDto {
  openCount: number;
  highestRiskLevel: MatterIssueRiskLevel | null;
}

export interface MatterDashboardKeyDateDto {
  title: string;
  dueDate: string;
  dateType: MatterKeyDateType;
  status: MatterKeyDateStatus;
  sourceType: MatterKeyDateSourceType;
}

export interface MatterDashboardExternalActivityDto {
  workspaceCode: string;
  displayRef: string;
  status: string;
  activeLinkCount: number;
  accessCount: number;
  expiresAt: string;
  updatedAt: string;
}

export interface MatterDashboardAiSessionDto {
  sessionId: string;
  ownerUserId: string;
  modelRoute: string;
  status: string;
  latencyMs: number | null;
  escalationRequired: boolean;
  blockedReason: string | null;
  policySummary: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatterDashboardDto {
  generatedAt: string;
  matterId: string;
  matterSummary: MatterDashboardMatterSummaryDto;
  recentActivity: MatterDashboardRecentActivityDto[];
  keyDocuments: MatterDashboardKeyDocumentDto[];
  issueSummary: MatterDashboardIssueSummaryDto;
  upcomingKeyDates: MatterDashboardKeyDateDto[];
  externalActivity: MatterDashboardExternalActivityDto[];
  aiSessions: MatterDashboardAiSessionDto[];
}

export interface MatterListDto {
  items: MatterDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export type MatterStatus = (typeof matterStatuses)[number];
export type MatterAccessScope = (typeof matterAccessScopes)[number];
export type MatterConfidentialityLevel = (typeof matterConfidentialityLevels)[number];
export type MatterConflictStatus = (typeof matterConflictStatuses)[number];
export type MatterRelationType = (typeof matterRelationTypes)[number];
export type MatterIntakeTemplateCode = (typeof matterIntakeTemplateCodes)[number];
export type MatterIssueStatus = (typeof matterIssueStatuses)[number];
export type MatterIssueRiskLevel = (typeof matterIssueRiskLevels)[number];
export type MatterKeyDateType = (typeof matterKeyDateTypes)[number];
export type MatterKeyDateStatus = (typeof matterKeyDateStatuses)[number];
export type MatterKeyDateSourceType = (typeof matterKeyDateSourceTypes)[number];
export type MatterClosingChecklistItemCode = (typeof matterClosingChecklistItemCodes)[number];
export type MatterClosingChecklistStatus = (typeof matterClosingChecklistStatuses)[number];
export type MatterClosingBinderStatus = (typeof matterClosingBinderStatuses)[number];
export type MatterClosingBinderItemType = (typeof matterClosingBinderItemTypes)[number];
export type KnowledgeCandidateType = (typeof knowledgeCandidateTypes)[number];
export type KnowledgeCandidateStatus = (typeof knowledgeCandidateStatuses)[number];
export type KnowledgeCandidateReviewAction = z.infer<typeof knowledgeCandidateReviewActionSchema>;
export type MatterWikiPageKind = (typeof matterWikiPageKinds)[number];
export type MatterWikiPageProvenance = (typeof matterWikiPageProvenances)[number];
export type MatterWikiReviewStatus = (typeof matterWikiReviewStatuses)[number];
export type MatterWikiReviewAction = z.infer<typeof matterWikiReviewActionSchema>;
export type CreateMatterDto = z.input<typeof createMatterSchema>;
export type CreateMatterRelatedMatterDto = z.infer<typeof createMatterRelatedMatterSchema>;
export type CreateMatterIssueDto = z.input<typeof createMatterIssueSchema>;
export type UpdateMatterIssueDto = z.infer<typeof updateMatterIssueSchema>;
export type CreateMatterKeyDateDto = z.input<typeof createMatterKeyDateSchema>;
export type UpdateMatterKeyDateDto = z.infer<typeof updateMatterKeyDateSchema>;
export type DeleteMatterRelatedMatterQueryDto = z.infer<
  typeof deleteMatterRelatedMatterQuerySchema
>;
export type ListMattersQueryDto = z.infer<typeof listMattersQuerySchema>;
export type UpdateMatterDto = z.infer<typeof updateMatterSchema>;
export type UpdateMatterStatusDto = z.infer<typeof updateMatterStatusSchema>;
export type WaiveMatterClosingChecklistItemDto = z.infer<
  typeof waiveMatterClosingChecklistItemSchema
>;
export type ReviewKnowledgeCandidateDto = z.infer<typeof reviewKnowledgeCandidateSchema>;
export type ReviewMatterWikiPageDto = z.infer<typeof reviewMatterWikiPageSchema>;
