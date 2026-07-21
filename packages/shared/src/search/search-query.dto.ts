import { z } from 'zod';
import {
  documentConfidentialityLevelSchema,
  documentExtractionStatuses,
  documentPrivilegeStatusSchema,
  documentTypeSchema,
  documentTypes,
  type DocumentConfidentialityLevel,
  type DocumentExtractionStatus,
  type DocumentPrivilegeStatus,
} from '../types/document';
import type { DisplayFieldsDto } from '../display/display-fields.dto';

const isoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;

export const searchDocumentTypeFilterSchema = z.union([
  documentTypeSchema,
  z.array(documentTypeSchema).min(1).max(documentTypes.length),
]);
export const searchExtractionStatusSchema = z.enum(documentExtractionStatuses);

export const searchVersionStatusValues = ['current', 'superseded', 'all'] as const;
export const searchVersionStatusSchema = z.enum(searchVersionStatusValues);
export const searchLegalHoldValues = ['document_hold', 'matter_hold', 'no_hold'] as const;
export const searchLegalHoldSchema = z.enum(searchLegalHoldValues);
export const searchRecordsStatusValues = ['active', 'archived', 'disposal_locked'] as const;
export const searchRecordsStatusSchema = z.enum(searchRecordsStatusValues);
export const searchOcrConfidenceValues = ['ocr_low_confidence'] as const;
export const searchOcrConfidenceSchema = z.enum(searchOcrConfidenceValues);
export const searchModes = ['keyword', 'semantic', 'hybrid'] as const;
export const searchModeSchema = z.enum(searchModes);
export const searchTargets = ['all', 'title', 'body', 'email', 'clause', 'authority'] as const;
export const searchTargetSchema = z.enum(searchTargets);
export const searchSorts = [
  'relevance',
  'updated_desc',
  'updated_asc',
  'title_asc',
  'matter_asc',
  'type_asc',
] as const;
export const searchSortSchema = z.enum(searchSorts);
export const searchGroupBys = ['none', 'matter', 'client', 'type'] as const;
export const searchGroupBySchema = z.enum(searchGroupBys);
export const searchUrlPrivacyModes = ['plaintext_url', 'private_saved_ref'] as const;
export const searchUrlPrivacyModeSchema = z.enum(searchUrlPrivacyModes);
export const savedSearchScopes = ['personal', 'matter-team', 'admin-shared'] as const;
export const savedSearchScopeSchema = z.enum(savedSearchScopes);
const searchTextFilterSchema = z.string().trim().min(1).max(128);

export const searchIsoDateTimeSchema = z
  .string()
  .min(1)
  .refine(
    (value) => isoDateTimePattern.test(value) && !Number.isNaN(Date.parse(value)),
    'Expected an ISO8601 date or date-time with timezone',
  );

export const searchFiltersSchema = z
  .object({
    matterId: z.string().uuid().optional(),
    clientId: z.string().uuid().optional(),
    matterCode: searchTextFilterSchema.optional(),
    matterName: searchTextFilterSchema.optional(),
    clientName: searchTextFilterSchema.optional(),
    title: searchTextFilterSchema.optional(),
    confidentialityLevel: documentConfidentialityLevelSchema.optional(),
    documentType: searchDocumentTypeFilterSchema.optional(),
    extractionStatus: searchExtractionStatusSchema.optional(),
    ocrConfidence: searchOcrConfidenceSchema.optional(),
    legalHold: searchLegalHoldSchema.optional(),
    recordsStatus: searchRecordsStatusSchema.optional(),
    privilegeStatus: documentPrivilegeStatusSchema.optional(),
    dateFrom: searchIsoDateTimeSchema.optional(),
    dateTo: searchIsoDateTimeSchema.optional(),
    versionStatus: searchVersionStatusSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.dateFrom && value.dateTo && Date.parse(value.dateFrom) > Date.parse(value.dateTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dateFrom must be before or equal to dateTo',
        path: ['dateFrom'],
      });
    }
  });

export const searchQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(2000).optional(),
    mode: searchModeSchema.default('keyword'),
    target: searchTargetSchema.default('all'),
    sortBy: searchSortSchema.default('relevance'),
    groupBy: searchGroupBySchema.default('none'),
    filters: searchFiltersSchema.optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.mode === 'semantic' || value.mode === 'hybrid') && !value.query) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'semantic and hybrid search require query',
        path: ['query'],
      });
    }
  });

