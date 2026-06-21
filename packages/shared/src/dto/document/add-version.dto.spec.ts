import { describe, expect, it } from 'vitest';
import { addDocumentVersionFieldsSchema } from './add-version.dto';

describe('addDocumentVersionFieldsSchema', () => {
  it('accepts upload preflight refs and duplicate version decisions only from the shared enum', () => {
    expect(
      addDocumentVersionFieldsSchema.parse({
        uploadPreflightRef: 'upf_ref',
        duplicateDecision: 'new_version',
      }),
    ).toEqual({
      uploadPreflightRef: 'upf_ref',
      duplicateDecision: 'new_version',
    });
    expect(() =>
      addDocumentVersionFieldsSchema.parse({ duplicateDecision: 'overwrite' }),
    ).toThrow();
  });
});
