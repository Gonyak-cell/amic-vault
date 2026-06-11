import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadDocumentFieldsSchema } from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { multipartFieldName, multipartUploadOptions } from './multipart.config';
import { DocumentUploadService, type UploadedDiskFile } from './document-upload.service';
import { mapDocumentUploadError } from './document-error.mapper';

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
