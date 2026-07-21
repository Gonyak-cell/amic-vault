import { describe, expect, it } from 'vitest';
import { addDocumentVersionFieldsSchema } from './add-version.dto';

describe('addDocumentVersionFieldsSchema', () => {
  const baseCleanVersionId = '11111111-1111-4111-8111-111111111155';

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

  it('accepts counterparty markup versions only when linked to a clean base version', () => {
    expect(
      addDocumentVersionFieldsSchema.parse({
        versionLabel: 'Counterparty markup v2',
        versionSignificance: 'counterparty_sent',
        renditionType: 'markup',
        baseCleanVersionId,
      }),
    ).toEqual({
      versionLabel: 'Counterparty markup v2',
      versionSignificance: 'counterparty_sent',
      renditionType: 'markup',
      baseCleanVersionId,
    });
    expect(() =>
      addDocumentVersionFieldsSchema.parse({
        versionSignificance: 'counterparty_sent',
        renditionType: 'markup',
      }),
    ).toThrow();
  });
});
