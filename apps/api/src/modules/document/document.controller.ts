import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { updateDocumentMetadataSchema, uploadDocumentFieldsSchema } from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { multipartFieldName, multipartUploadOptions } from './multipart.config';
import { DocumentUploadService, type UploadedDiskFile } from './document-upload.service';
import { mapDocumentUploadError } from './document-error.mapper';
import { DocumentService } from './document.service';

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
  constructor(@Inject(DocumentService) private readonly documentService: DocumentService) {}

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
}
