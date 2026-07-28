import { Inject, Injectable } from '@nestjs/common';
import type { DocumentBulkActionDto } from '@amic-vault/shared';
import { DocumentFolderService } from './document-folder.service';
import { DocumentLifecycleService } from './document-lifecycle.service';
import { DocumentService } from './document.service';

@Injectable()
export class DocumentBulkActionExecutor {
  constructor(
    @Inject(DocumentFolderService)
    private readonly folderService: DocumentFolderService,
    @Inject(DocumentLifecycleService)
    private readonly lifecycleService: DocumentLifecycleService,
    @Inject(DocumentService)
    private readonly documentService: DocumentService,
  ) {}

  async execute(
    actorUserId: string,
    documentId: string,
    action: DocumentBulkActionDto,
  ): Promise<void> {
    if (action.kind === 'move_folder') {
      await this.documentService.updateMetadata(actorUserId, documentId, {
        folderId: action.folderId,
      });
      return;
    }
    if (action.kind === 'add_tag' || action.kind === 'remove_tag') {
      await this.folderService.mutateDocumentTag(actorUserId, documentId, {
        mode: action.kind === 'add_tag' ? 'add' : 'remove',
        tag: action.tag,
      });
      return;
    }
    await this.lifecycleService.transitionStatus(
      actorUserId,
      documentId,
      action.status,
      undefined,
      { allowAlreadyAtTarget: true },
    );
  }
}
