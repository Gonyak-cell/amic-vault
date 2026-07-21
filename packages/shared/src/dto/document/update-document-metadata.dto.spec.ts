import { describe, expect, it } from 'vitest';
import { updateDocumentMetadataSchema } from './update-document-metadata.dto';

describe('updateDocumentMetadataSchema', () => {
  it('accepts folder moves and root moves as document organization metadata', () => {
    expect(
      updateDocumentMetadataSchema.parse({
        folderId: '11111111-1111-4111-8111-111111111141',
      }),
    ).toEqual({ folderId: '11111111-1111-4111-8111-111111111141' });

    expect(updateDocumentMetadataSchema.parse({ folderId: null })).toEqual({ folderId: null });
  });
});
