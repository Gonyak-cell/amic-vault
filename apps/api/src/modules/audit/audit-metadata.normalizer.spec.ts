import { describe, expect, it } from 'vitest';
import { AuditMetadataNormalizer } from './audit-metadata.normalizer';

describe('AuditMetadataNormalizer', () => {
  const normalizer = new AuditMetadataNormalizer();

  it('keeps whitelisted reference metadata and drops unknown keys', () => {
    expect(
      normalizer.normalize({
        client_id: '11111111-1111-4111-8111-111111111111',
        diff_keys: ['status'],
        filter_refs: ['matter', 'document', 'wall'],
        included_chunk_ids: ['11111111-1111-4111-8111-111111111222'],
        excluded_chunk_ids: ['11111111-1111-4111-8111-111111111333'],
        name: 'Acme Corp',
      }),
    ).toEqual({
      client_id: '11111111-1111-4111-8111-111111111111',
      diff_keys: ['status'],
      filter_refs: ['matter', 'document', 'wall'],
      included_chunk_ids: ['11111111-1111-4111-8111-111111111222'],
      excluded_chunk_ids: ['11111111-1111-4111-8111-111111111333'],
    });
  });

  it('rejects long strings, nested objects, and body-like content values', () => {
    expect(() => normalizer.normalize({ reason_code: 'x'.repeat(257) })).toThrow(/too long/);
    expect(() => normalizer.normalize({ client_id: { nested: true } })).toThrow(/not allowed/);
    expect(() =>
      normalizer.normalize({
        reason_code:
          '계약서 제1조 본 계약의 목적은 당사자 사이의 권리와 의무를 정하는 데 있으며 '.repeat(8),
      }),
    ).toThrow(/too long/);
  });
});
