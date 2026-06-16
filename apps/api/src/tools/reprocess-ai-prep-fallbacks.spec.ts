import { describe, expect, it } from 'vitest';
import { parseReprocessArgs } from './reprocess-ai-prep-fallbacks';

describe('reprocess ai prep fallbacks tool args', () => {
  it('requires a tenant id', () => {
    expect(() => parseReprocessArgs([])).toThrow(/--tenant-id/);
  });

  it('parses bounded fallback reprocess options', () => {
    expect(
      parseReprocessArgs([
        '--tenant-id',
        '11111111-1111-4111-8111-111111111111',
        '--limit',
        '12',
        '--dry-run',
        '--document-id',
        '22222222-2222-4222-8222-222222222222',
        '--artifact-kind',
        'document_profile',
        '--include',
        'fallback,stale,rejected',
      ]),
    ).toMatchObject({
      tenantId: '11111111-1111-4111-8111-111111111111',
      limit: 12,
      dryRun: true,
      include: ['fallback', 'stale', 'rejected'],
      documentId: '22222222-2222-4222-8222-222222222222',
      artifactKind: 'document_profile',
    });
  });

  it('expands all reprocess includes', () => {
    expect(
      parseReprocessArgs([
        '--tenant-id',
        '11111111-1111-4111-8111-111111111111',
        '--include',
        'all',
      ]),
    ).toMatchObject({
      include: ['fallback', 'stale', 'rejected'],
    });
  });

  it('rejects unknown reprocess include values', () => {
    expect(() =>
      parseReprocessArgs([
        '--tenant-id',
        '11111111-1111-4111-8111-111111111111',
        '--include',
        'raw',
      ]),
    ).toThrow(/--include/);
  });

  it('rejects unbounded limits', () => {
    expect(() =>
      parseReprocessArgs([
        '--tenant-id',
        '11111111-1111-4111-8111-111111111111',
        '--limit',
        '500',
      ]),
    ).toThrow(/between 1 and 200/);
  });
});
