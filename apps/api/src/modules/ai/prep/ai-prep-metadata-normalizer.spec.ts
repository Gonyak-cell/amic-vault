import { describe, expect, it } from 'vitest';
import { normalizeAiPrepMetadata } from './ai-prep-metadata-normalizer';

describe('normalizeAiPrepMetadata', () => {
  it('keeps only safe canonical metadata and source hashes', () => {
    const metadata = normalizeAiPrepMetadata({
      title: '계약서 lawyer@example.com 010-1234-5678',
      documentType: '  계약 자료\n',
      subtype: 'NDA\tDraft',
      confidentialityLevel: 'client-private',
      sourceTextHashes: ['b'.repeat(64), 'not-a-hash', 'a'.repeat(64), 'b'.repeat(64)],
    });

    expect(metadata.safeTitle).toBe('계약서 [REDACTED:email] [REDACTED:phone]');
    expect(metadata.documentType).toBe('계약 자료');
    expect(metadata.subtype).toBe('NDA Draft');
    expect(metadata.sourceTextHashes).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
    expect(metadata.metadataHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(metadata)).not.toMatch(/lawyer@example|010-1234-5678|raw|body/u);
  });

  it('uses bounded fallbacks instead of logging sensitive plaintext', () => {
    const metadata = normalizeAiPrepMetadata({
      title: '\n\t ',
      sourceTextHashes: [],
    });

    expect(metadata.safeTitle).toBe('uploaded document');
    expect(metadata.documentType).toBe('other');
    expect(metadata.confidentialityLevel).toBe('standard');
  });
});
