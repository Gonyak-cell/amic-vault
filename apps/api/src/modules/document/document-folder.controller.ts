import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Put, Req } from '@nestjs/common';
import type { RequestWithSession } from '../auth/session.guard';
import { DocumentFolderService } from './document-folder.service';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw validationFailed();
  return value;
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw validationFailed();
  return userId;
}

@Controller()
export class DocumentFolderController {
  constructor(
    @Inject(DocumentFolderService)
    private readonly folderService: DocumentFolderService,
  ) {}

  @Get('matters/:matterId/document-folders')
  listFolders(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.folderService.listFolders(sessionUserId(request), parseUuid(matterId));
  }

  @Patch('matters/:matterId/document-folders/:folderId')
  updateFolder(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('folderId') folderId: string,
    @Body() body: unknown,
  ) {
    return this.folderService.updateFolder(
      sessionUserId(request),
      parseUuid(matterId),
      parseUuid(folderId),
      body,
    );
  }

  @Get('matters/:matterId/document-tags')
  listTags(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.folderService.listTags(sessionUserId(request), parseUuid(matterId));
  }

  @Put('documents/:documentId/tags')
  setDocumentTags(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
  ) {
    return this.folderService.setDocumentTags(sessionUserId(request), parseUuid(documentId), body);
  }
}
