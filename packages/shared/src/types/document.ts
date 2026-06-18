import { z } from 'zod';
import type { DisplayFieldsDto } from '../display/display-fields.dto';

export const documentTypes = [
  'contract',
  'memo',
  'opinion',
  'court_filing',
  'evidence',
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
export const documentExtractionStatuses = ['pending', 'ready', 'ocr_pending', 'failed'] as const;
export const documentExtractionMethods = [
  'pending',
  'pdf_text',
  'docx',
  'hwpx',
  'ocr_required',
  'failed',
] as const;

export const documentTypeSchema = z.enum(documentTypes);
export const documentStatusSchema = z.enum(documentStatuses);
export const documentConfidentialityLevelSchema = z.enum(documentConfidentialityLevels);
export const documentPrivilegeStatusSchema = z.enum(documentPrivilegeStatuses);
export const listDocumentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type DocumentType = (typeof documentTypes)[number];
export type DocumentStatus = (typeof documentStatuses)[number];
export type DocumentConfidentialityLevel = (typeof documentConfidentialityLevels)[number];
export type DocumentPrivilegeStatus = (typeof documentPrivilegeStatuses)[number];
export type DocumentExtractionStatus = (typeof documentExtractionStatuses)[number];
export type DocumentExtractionMethod = (typeof documentExtractionMethods)[number];

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
  aiAllowed: boolean;
  legalHold: boolean;
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
