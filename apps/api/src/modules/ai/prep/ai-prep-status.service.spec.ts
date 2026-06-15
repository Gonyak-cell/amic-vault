import { describe, expect, it, vi } from 'vitest';
import { AiPrepStatusService } from './ai-prep-status.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '11111111-1111-4111-8111-111111111112';
const matterId = '11111111-1111-4111-8111-111111111113';
const documentId = '11111111-1111-4111-8111-111111111114';
const versionId = '11111111-1111-4111-8111-111111111115';
const artifactId = '11111111-1111-4111-8111-111111111116';
const feedbackId = '11111111-1111-4111-8111-111111111117';
const chunkId = '11111111-1111-4111-8111-111111111118';

function payload() {
  return {
    answer: 'authorized prep',
    sections: [
      {
        section_id: 'brief',
        heading: 'Brief',
        text: 'Grounded answer.',
        source_refs: [`chunk:${chunkId}`],
      },
    ],
    claims: [
      {
        claim_id: 'claim-1',
        kind: 'summary',
        text: 'Grounded answer.',
        source_refs: [`chunk:${chunkId}`],
        is_legal_conclusion: false,
      },
    ],
    source_refs: [`chunk:${chunkId}`],
  };
}

function createService(queryResults: unknown[] = []) {
  const client = {
    query: vi.fn(async () => {
      const rows = queryResults.shift() as unknown[] | undefined;
      return { rows: rows ?? [], rowCount: rows?.length ?? 0 };
    }),
  };
  const audit = {
    transaction: vi.fn(async (_tenantId: string, run: (tx: never) => Promise<unknown>) =>
      run(client as never),
    ),
    log: vi.fn(async () => ({ eventId: 'event', createdAt: new Date() })),
  };
  const documentPermission = {
    canReadDocument: vi.fn(async () => ({ effect: 'ALLOW' })),
  };
  const queue = {
    enqueueVersionArtifacts: vi.fn(async () => ['job-1']),
  };
  return {
    audit,
    client,
    documentPermission,
    queue,
    service: new AiPrepStatusService(audit as never, documentPermission as never, queue as never),
  };
}

describe('AiPrepStatusService', () => {
  it('returns completed document prep artifacts after a read permission check', async () => {
    const { documentPermission, service } = createService([
      [{ document_id: documentId, version_id: versionId }],
      [
        {
          ai_prep_artifact_id: artifactId,
          artifact_kind: 'document_profile',
          status: 'completed',
          is_stale: false,
          source_chunk_ids: [chunkId],
          generated_at: new Date('2026-06-15T00:00:00.000Z'),
          updated_at: new Date('2026-06-15T00:00:01.000Z'),
          payload_json: payload(),
        },
      ],
    ]);

    const status = await service.getDocumentStatus({ tenantId, userId }, documentId);

    expect(documentPermission.canReadDocument).toHaveBeenCalledWith({ tenantId, userId }, documentId);
    expect(status.readinessStatus).toBe('ready');
    expect(status.artifacts[0]).toMatchObject({
      artifactId,
      artifactKind: 'document_profile',
      sourceChunkCount: 1,
      payload: expect.objectContaining({ answer: 'authorized prep' }),
    });
    expect(JSON.stringify(status)).not.toMatch(/prompt|raw|response/u);
  });

  it('fails closed before querying artifacts when document permission is denied', async () => {
    const { audit, documentPermission, service } = createService();
    documentPermission.canReadDocument.mockResolvedValueOnce({ effect: 'DENY' });

    await expect(service.getDocumentStatus({ tenantId, userId }, documentId)).rejects.toThrow();
    expect(audit.transaction).not.toHaveBeenCalled();
  });

  it('builds admin matter readiness aggregates from artifact status counts', async () => {
    const { service } = createService([
      [{ role: 'security_admin', status: 'active' }],
      [{ matter_id: matterId }],
      [
        {
          document_id: documentId,
          title: 'Matter file',
          ai_allowed: true,
          version_id: versionId,
          total_artifact_count: 2,
          completed_artifact_count: 1,
          pending_artifact_count: 1,
          blocked_artifact_count: 0,
          failed_artifact_count: 0,
          stale_artifact_count: 0,
          updated_at: new Date('2026-06-15T00:00:01.000Z'),
        },
      ],
    ]);

    const readiness = await service.getMatterReadiness({ tenantId, userId }, matterId);

    expect(readiness).toMatchObject({
      matterId,
      documentCount: 1,
      partialDocumentCount: 1,
      pendingJobCount: 1,
    });
  });

  it('records structured artifact feedback and audits reference metadata only', async () => {
    const { audit, documentPermission, service } = createService([
      [
        {
          ai_prep_artifact_id: artifactId,
          matter_id: matterId,
          document_id: documentId,
          document_version_id: versionId,
        },
      ],
      [
        {
          ai_prep_feedback_id: feedbackId,
          ai_prep_artifact_id: artifactId,
          matter_id: matterId,
          document_id: documentId,
          actor_id: userId,
          feedback_kind: 'incorrect',
          reason_code: 'missing_citation',
          created_at: new Date('2026-06-15T00:00:02.000Z'),
        },
      ],
    ]);

    const feedback = await service.recordArtifactFeedback(
      { tenantId, userId, sessionId: 'session-1' },
      { artifactId, feedbackKind: 'incorrect', reasonCode: 'missing_citation' },
    );

    expect(documentPermission.canReadDocument).toHaveBeenCalledWith(
      { tenantId, userId, sessionId: 'session-1' },
      documentId,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AI_FEEDBACK_RECORDED',
        targetType: 'ai_prep_feedback',
        metadata: expect.objectContaining({
          feedback_id: feedbackId,
          ai_prep_artifact_id: artifactId,
          feedback_reason_code: 'missing_citation',
        }),
      }),
      expect.anything(),
    );
    expect(feedback.feedbackId).toBe(feedbackId);
  });

  it('audits admin retry requests while enqueuing retryable versions', async () => {
    const { audit, queue, service } = createService([
      [{ role: 'firm_admin', status: 'active' }],
      [{ matter_id: matterId }],
      [{ document_id: documentId, version_id: versionId, matter_id: matterId }],
    ]);

    const response = await service.retryMatterPrep({ tenantId, userId }, matterId);

    expect(queue.enqueueVersionArtifacts).toHaveBeenCalledWith(
      { tenantId, documentId, versionId, matterId },
      expect.anything(),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AI_PREP_REQUESTED',
        targetType: 'matter',
        metadata: expect.objectContaining({ enqueued_job_count: 1 }),
      }),
      expect.anything(),
    );
    expect(response.enqueuedJobCount).toBe(1);
  });
});
