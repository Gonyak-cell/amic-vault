import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Res,
  StreamableFile,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  assignDocumentSubversionReviewerSchema,
  cancelDocumentEditSessionSchema,
  checkInDocumentEditSessionSchema,
  createDocumentEditSessionSchema,
  heartbeatDocumentEditSessionSchema,
  promoteDocumentSubversionSchema,
  saveDocumentSubversionFieldsSchema,
  saveNativeDocumentEditDraftSchema,
  submitDocumentSubversionReviewSchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { mapDocumentUploadError } from './document-error.mapper';
import { DocumentEditingService } from './document-editing.service';
import { ImmutableStateGuard } from './guards/immutable-state.guard';
import { multipartFieldName, multipartUploadOptions } from './multipart.config';
import type { UploadedDiskFile } from './document-upload.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'document';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function parseCreateSessionBody(body: unknown) {
  try {
    return createDocumentEditSessionSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseHeartbeatBody(body: unknown) {
  try {
    return heartbeatDocumentEditSessionSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseSaveSubversionBody(body: unknown) {
  try {
    return saveDocumentSubversionFieldsSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseSaveNativeDraftBody(body: unknown) {
  try {
    return saveNativeDocumentEditDraftSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseCheckInBody(body: unknown) {
  try {
    return checkInDocumentEditSessionSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseCancelBody(body: unknown) {
  try {
    return cancelDocumentEditSessionSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parsePromoteBody(body: unknown) {
  try {
    return promoteDocumentSubversionSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseAssignReviewerBody(body: unknown) {
  try {
    return assignDocumentSubversionReviewerSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseSubmitReviewBody(body: unknown) {
  try {
    return submitDocumentSubversionReviewSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

@Controller('documents')
export class DocumentEditingController {
  constructor(@Inject(DocumentEditingService) private readonly editingService: DocumentEditingService) {}

  @Post(':documentId/edit-sessions')
  @UseGuards(ImmutableStateGuard)
  async checkout(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
  ) {
    try {
      return await this.editingService.checkout(
        sessionUserId(request),
        parseUuid(documentId),
        parseCreateSessionBody(body),
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Get(':documentId/edit-sessions/active')
  async getActiveSession(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
  ) {
    try {
      return await this.editingService.getActiveSession(sessionUserId(request), parseUuid(documentId));
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Post(':documentId/edit-sessions/:editSessionId/heartbeat')
  async heartbeat(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('editSessionId') editSessionId: string,
    @Body() body: unknown,
  ) {
    try {
      return await this.editingService.heartbeat(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(editSessionId),
        parseHeartbeatBody(body),
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Post(':documentId/edit-sessions/:editSessionId/subversions')
  @UseGuards(ImmutableStateGuard)
  @UseInterceptors(FileInterceptor(multipartFieldName, multipartUploadOptions()))
  async saveSubversion(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('editSessionId') editSessionId: string,
    @Body() body: unknown,
    @UploadedFile() file: UploadedDiskFile | undefined,
  ) {
    try {
      return await this.editingService.saveSubversion({
        actorUserId: sessionUserId(request),
        documentId: parseUuid(documentId),
        editSessionId: parseUuid(editSessionId),
        fields: parseSaveSubversionBody(body),
        file,
      });
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Get(':documentId/edit-sessions/:editSessionId/edit-package')
  async getEditPackage(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('editSessionId') editSessionId: string,
  ) {
    try {
      return await this.editingService.getEditPackage(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(editSessionId),
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Get(':documentId/edit-sessions/:editSessionId/base-file')
  async getEditBaseFile(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('editSessionId') editSessionId: string,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    try {
      const download = await this.editingService.getEditBaseFile(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(editSessionId),
      );
      response.setHeader('content-type', download.contentType);
      response.setHeader('content-length', String(download.contentLength));
      response.setHeader('content-disposition', contentDisposition(download.filename));
      response.setHeader('x-content-type-options', 'nosniff');
      response.setHeader('x-amic-sha256', download.sha256);
      response.setHeader('cache-control', 'no-store, no-cache, max-age=0, must-revalidate, private');
      return new StreamableFile(download.body);
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Get(':documentId/edit-sessions/:editSessionId/native-draft')
  async getNativeDraft(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('editSessionId') editSessionId: string,
  ) {
    try {
      return await this.editingService.getNativeDraft(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(editSessionId),
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Post(':documentId/edit-sessions/:editSessionId/native-draft')
  @UseGuards(ImmutableStateGuard)
  async saveNativeDraft(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('editSessionId') editSessionId: string,
    @Body() body: unknown,
  ) {
    try {
      return await this.editingService.saveNativeDraft(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(editSessionId),
        parseSaveNativeDraftBody(body),
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Get(':documentId/subversions')
  async listSubversions(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
  ) {
    try {
      return await this.editingService.listSubversions(sessionUserId(request), parseUuid(documentId));
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Get(':documentId/subversions/:subversionId/file')
  async getSubversionFile(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('subversionId') subversionId: string,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    try {
      const download = await this.editingService.getSubversionFile(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(subversionId),
      );
      response.setHeader('content-type', download.contentType);
      response.setHeader('content-length', String(download.contentLength));
      response.setHeader('content-disposition', contentDisposition(download.filename));
      response.setHeader('x-content-type-options', 'nosniff');
      response.setHeader('x-amic-sha256', download.sha256);
      response.setHeader('cache-control', 'no-store, no-cache, max-age=0, must-revalidate, private');
      return new StreamableFile(download.body);
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Post(':documentId/edit-sessions/:editSessionId/check-in')
  @UseGuards(ImmutableStateGuard)
  async checkIn(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('editSessionId') editSessionId: string,
    @Body() body: unknown,
  ) {
    try {
      return await this.editingService.checkIn(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(editSessionId),
        parseCheckInBody(body),
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Post(':documentId/edit-sessions/:editSessionId/cancel')
  @UseGuards(ImmutableStateGuard)
  async cancel(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('editSessionId') editSessionId: string,
    @Body() body: unknown,
  ) {
    try {
      const parsed = parseCancelBody(body);
      return await this.editingService.cancel(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(editSessionId),
        parsed.cancelledReasonCode,
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Post(':documentId/subversions/:subversionId/promote')
  @UseGuards(ImmutableStateGuard)
  async promote(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('subversionId') subversionId: string,
    @Body() body: unknown,
  ) {
    try {
      return await this.editingService.promote(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(subversionId),
        parsePromoteBody(body),
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Post(':documentId/subversions/:subversionId/reviewers')
  @UseGuards(ImmutableStateGuard)
  async assignReviewer(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('subversionId') subversionId: string,
    @Body() body: unknown,
  ) {
    try {
      return await this.editingService.assignReviewer(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(subversionId),
        parseAssignReviewerBody(body),
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Get(':documentId/subversions/:subversionId/reviewers')
  async listReviewers(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('subversionId') subversionId: string,
  ) {
    try {
      return await this.editingService.listReviewers(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(subversionId),
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Delete(':documentId/subversions/:subversionId/reviewers/:reviewerUserId')
  @UseGuards(ImmutableStateGuard)
  async revokeReviewer(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('subversionId') subversionId: string,
    @Param('reviewerUserId') reviewerUserId: string,
  ) {
    try {
      return await this.editingService.revokeReviewer(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(subversionId),
        parseUuid(reviewerUserId),
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Get(':documentId/subversions/:subversionId/reviews')
  async listReviewDecisions(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('subversionId') subversionId: string,
  ) {
    try {
      return await this.editingService.listReviewDecisions(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(subversionId),
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }

  @Post(':documentId/subversions/:subversionId/reviews/me')
  @UseGuards(ImmutableStateGuard)
  async submitReviewDecision(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('subversionId') subversionId: string,
    @Body() body: unknown,
  ) {
    try {
      return await this.editingService.submitReviewDecision(
        sessionUserId(request),
        parseUuid(documentId),
        parseUuid(subversionId),
        parseSubmitReviewBody(body),
      );
    } catch (error) {
      throw mapDocumentUploadError(error);
    }
  }
}
