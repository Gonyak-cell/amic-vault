import { describe, expect, it } from 'vitest';
import {
  documentDeletedAudit,
  documentDownloadedAudit,
  documentVersionAddedAudit,
  documentUploadedAudit,
  documentViewedAudit,
} from './document-events';

const base = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  actorId: '11111111-1111-4111-8111-111111111101',
  documentId: '11111111-1111-4111-8111-1111111111dd',
  matterId: '11111111-1111-4111-8111-1111111111aa',
};

describe('document audit event builders', () => {
  it('builds upload metadata with reference identifiers and hash only', () => {
    const event = documentUploadedAudit({
      ...base,
      versionId: '11111111-1111-4111-8111-1111111111v1',
      hash: 'a'.repeat(64),
    });

    expect(event).toMatchObject({
      action: 'DOCUMENT_UPLOADED',
      targetType: 'document',
      targetId: base.documentId,
      metadata: {
        document_id: base.documentId,
        matter_id: base.matterId,
        version_id: '11111111-1111-4111-8111-1111111111v1',
        hash: 'a'.repeat(64),
      },
    });
  });

  it('requires a view channel', () => {
    expect(() =>
      documentViewedAudit({
        ...base,
        versionId: '11111111-1111-4111-8111-1111111111v1',
        channel: undefined as never,
      }),
    ).toThrow('channel');

    expect(
      documentViewedAudit({
        ...base,
        versionId: '11111111-1111-4111-8111-1111111111v1',
        channel: 'preview',
      }).metadata,
    ).toMatchObject({ channel: 'preview' });
  });

  it('stores download reason code without reason text', () => {
    const event = documentDownloadedAudit({
      ...base,
      versionId: '11111111-1111-4111-8111-1111111111v1',
      hash: 'b'.repeat(64),
      reasonCode: 'client_request',
    });

    expect(event.metadata).toMatchObject({ reason_code: 'client_request' });
    expect(JSON.stringify(event.metadata)).not.toContain('requested copy');
  });

  it('records duplicate upload decisions as bounded audit codes', () => {
    const uploadEvent = documentUploadedAudit({
      ...base,
      versionId: '11111111-1111-4111-8111-1111111111v1',
      duplicateDecision: { decision: 'new_document', candidateCount: 2 },
    });
    const versionEvent = documentVersionAddedAudit({
      ...base,
      versionId: '11111111-1111-4111-8111-1111111111v2',
      duplicateDecision: { decision: 'new_version', candidateCount: 1 },
    });

    expect(uploadEvent.metadata).toMatchObject({
      reason_code: 'duplicate_new_document',
      result_count: 2,
    });
    expect(versionEvent.metadata).toMatchObject({
      reason_code: 'duplicate_new_version',
      result_count: 1,
    });
    expect(JSON.stringify([uploadEvent.metadata, versionEvent.metadata])).not.toContain(
      'Investment memo',
    );
  });

  it('records delete status references only', () => {
    expect(
      documentDeletedAudit({
        ...base,
        beforeRef: 'document_status:draft',
        afterRef: 'document_status:deleted',
      }).metadata,
    ).toEqual({
      document_id: base.documentId,
      matter_id: base.matterId,
      before_ref: 'document_status:draft',
      after_ref: 'document_status:deleted',
    });
  });
});
