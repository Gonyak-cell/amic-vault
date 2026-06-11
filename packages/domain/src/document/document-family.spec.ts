import { describe, expect, it } from 'vitest';
import { assertDocumentFamilyInherited, initialDocumentFamilyId } from './document-family';

describe('document family rules', () => {
  it('uses the first document id as the default family id', () => {
    expect(initialDocumentFamilyId({ documentId: 'doc-1' })).toBe('doc-1');
  });

  it('requires later versions to inherit the original family id', () => {
    expect(() => assertDocumentFamilyInherited('family-1', 'family-1')).not.toThrow();
    expect(() => assertDocumentFamilyInherited('family-1', 'family-2')).toThrow(
      'DOCUMENT_FAMILY_MISMATCH',
    );
  });
});
