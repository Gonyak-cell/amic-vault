import { z } from 'zod';
import type { DisplayFieldsDto } from '../display/display-fields.dto';

export const documentTypes = [
  'contract',
  'memo',
  'opinion',
  'court_filing',
  'evidence',
  'email',
  'correspondence',
  'corporate_record',
  'financial',
  'other',
] as const;

export const documentStatuses = [
  'draft',
  'internal_review',
  'client_sent',
  'counterparty_sent',
  'markup_received',
  'negotiation',
  'final',
  'executed',
  'archived',
  'disposal_locked',
  'deleted',
] as const;

export const documentConfidentialityLevels = ['standard', 'high', 'restricted'] as const;
export const documentPrivilegeStatuses = [
  'none',
  'privileged',
  'work_product',
  'joint_privilege',
] as const;
export const documentSources = [
  'client_provided',
  'counterparty_provided',
  'internal_work_product',
  'public',
] as const;
export const documentVersionSignificances = [
  'internal_draft',
  'client_sent',
  'counterparty_sent',
  'negotiation',
  'final',
  'execution_copy',
] as const;
export const documentVersionRenditionTypes = ['clean', 'markup'] as const;
export const documentExtractionStatuses = ['pending', 'ready', 'ocr_pending', 'failed'] as const;
export const documentExtractionMethods = [
  'pending',
  'pdf_text',
  'docx',
  'doc',
  'hwpx',
  'hwp5',
  'email',
  'text',
  'csv',
  'markdown',
  'html',
  'xlsx',
  'xls',
  'pptx',
  'ppt',
  'ocr',
  'ocr_required',
  'failed',
] as const;
export const listDocumentSortValues = [
  'updated_desc',
  'updated_asc',
  'title_asc',
  'matter_asc',
  'type_asc',
  'status_asc',
] as const;

export const documentTypeSchema = z.enum(documentTypes);
export const documentStatusSchema = z.enum(documentStatuses);
export const documentConfidentialityLevelSchema = z.enum(documentConfidentialityLevels);
export const documentPrivilegeStatusSchema = z.enum(documentPrivilegeStatuses);
export const documentSourceSchema = z.enum(documentSources);
export const documentVersionSignificanceSchema = z.enum(documentVersionSignificances);
export const documentVersionRenditionTypeSchema = z.enum(documentVersionRenditionTypes);
export const listDocumentSortSchema = z.enum(listDocumentSortValues);

const optionalBooleanQuerySchema = z.preprocess((value) => {
  if (value === undefined || value === '') return undefined;
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean().optional());

export const listDocumentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    title: z.string().trim().min(1).max(200).optional(),
    matterCode: z.string().trim().min(1).max(80).optional(),
    matterName: z.string().trim().min(1).max(200).optional(),
    documentType: documentTypeSchema.optional(),
    status: documentStatusSchema.optional(),
    confidentialityLevel: documentConfidentialityLevelSchema.optional(),
    privilegeStatus: documentPrivilegeStatusSchema.optional(),
    source: documentSourceSchema.optional(),
    extractionStatus: z.enum(documentExtractionStatuses).optional(),
    folderId: z.string().uuid().optional(),
    tag: z.string().trim().min(1).max(80).optional(),
    aiAllowed: optionalBooleanQuerySchema,
    legalHold: optionalBooleanQuerySchema,
    sortBy: listDocumentSortSchema.optional(),
  })
  .strict();

export type DocumentType = (typeof documentTypes)[number];
export type DocumentStatus = (typeof documentStatuses)[number];
export type DocumentConfidentialityLevel = (typeof documentConfidentialityLevels)[number];
export type DocumentPrivilegeStatus = (typeof documentPrivilegeStatuses)[number];
export type DocumentSource = (typeof documentSources)[number];
export type DocumentVersionSignificance = (typeof documentVersionSignificances)[number];
export type DocumentVersionRenditionType = (typeof documentVersionRenditionTypes)[number];
export type DocumentExtractionStatus = (typeof documentExtractionStatuses)[number];
export type DocumentExtractionMethod = (typeof documentExtractionMethods)[number];
export type ListDocumentSort = (typeof listDocumentSortValues)[number];

export interface DocumentDto extends DisplayFieldsDto {
  documentId: string;
  tenantId: string;
  matterId: string;
  matterDisplayName?: string | null;
  matterDisplayCode?: string | null;
  documentFamilyId: string;
  title: string;
  status: DocumentStatus;
  documentType: DocumentType;
  subtype: string | null;
  confidentialityLevel: DocumentConfidentialityLevel;
  privilegeStatus: DocumentPrivilegeStatus;
  source: DocumentSource;
  aiAllowed: boolean;
  legalHold: boolean;
  folderId?: string | null;
  folderPath?: string | null;
  tags?: string[];
  extractionStatus?: DocumentExtractionStatus | null;
  extractionMethod?: DocumentExtractionMethod | null;
  extractionConfidence?: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListDto {
  items: DocumentDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export type ListDocumentsQueryDto = z.infer<typeof listDocumentsQuerySchema>;
