import { describe, expect, it } from 'vitest';
import { AiMetadataFilterBuilder } from './metadata-filter.builder';

const matterId = '11111111-1111-4111-8111-111111111222';
const otherMatterId = '11111111-1111-4111-8111-111111111333';

describe('AiMetadataFilterBuilder', () => {
  const builder = new AiMetadataFilterBuilder();

  it('forces the request matter into allowed filters', () => {
    const result = builder.build({
      matterId,
      filters: { documentType: 'contract', versionStatus: 'all' },
    });

    expect(result.effect).toBe('ALLOW');
    if (result.effect === 'ALLOW') {
      expect(result.filters).toMatchObject({
        matterId,
        documentType: 'contract',
        versionStatus: 'all',
      });
      expect(result.appliedRules).toContain('metadata_filter:matter_forced');
    }
  });

  it('fails closed when caller tries to override matter scope', () => {
    const result = builder.build({
      matterId,
      filters: { matterId: otherMatterId },
    });

    expect(result).toMatchObject({
      effect: 'DENY',
      reasonCode: 'metadata_matter_mismatch',
    });
  });

  it('fails closed on invalid filter shape', () => {
    const result = builder.build({
      matterId,
      filters: { versionStatus: 'bogus' } as unknown as Parameters<
        AiMetadataFilterBuilder['build']
      >[0]['filters'],
    });

    expect(result).toMatchObject({
      effect: 'DENY',
      reasonCode: 'invalid_metadata_filter',
    });
  });
});
