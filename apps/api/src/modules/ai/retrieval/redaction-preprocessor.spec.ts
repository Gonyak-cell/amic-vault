import { describe, expect, it } from 'vitest';
import type { DlpDetection } from '@amic-vault/shared';
import type { DlpService } from '../../dlp/dlp.service';
import { AiRedactionPreprocessor } from './redaction-preprocessor';
import type { AiRetrievalCandidate } from './ai-retrieval.types';

const baseCandidate: AiRetrievalCandidate = {
  documentId: '11111111-1111-4111-8111-111111111101',
  versionId: '11111111-1111-4111-8111-111111111102',
  matterId: '11111111-1111-4111-8111-111111111103',
  chunkId: '11111111-1111-4111-8111-111111111104',
  parentChunkId: null,
  chunkOrdinal: 1,
  tokenCount: 7,
  score: 0.8,
  chunkText: 'contact lawyer@example.test before signing',
  textHash: 'text-hash',
  sourceTextHash: 'source-hash',
};

function emailDetection(text: string): DlpDetection {
  const startOffset = text.indexOf('lawyer@example.test');
  return {
    ruleId: 'email-address-format-v1',
    findingType: 'email_address',
    valueHash: 'value-hash',
    evidenceHash: 'evidence-hash',
    startOffset,
    endOffset: startOffset + 'lawyer@example.test'.length,
    confidence: 0.9,
  };
}

describe('AiRedactionPreprocessor', () => {
  it('redacts DLP findings before AI context construction', () => {
    const service = new AiRedactionPreprocessor({
      scanText(text: string): DlpDetection[] {
        return [emailDetection(text)];
      },
    } as unknown as DlpService);

    const result = service.redact([baseCandidate]);

    expect(result.effect).toBe('ALLOW');
    if (result.effect === 'ALLOW') {
      expect(result.chunks[0]?.redactedText).toBe(
        'contact [REDACTED:email_address] before signing',
      );
      expect(result.chunks[0]?.redactedText).not.toContain('lawyer@example.test');
      expect(result.appliedRules).toContain('dlp.redaction:applied_before_context');
    }
  });

  it('fails closed when DLP scan cannot complete', () => {
    const service = new AiRedactionPreprocessor({
      scanText(): DlpDetection[] {
        throw new Error('dlp unavailable');
      },
    } as unknown as DlpService);

    expect(service.redact([baseCandidate])).toEqual({
      effect: 'DENY',
      appliedRules: ['dlp.redaction:failed_closed'],
    });
  });
});
