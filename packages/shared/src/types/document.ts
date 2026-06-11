import { z } from 'zod';

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

export const documentTypeSchema = z.enum(documentTypes);
export const documentStatusSchema = z.enum(documentStatuses);
export const documentConfidentialityLevelSchema = z.enum(documentConfidentialityLevels);
export const documentPrivilegeStatusSchema = z.enum(documentPrivilegeStatuses);

export type DocumentType = (typeof documentTypes)[number];
export type DocumentStatus = (typeof documentStatuses)[number];
export type DocumentConfidentialityLevel = (typeof documentConfidentialityLevels)[number];
export type DocumentPrivilegeStatus = (typeof documentPrivilegeStatuses)[number];

export interface DocumentDto {
  documentId: string;
  tenantId: string;
  matterId: string;
  documentFamilyId: string;
  title: string;
  status: DocumentStatus;
  documentType: DocumentType;
  subtype: string | null;
  confidentialityLevel: DocumentConfidentialityLevel;
  privilegeStatus: DocumentPrivilegeStatus;
  legalHold: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
