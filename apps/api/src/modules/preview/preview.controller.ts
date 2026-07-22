import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { RequestWithSession } from '../auth/session.guard';
import { PreviewSessionService } from './preview-session.service';
import { PreviewService } from './preview.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED' });
  }
  return value;
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
  return userId;
}

function previewToken(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new NotFoundException({ code: 'PERMISSION_DENIED' });
  }
  return value;
}

function previewSessionId(value: string | undefined): string {
  if (!value || !uuidPattern.test(value)) {
    throw new NotFoundException({ code: 'PERMISSION_DENIED' });
  }
  return value;
}

@Controller('documents/:documentId')
export class PreviewController {
  constructor(
    @Inject(PreviewService) private readonly previewService: PreviewService,
    @Inject(PreviewSessionService) private readonly previewSessionService: PreviewSessionService,
  ) {}

  @Post('preview-sessions')
  async issuePreviewSession(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
  ) {
    return this.previewSessionService.issue(sessionUserId(request), parseUuid(documentId));
  }

  @Get('preview')
  async preview(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Headers('range') rangeHeader: string | undefined,
    @Headers('x-amic-preview-session') previewSessionHeader: string | undefined,
    @Headers('x-amic-preview-token') previewTokenHeader: string | undefined,
    @Res({ passthrough: true })
    response: {
      status(code: number): void;
      setHeader(name: string, value: string): void;
    },
  ) {
    const preview = await this.previewService.openPreview(
      sessionUserId(request),
      parseUuid(documentId),
      previewSessionId(previewSessionHeader),
      previewToken(previewTokenHeader),
      rangeHeader,
    );
    response.status(preview.statusCode);
    response.setHeader('content-type', preview.contentType);
    response.setHeader('content-length', String(preview.contentLength));
    response.setHeader('accept-ranges', 'bytes');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-amic-sha256', preview.sha256);
    if (preview.contentRange) response.setHeader('content-range', preview.contentRange);
    return new StreamableFile(preview.body);
  }
}
