import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  emailMatterSuggestionQuerySchema,
  fileEmailToMatterSchema,
  uploadEmailToMatterFieldsSchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { mapDocumentUploadError } from '../document/document-error.mapper';
import { multipartFieldName, multipartUploadOptions } from '../document/multipart.config';
import type { UploadedDiskFile } from '../document/document-upload.service';
import { EmailService } from './email.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailFileRoute = 'emails/:emailId/file';
const emailMatterSuggestionsRoute = 'emails/:emailId/matter-suggestions';
const matterEmailTimelineRoute = 'matters/:matterId/email-timeline';
const matterEmailUploadRoute = 'matters/:matterId/emails';

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

function parseFileBody(body: unknown) {
  try {
    return fileEmailToMatterSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseSuggestionQuery(query: unknown) {
  try {
    return emailMatterSuggestionQuerySchema.parse(query ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseUploadFields(body: unknown) {
  try {
    return uploadEmailToMatterFieldsSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

@Controller()
export class EmailController {
  constructor(@Inject(EmailService) private readonly emailService: EmailService) {}

  @Post(matterEmailUploadRoute)
  @UseInterceptors(FileInterceptor(multipartFieldName, multipartUploadOptions()))
  async uploadEmailToMatter(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
    @UploadedFile() file: UploadedDiskFile | undefined,
  ) {
    try {
      return await this.emailService.uploadRawEmailToMatter(
        sessionUserId(request),
        parseUuid(matterId),
        parseUploadFields(body),
        file,
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Post(emailFileRoute)
  fileEmailToMatter(
    @Req() request: RequestWithSession,
    @Param('emailId') emailId: string,
    @Body() body: unknown,
  ) {
    return this.emailService.fileEmailToMatter(
      sessionUserId(request),
      parseUuid(emailId),
      parseFileBody(body),
    );
  }

  @Get(emailMatterSuggestionsRoute)
  suggestMatters(
    @Req() request: RequestWithSession,
    @Param('emailId') emailId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.emailService.suggestMattersForEmail(
      sessionUserId(request),
      parseUuid(emailId),
      parseSuggestionQuery(query),
    );
  }

  @Get(matterEmailTimelineRoute)
  listMatterEmailTimeline(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.emailService.listMatterEmailTimeline(sessionUserId(request), parseUuid(matterId));
  }
}
