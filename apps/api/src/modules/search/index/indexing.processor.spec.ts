import { describe, expect, it, vi } from 'vitest';
import { IndexingProcessor } from './indexing.processor';

const payload = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  documentId: '11111111-1111-4111-8111-111111111112',
  versionId: '11111111-1111-4111-8111-111111111113',
};

describe('IndexingProcessor', () => {
  it('marks current-version prep artifacts stale before enqueueing rebuild jobs', async () => {
    const events: string[] = [];
    const tx = {
      query: vi.fn(async () => ({
        rows: [
          {
            ai_prep_artifact_id: '11111111-1111-4111-8111-111111111114',
            artifact_kind: 'document_profile',
            matter_id: '11111111-1111-4111-8111-111111111115',
            document_id: payload.documentId,
            document_version_id: payload.versionId,
          },
        ],
        rowCount: 1,
      })),
    };
    const audit = {
      transaction: vi.fn(async (_tenantId: string, run: (client: never) => Promise<unknown>) =>
        run(tx as never),
      ),
      log: vi.fn(async (input: { action: string }) => {
        events.push(input.action);
        return { eventId: 'event', createdAt: new Date() };
      }),
    };
    const repository = {
      upsertVersion: vi.fn(async () => ({
        matterId: '11111111-1111-4111-8111-111111111115',
      })),
    };
    const queue = {
      enqueueVersionArtifacts: vi.fn(async () => {
        events.push('QUEUE');
        return ['job-1'];
      }),
    };
    const processor = new IndexingProcessor(
      audit as never,
      { recordDeadLetter: vi.fn() } as never,
      repository as never,
      queue as never,
    );

    await processor.handle(payload);

    expect(tx.query).toHaveBeenCalledWith(expect.stringContaining('stale_reason = $2'), [
      payload.tenantId,
      'source_chunks_changed',
      payload.documentId,
      payload.versionId,
    ]);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AI_PREP_STALE',
        metadata: expect.objectContaining({ stale_reason: 'source_chunks_changed' }),
      }),
      tx,
    );
    expect(queue.enqueueVersionArtifacts).toHaveBeenCalledWith(
      {
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        versionId: payload.versionId,
        matterId: '11111111-1111-4111-8111-111111111115',
      },
      tx,
    );
    expect(events).toEqual(['AI_PREP_STALE', 'QUEUE']);
  });
});
