import { z } from 'zod';
import { documentTypeSchema, documentTypes } from '../types/document';
import type { DisplayFieldsDto } from '../display/display-fields.dto';

const isoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;

export const searchDocumentTypeFilterSchema = z.union([
  documentTypeSchema,
  z.array(documentTypeSchema).min(1).max(documentTypes.length),
]);

export const searchVersionStatusValues = ['current', 'superseded', 'all'] as const;
export const searchVersionStatusSchema = z.enum(searchVersionStatusValues);
export const searchModes = ['keyword', 'semantic', 'hybrid'] as const;
export const searchModeSchema = z.enum(searchModes);
export const searchTargets = ['all', 'title', 'body'] as const;
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
    documentType: searchDocumentTypeFilterSchema.optional(),
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

export interface SearchHighlightDto {
  start: number;
  end: number;
}

export interface SearchResultDto extends DisplayFieldsDto {
  documentId: string;
  versionId: string;
  matterId: string;
  matterDisplayName?: string | null;
  matterDisplayCode?: string | null;
  clientId: string;
  clientDisplayName?: string | null;
  title: string;
  snippet: string;
  highlights: SearchHighlightDto[];
  documentType: string;
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
  matters: SearchFacetBucketDto[];
  documentTypes: SearchFacetBucketDto[];
  versionStatuses: SearchFacetBucketDto[];
  dateRanges: SearchDateRangeFacetDto[];
}

export interface SearchResponseDto {
  facets: SearchFacetsDto;
  results: SearchResultDto[];
  total: number;
}

export type SearchDocumentTypeFilterDto = z.infer<typeof searchDocumentTypeFilterSchema>;
export type SearchVersionStatus = (typeof searchVersionStatusValues)[number];
export type SearchMode = (typeof searchModes)[number];
export type SearchTarget = (typeof searchTargets)[number];
export type SearchSort = (typeof searchSorts)[number];
export type SearchGroupBy = (typeof searchGroupBys)[number];
export type SearchFiltersDto = z.infer<typeof searchFiltersSchema>;
type ParsedSearchQueryDto = z.infer<typeof searchQuerySchema>;
export type SearchQueryDto = Omit<ParsedSearchQueryDto, 'mode' | 'target' | 'sortBy' | 'groupBy'> & {
  groupBy?: SearchGroupBy;
  mode?: SearchMode;
  sortBy?: SearchSort;
  target?: SearchTarget;
};
