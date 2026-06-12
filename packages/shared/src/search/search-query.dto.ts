import { z } from 'zod';
import { documentTypeSchema, documentTypes } from '../types/document';

const isoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;

export const searchDocumentTypeFilterSchema = z.union([
  documentTypeSchema,
  z.array(documentTypeSchema).min(1).max(documentTypes.length),
]);

export const searchVersionStatusValues = ['current', 'superseded', 'all'] as const;
export const searchVersionStatusSchema = z.enum(searchVersionStatusValues);

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
    filters: searchFiltersSchema.optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export interface SearchHighlightDto {
  start: number;
  end: number;
}

export interface SearchResultDto {
  documentId: string;
  versionId: string;
  matterId: string;
  clientId: string;
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
  count: number;
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
export type SearchFiltersDto = z.infer<typeof searchFiltersSchema>;
export type SearchQueryDto = z.infer<typeof searchQuerySchema>;
