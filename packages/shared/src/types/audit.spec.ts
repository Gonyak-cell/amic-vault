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
        'DLP_EGRESS_BLOCKED',
        'BREAK_GLASS_REQUESTED',
        'BREAK_GLASS_APPROVED',
        'BREAK_GLASS_ACTIVATED',
        'BREAK_GLASS_USED',
        'BREAK_GLASS_REVOKED',
        'BREAK_GLASS_EXPIRED',
        'EMAIL_IMPORTED',
        'EMAIL_DUPLICATE_BLOCKED',
        'EMAIL_METADATA_UPDATED',
        'EMAIL_FILED',
        'AI_QUERY_SUBMITTED',
        'AI_RETRIEVAL',
        'AI_RESPONSE',
        'AI_CITED_DOCUMENT',
        'AI_RETRIEVAL_EXCLUDED',
        'AI_FEEDBACK_RECORDED',
      ]),
    );
  });

  it('keeps metadata keys restricted to reference-like values', () => {
    const metadata = {
      hash: 'sha256:fixture',
      client_id: '11111111-1111-4111-8111-111111111111',
      matter_id: '11111111-1111-4111-8111-111111111111',
      file_object_id: '11111111-1111-4111-8111-111111111122',
      query_hash: '0'.repeat(64),
      query_length: 12,
      filter_refs: 'matter_id:11111111-1111-4111-8111-111111111111',
      request_id: '11111111-1111-4111-8111-111111111133',
      approver_user_id: '11111111-1111-4111-8111-111111111100',
      approval_count: 2,
      expires_at: '2026-06-12T12:00:00.000Z',
      result_count: 0,
      duration_ms: 1,
      ai_session_id: '11111111-1111-4111-8111-111111111144',
      chunk_id: '11111111-1111-4111-8111-111111111155',
      included_count: 1,
      excluded_count: 1,
      included_chunk_ids: ['11111111-1111-4111-8111-111111111155'],
      excluded_chunk_ids: ['11111111-1111-4111-8111-111111111166'],
      response_length: 128,
      response_token_count: 32,
      ai_response_status: 'responded',
      escalation_required: false,
      feedback_id: '11111111-1111-4111-8111-111111111177',
      rating: 4,
      helpful: true,
      correction_type: 'minor_edit',
      error_types: ['incorrect_citation'],
      edit_distance: 12,
    } satisfies AuditMetadata;

    expect(metadata.client_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(auditMetadataKeys).not.toContain('body');
    expect(auditMetadataKeys).not.toContain('content');
    expect(auditMetadataKeys).not.toContain('snippet');
    expectTypeOf<AuditMetadata>().not.toHaveProperty('body');
  });
});
