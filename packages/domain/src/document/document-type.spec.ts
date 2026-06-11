import { describe, expect, it } from 'vitest';
import {
  DocumentType,
  documentConfidentialityLevelValues,
  documentPrivilegeStatusValues,
  documentTypeValues,
  isDocumentConfidentialityLevel,
  isDocumentPrivilegeStatus,
  isDocumentType,
} from './document-type';

describe('document type taxonomy', () => {
  it('contains the canonical R2 document type enum values', () => {
    expect(documentTypeValues).toEqual([
      'contract',
      'memo',
      'opinion',
      'court_filing',
      'evidence',
      'correspondence',
      'corporate_record',
      'financial',
      'other',
    ]);
    expect(DocumentType.Contract).toBe('contract');
  });

  it('guards undefined document type and metadata enum values', () => {
    expect(isDocumentType('contract')).toBe(true);
    expect(isDocumentType('MA')).toBe(false);
    expect(documentConfidentialityLevelValues).toEqual(['standard', 'high', 'restricted']);
    expect(isDocumentConfidentialityLevel('restricted')).toBe(true);
    expect(isDocumentConfidentialityLevel('secret')).toBe(false);
    expect(documentPrivilegeStatusValues).toEqual([
      'none',
      'privileged',
      'work_product',
      'joint_privilege',
    ]);
    expect(isDocumentPrivilegeStatus('work_product')).toBe(true);
    expect(isDocumentPrivilegeStatus('attorney_client')).toBe(false);
  });
});