export const savedSearchNameSchema = z.string().trim().min(1).max(80);

export const createSavedSearchSchema = z
  .object({
    matterId: z.string().uuid().optional(),
    name: savedSearchNameSchema,
    query: searchQuerySchema,
    scope: savedSearchScopeSchema.default('personal'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.query.query?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'saved search requires a query',
        path: ['query', 'query'],
      });
    }
    if (value.scope === 'matter-team' && !value.matterId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'matter-team saved searches require a matterId',
        path: ['matterId'],
      });
    }
  });

export const searchPrivacySettingsSchema = z
  .object({
    urlMode: searchUrlPrivacyModeSchema.default('plaintext_url'),
    allowPlaintextReusableUrls: z.boolean().optional(),
  })
  .strict()
  .transform((value) => ({
    urlMode: value.urlMode,
    allowPlaintextReusableUrls:
      value.allowPlaintextReusableUrls ?? value.urlMode === 'plaintext_url',
  }))
  .superRefine((value, ctx) => {
    if (value.urlMode === 'private_saved_ref' && value.allowPlaintextReusableUrls) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'private saved-search references cannot expose plaintext reusable URLs',
        path: ['allowPlaintextReusableUrls'],
      });
    }
  });

export interface SearchHighlightDto {
  anchorId?: string;
  start: number;
  end: number;
}

export const searchAuthorSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200).nullable().default(null),
    userId: z.string().uuid(),
  })
  .strict();

export const searchPermissionBadgesSchema = z
  .object({
    confidentiality: documentConfidentialityLevelSchema.default('standard'),
    legalHold: searchLegalHoldSchema.default('no_hold'),
    privilege: documentPrivilegeStatusSchema.default('none'),
  })
  .strict();

export const searchHighlightSchema = z
  .object({
    anchorId: z.string().trim().min(1).max(80).optional(),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  })
  .strict()
  .refine((value) => value.end >= value.start, {
    message: 'highlight end must be greater than or equal to start',
    path: ['end'],
  });

export const searchResultSchema = z
  .object({
    aiAllowed: z.boolean().default(false),
    author: searchAuthorSchema.nullable().default(null),
    authorityId: z.string().uuid().optional(),
    canViewSensitiveRef: z.boolean().optional(),
    clauseId: z.string().uuid().optional(),
    clauseKind: z.string().trim().min(1).max(80).nullable().optional(),
    clauseNumber: z.string().trim().min(1).max(80).nullable().optional(),
    citation: z.string().trim().min(1).max(500).optional(),
    clientDisplayName: z.string().nullable().optional(),
    clientId: z.string().uuid().optional(),
    contentTruncated: z.boolean().default(false),
    displayCode: z.string().nullable().optional(),
    displayEmail: z.string().nullable().optional(),
    displayName: z.string().nullable().optional(),
    documentId: z.string().uuid().optional(),
    documentType: z.string().trim().min(1).max(80),
    externalRef: z.string().trim().min(1).max(200).optional(),
    extractionStatus: z.enum(documentExtractionStatuses).nullable().optional(),
    highlights: z.array(searchHighlightSchema).default([]),
    matterDisplayCode: z.string().nullable().optional(),
    matterDisplayName: z.string().nullable().optional(),
    matterId: z.string().uuid().optional(),
    nextVersionId: z.string().uuid().nullable().default(null),
    permissionBadges: searchPermissionBadgesSchema.default({}),
    prevVersionId: z.string().uuid().nullable().default(null),
    resultKind: z.enum(['document', 'clause', 'authority']).default('document').optional(),
    safeLabel: z.string().nullable().optional(),
    score: z.number().default(0),
    snippet: z.string().max(2000).default(''),
    sourceType: z.string().trim().min(1).max(80).optional(),
    sourceUrl: z.string().trim().min(1).max(1000).optional(),
    title: z.string(),
    updatedAt: searchIsoDateTimeSchema,
    versionId: z.string().uuid().optional(),
    versionStatus: z.string().trim().min(1).max(40),
  })
  .strict();

export interface SearchAuthorDto {
  displayName: string | null;
  userId: string;
}

export interface SearchPermissionBadgesDto {
  confidentiality: DocumentConfidentialityLevel;
  legalHold: SearchLegalHold;
  privilege: DocumentPrivilegeStatus;
}

