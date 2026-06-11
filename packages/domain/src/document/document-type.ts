export enum DocumentType {
  Contract = 'contract',
  Memo = 'memo',
  Opinion = 'opinion',
  CourtFiling = 'court_filing',
  Evidence = 'evidence',
  Correspondence = 'correspondence',
  CorporateRecord = 'corporate_record',
  Financial = 'financial',
  Other = 'other',
}

export const documentTypeValues = [
  DocumentType.Contract,
  DocumentType.Memo,
  DocumentType.Opinion,
  DocumentType.CourtFiling,
  DocumentType.Evidence,
  DocumentType.Correspondence,
  DocumentType.CorporateRecord,
  DocumentType.Financial,
  DocumentType.Other,
] as const;

export type DocumentTypeValue = (typeof documentTypeValues)[number];

export const documentConfidentialityLevelValues = ['standard', 'high', 'restricted'] as const;

export type DocumentConfidentialityLevel = (typeof documentConfidentialityLevelValues)[number];

export const documentPrivilegeStatusValues = [
  'none',
  'privileged',
  'work_product',
  'joint_privilege',
] as const;

export type DocumentPrivilegeStatus = (typeof documentPrivilegeStatusValues)[number];

export function isDocumentType(value: string): value is DocumentTypeValue {
  return (documentTypeValues as readonly string[]).includes(value);
}

export function isDocumentConfidentialityLevel(
  value: string,
): value is DocumentConfidentialityLevel {
  return (documentConfidentialityLevelValues as readonly string[]).includes(value);
}

export function isDocumentPrivilegeStatus(value: string): value is DocumentPrivilegeStatus {
  return (documentPrivilegeStatusValues as readonly string[]).includes(value);
}
