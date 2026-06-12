import { describe, expect, expectTypeOf, it } from 'vitest';
import { auditActions, auditMetadataKeys, type AuditMetadata } from './audit';

describe('audit shared types', () => {
  it('defines the R1 canonical action list while preserving R0 compatibility actions', () => {
    expect(auditActions).toEqual(
      expect.arrayContaining([
        'CLIENT_CREATED',
        'CLIENT_UPDATED',
        'MATTER_CREATED',
        'ACCESS_DENIED',
        'LOGIN_SUCCESS',
        'LOGIN_FAILURE',
        'SESSION_REVOKED',
        'PERMISSION_DENIED_HIT',
        'DOCUMENT_METADATA_CHANGED',
        'DOCUMENT_INTEGRITY_ALERT',
        'DOCUMENT_TEXT_EXTRACTED',
        'SEARCH_REINDEX_REQUESTED',
        'SEARCH_EXECUTED',
        'DLP_SCAN_COMPLETED',
        'DLP_FINDING_RECORDED',
      ]),
    );
  });

  it('keeps metadata keys restricted to reference-like values', () => {
    const metadata = {
      hash: 'sha256:fixture',
      client_id: '11111111-1111-4111-8111-111111111111',
      matter_id: '11111111-1111-4111-8111-111111111111',
      query_hash: '0'.repeat(64),
      query_length: 12,
      filter_refs: 'matter_id:11111111-1111-4111-8111-111111111111',
      result_count: 0,
      duration_ms: 1,
    } satisfies AuditMetadata;

    expect(metadata.client_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(auditMetadataKeys).not.toContain('body');
    expect(auditMetadataKeys).not.toContain('content');
    expect(auditMetadataKeys).not.toContain('snippet');
    expectTypeOf<AuditMetadata>().not.toHaveProperty('body');
  });
});