export interface SearchResultDto extends DisplayFieldsDto {
  aiAllowed: boolean;
  author: SearchAuthorDto | null;
  authorityId?: string;
  clauseId?: string;
  clauseKind?: string | null;
  clauseNumber?: string | null;
  citation?: string;
  contentTruncated: boolean;
  documentId?: string;
  versionId?: string;
  matterId?: string;
  matterDisplayName?: string | null;
  matterDisplayCode?: string | null;
  clientId?: string;
  clientDisplayName?: string | null;
  externalRef?: string;
  title: string;
  snippet: string;
  highlights: SearchHighlightDto[];
  documentType: string;
  extractionStatus?: DocumentExtractionStatus | null;
  nextVersionId: string | null;
  permissionBadges: SearchPermissionBadgesDto;
  prevVersionId: string | null;
  resultKind?: 'document' | 'clause' | 'authority';
  sourceType?: string;
  sourceUrl?: string;
  versionStatus: string;
  score: number;
  updatedAt: string;
}

export interface SearchFacetBucketDto {
  value: string;
  label?: string | null;
  count: number;
  canViewSensitiveRef?: boolean;
}

export interface SearchDateRangeFacetDto extends SearchFacetBucketDto {
  label: string;
}

export interface SearchFacetsDto {
  clients: SearchFacetBucketDto[];
  confidentialityLevels: SearchFacetBucketDto[];
  matters: SearchFacetBucketDto[];
  documentTypes: SearchFacetBucketDto[];
  extractionStatuses: SearchFacetBucketDto[];
  emailRecipientDomains: SearchFacetBucketDto[];
  emailSenderDomains: SearchFacetBucketDto[];
  ocrConfidence: SearchFacetBucketDto[];
  legalHolds: SearchFacetBucketDto[];
  privilegeStatuses: SearchFacetBucketDto[];
  recordsStatuses: SearchFacetBucketDto[];
  versionStatuses: SearchFacetBucketDto[];
  dateRanges: SearchDateRangeFacetDto[];
}

export interface SearchResponseDto {
  facets: SearchFacetsDto;
  results: SearchResultDto[];
  total: number;
}

export interface SavedSearchDto {
  canRevoke: boolean;
  createdAt: string;
  lastOpenedAt: string | null;
  name: string;
  openCount: number;
  query: SearchQueryDto;
  savedSearchId: string;
  scope: SearchFolderScope;
  updatedAt: string;
}

export interface SavedSearchListDto {
  items: SavedSearchDto[];
}

export type SearchDocumentTypeFilterDto = z.infer<typeof searchDocumentTypeFilterSchema>;
export type SearchConfidentialityLevel = DocumentConfidentialityLevel;
export type SearchVersionStatus = (typeof searchVersionStatusValues)[number];
export type SearchLegalHold = (typeof searchLegalHoldValues)[number];
export type SearchRecordsStatus = (typeof searchRecordsStatusValues)[number];
export type SearchOcrConfidence = (typeof searchOcrConfidenceValues)[number];
export type SearchPrivilegeStatus = DocumentPrivilegeStatus;
export type SearchMode = (typeof searchModes)[number];
export type SearchTarget = (typeof searchTargets)[number];
export type SearchSort = (typeof searchSorts)[number];
export type SearchGroupBy = (typeof searchGroupBys)[number];
export type SearchUrlPrivacyMode = (typeof searchUrlPrivacyModes)[number];
export type SearchFolderScope = (typeof savedSearchScopes)[number];
export type SearchFiltersDto = z.infer<typeof searchFiltersSchema>;
export type SearchPrivacySettingsDto = z.infer<typeof searchPrivacySettingsSchema>;
type ParsedSearchQueryDto = z.infer<typeof searchQuerySchema>;
export type SearchQueryDto = Omit<
  ParsedSearchQueryDto,
  'mode' | 'target' | 'sortBy' | 'groupBy'
> & {
  groupBy?: SearchGroupBy;
  mode?: SearchMode;
  sortBy?: SearchSort;
  target?: SearchTarget;
};
export interface CreateSavedSearchDto {
  matterId?: string | undefined;
  name: string;
  query: SearchQueryDto;
  scope?: SearchFolderScope | undefined;
}
