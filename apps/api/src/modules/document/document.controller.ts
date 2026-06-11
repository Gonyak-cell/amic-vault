import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  addDocumentVersionFieldsSchema,
  listDocumentVersionsQuerySchema,
  updateDocumentMetadataSchema,
  updateLegalHoldSchema,
  uploadDocumentFieldsSchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { multipartFieldName, multipartUploadOptions } from './multipart.config';
import { DocumentUploadService, type UploadedDiskFile } from './document-upload.service';
import { mapDocumentUploadError } from './document-error.mapper';
import { DocumentService } from './document.service';
import { DocumentVersionService } from './document-version.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw validationFailed();
  return value;
}

function parseBody(body: unknown) {
  try {
    return uploadDocumentFieldsSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseMetadataBody(body: unknown) {
  try {
    return updateDocumentMetadataSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseAddVersionBody(body: unknown) {
  try {
    return addDocumentVersionFieldsSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseVersionListQuery(query: unknown) {
  try {
    return listDocumentVersionsQuerySchema.parse(query ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseLegalHoldBody(body: unknown) {
  try {
    return updateLegalHoldSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw validationFailed();
  return userId;
}

@Controller('matters/:matterId/documents')
export class DocumentController {
  constructor(
    @Inject(DocumentUploadService) private readonly uploadService: DocumentUploadService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor(multipartFieldName, multipartUploadOptions()))
  async upload(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
    @UploadedFile() file: UploadedDiskFile | undefined,
  ) {
    try {
      return await this.uploadService.upload({
        actorUserId: sessionUserId(request),
        matterId: parseUuid(matterId),
        fields: parseBody(body),
        file,
      });
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }
}

@Controller('documents')
export class DocumentMetadataController {
  constructor(
    @Inject(DocumentService) private readonly documentService: DocumentService,
    @Inject(DocumentUploadService) private readonly uploadService: DocumentUploadService,
    @Inject(DocumentVersionService) private readonly versionService: DocumentVersionService,
  ) {}

  @Patch(':documentId/metadata')
  updateMetadata(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
  ) {
    return this.documentService.updateMetadata(
      sessionUserId(request),
      parseUuid(documentId),
      parseMetadataBody(body),
    );
  }

  @Post(':documentId/versions')
  @UseInterceptors(FileInterceptor(multipartFieldName, multipartUploadOptions()))
  async addVersion(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
    @UploadedFile() file: UploadedDiskFile | undefined,
  ) {
    try {
      return await this.uploadService.addVersion({
        actorUserId: sessionUserId(request),
        documentId: parseUuid(documentId),
        fields: parseAddVersionBody(body),
        file,
      });
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Get(':documentId/versions')
  listVersions(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.versionService.listVersions(
      sessionUserId(request),
      parseUuid(documentId),
      parseVersionListQuery(query),
    );
  }

  @Patch(':documentId/legal-hold')
  updateLegalHold(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
  ) {
    return this.documentService.updateLegalHold(
      sessionUserId(request),
      parseUuid(documentId),
      parseLegalHoldBody(body),
    );
  }
}
