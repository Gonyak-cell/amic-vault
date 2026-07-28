import { describe, expect, it, vi } from 'vitest';
import { DocumentBulkActionExecutor } from './document-bulk-action.executor';

const actorUserId = '11111111-1111-4111-8111-111111111101';
const documentId = '11111111-1111-4111-8111-111111111102';
const folderId = '11111111-1111-4111-8111-111111111103';

describe('DocumentBulkActionExecutor', () => {
  it('routes every approved action through the existing single-document service', async () => {
    const folderService = { mutateDocumentTag: vi.fn(async () => ({ tags: [] })) };
    const lifecycleService = { transitionStatus: vi.fn(async () => undefined) };
    const documentService = { updateMetadata: vi.fn(async () => undefined) };
    const executor = new DocumentBulkActionExecutor(
      folderService as never,
      lifecycleService as never,
      documentService as never,
    );

    await executor.execute(actorUserId, documentId, {
      kind: 'move_folder',
      folderId,
    });
    await executor.execute(actorUserId, documentId, { kind: 'add_tag', tag: 'reviewed' });
    await executor.execute(actorUserId, documentId, { kind: 'remove_tag', tag: 'old' });
    await executor.execute(actorUserId, documentId, {
      kind: 'transition_status',
      status: 'internal_review',
    });

    expect(documentService.updateMetadata).toHaveBeenCalledWith(actorUserId, documentId, {
      folderId,
    });
    expect(folderService.mutateDocumentTag).toHaveBeenNthCalledWith(1, actorUserId, documentId, {
      mode: 'add',
      tag: 'reviewed',
    });
    expect(folderService.mutateDocumentTag).toHaveBeenNthCalledWith(2, actorUserId, documentId, {
      mode: 'remove',
      tag: 'old',
    });
    expect(lifecycleService.transitionStatus).toHaveBeenCalledWith(
      actorUserId,
      documentId,
      'internal_review',
      undefined,
      { allowAlreadyAtTarget: true },
    );
  });
});
