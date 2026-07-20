import { describe, expect, it } from 'vitest';
import { uploadDocumentFieldsSchema } from './upload-document.dto';

describe('uploadDocumentFieldsSchema', () => {
  it('parses multipart file organization prep consent explicitly', () => {
    expect(uploadDocumentFieldsSchema.parse({ aiAllowed: 'true' })).toMatchObject({
      aiAllowed: true,
    });
    expect(uploadDocumentFieldsSchema.parse({ aiAllowed: 'false' })).toMatchObject({
      aiAllowed: false,
    });
    expect(uploadDocumentFieldsSchema.parse({})).toEqual({});
  });

  it('rejects ambiguous boolean transport values', () => {
    expect(() => uploadDocumentFieldsSchema.parse({ aiAllowed: 'yes' })).toThrow();
  });

  it('accepts a bounded upload preflight reference', () => {
    expect(uploadDocumentFieldsSchema.parse({ uploadPreflightRef: 'upf_ref' })).toEqual({
      uploadPreflightRef: 'upf_ref',
    });
    expect(() => uploadDocumentFieldsSchema.parse({ uploadPreflightRef: '' })).toThrow();
  });

  it('accepts duplicate upload decisions without file hashes', () => {
    expect(
      uploadDocumentFieldsSchema.parse({
        duplicateDecision: 'new_version',
        duplicateTargetDocumentId: '11111111-1111-4111-8111-111111111112',
      }),
    ).toEqual({
      duplicateDecision: 'new_version',
      duplicateTargetDocumentId: '11111111-1111-4111-8111-111111111112',
    });
    expect(() => uploadDocumentFieldsSchema.parse({ duplicateDecision: 'overwrite' })).toThrow();
  });

  it('parses folder upload organization fields from multipart-safe values', () => {
    expect(
      uploadDocumentFieldsSchema.parse({
        sourceRelativePath: 'Closing/Final/contract.pdf',
        tags: 'closing, executed',
      }),
    ).toMatchObject({
      sourceRelativePath: 'Closing/Final/contract.pdf',
      tags: ['closing', 'executed'],
    });
    expect(
      uploadDocumentFieldsSchema.parse({
        folderId: '11111111-1111-4111-8111-111111111112',
        tags: '["closing","executed"]',
      }),
    ).toMatchObject({
      folderId: '11111111-1111-4111-8111-111111111112',
      tags: ['closing', 'executed'],
    });
  });
});
