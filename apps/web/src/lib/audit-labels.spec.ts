import { describe, expect, it } from 'vitest';
import { auditActionLabel } from './audit-labels';

describe('auditActionLabel', () => {
  it('renders Korean business labels without exposing raw enum values', () => {
    expect(auditActionLabel('DOCUMENT_UPLOADED', 'ko')).toBe('문서 업로드');
    expect(auditActionLabel('BREAK_GLASS_APPROVED', 'ko')).toBe('긴급 접근 승인');
    expect(auditActionLabel('UNKNOWN_INTERNAL_EVENT', 'ko')).toBe('기타 활동');
  });

  it('keeps the English locale readable', () => {
    expect(auditActionLabel('DOCUMENT_UPLOADED', 'en')).toBe('Document Uploaded');
  });
});
