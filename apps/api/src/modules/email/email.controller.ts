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
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  documentDownloadReasonQuerySchema,
  emailMatterSuggestionQuerySchema,
  fileEmailToMatterSchema,
  undoEmailAutofileSchema,
  uploadEmailToMatterFieldsSchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { mapDocumentUploadError } from '../document/document-error.mapper';
import { multipartFieldName, multipartUploadOptions } from '../document/multipart.config';
import type { UploadedDiskFile } from '../document/document-upload.service';
import { EmailService } from './email.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const documentEmailLinksRoute = 'documents/:documentId/email-links';
const emailDocumentLinksRoute = 'emails/:emailId/document-links';
const emailFileRoute = 'emails/:emailId/file';
const emailAutofileUndoRoute = 'emails/:emailId/autofile/undo';
const emailMatterSuggestionsRoute = 'emails/:emailId/matter-suggestions';
const emailRawRoute = 'emails/:emailId/raw';
const emailThreadFileRoute = 'email-threads/:threadId/file';
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

function parseUndoAutofileBody(body: unknown) {
  try {
    return undoEmailAutofileSchema.parse(body ?? {});
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

function parseDownloadReasonQuery(query: unknown) {
  try {
    return documentDownloadReasonQuerySchema.parse(query ?? {});
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

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'message.eml';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
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

  @Post(emailThreadFileRoute)
  fileEmailThreadToMatter(
    @Req() request: RequestWithSession,
    @Param('threadId') threadId: string,
    @Body() body: unknown,
  ) {
    return this.emailService.fileEmailThreadToMatter(
      sessionUserId(request),
      parseUuid(threadId),
      parseFileBody(body),
    );
  }

  @Post(emailAutofileUndoRoute)
  undoEmailAutofile(
    @Req() request: RequestWithSession,
    @Param('emailId') emailId: string,
    @Body() body: unknown,
  ) {
    return this.emailService.undoEmailAutofile(
      sessionUserId(request),
      parseUuid(emailId),
      parseUndoAutofileBody(body),
    );
  }

  @Get(emailDocumentLinksRoute)
  listDocumentLinksForEmail(@Req() request: RequestWithSession, @Param('emailId') emailId: string) {
    return this.emailService.listDocumentLinksForEmail(sessionUserId(request), parseUuid(emailId));
  }

  @Get(documentEmailLinksRoute)
  listEmailLinksForDocument(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
  ) {
    return this.emailService.listEmailLinksForDocument(
      sessionUserId(request),
      parseUuid(documentId),
    );
  }

  @Get(emailRawRoute)
  async downloadRawEmail(
    @Req() request: RequestWithSession,
    @Param('emailId') emailId: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    const reason = parseDownloadReasonQuery(query);
    const download = await this.emailService.downloadRawEmail(
      sessionUserId(request),
      parseUuid(emailId),
      reason.reasonCode,
    );
    response.setHeader('content-type', download.contentType);
    response.setHeader('content-length', String(download.contentLength));
    response.setHeader('content-disposition', contentDisposition(download.filename));
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-amic-sha256', download.sha256);
    return new StreamableFile(download.body);
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
