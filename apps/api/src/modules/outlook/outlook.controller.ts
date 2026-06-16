import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  acquireOutlookGraphAttachmentSchema,
  cancelOutlookFilingRequestSchema,
  createOutlookEmailFilingRequestSchema,
  outlookAddinSessionExchangeSchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { OutlookAuthService } from './outlook-auth.service';
import { OutlookGraphAttachmentService } from './outlook-graph-attachment.service';
import { OutlookService } from './outlook.service';

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

function sessionIdentity(request: RequestWithSession): { userId: string; sessionId: string } {
  const userId = request.session?.userId;
  const sessionId = request.session?.sessionId;
  if (!userId || !sessionId) throw validationFailed();
  return { userId, sessionId };
}

function parseCreateBody(body: unknown) {
  try {
    return createOutlookEmailFilingRequestSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseCancelBody(body: unknown) {
  try {
    return cancelOutlookFilingRequestSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseSessionExchangeBody(body: unknown) {
  try {
    return outlookAddinSessionExchangeSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseGraphAttachmentBody(body: unknown) {
  try {
    return acquireOutlookGraphAttachmentSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

@Controller('m365/outlook')
export class OutlookController {
  constructor(
    @Inject(OutlookService) private readonly outlookService: OutlookService,
    @Inject(OutlookAuthService) private readonly outlookAuthService: OutlookAuthService,
    @Inject(OutlookGraphAttachmentService)
    private readonly outlookGraphAttachmentService: OutlookGraphAttachmentService,
  ) {}

  @Post('session-exchanges')
  exchangeAddinSession(@Req() request: RequestWithSession, @Body() body: unknown) {
    const identity = sessionIdentity(request);
    return this.outlookAuthService.exchangeAddinSession(
      identity.userId,
      identity.sessionId,
      parseSessionExchangeBody(body),
    );
  }

  @Post('filing-requests')
  createFilingRequest(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.outlookService.createFilingRequest(sessionUserId(request), parseCreateBody(body));
  }

  @Post('attachment-acquisitions')
  acquireAttachment(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.outlookGraphAttachmentService.acquireAttachment(
      sessionUserId(request),
      parseGraphAttachmentBody(body),
    );
  }

  @Get('filing-requests/:id')
  getFilingRequestStatus(@Req() request: RequestWithSession, @Param('id') id: string) {
    return this.outlookService.getFilingRequestStatus(sessionUserId(request), parseUuid(id));
  }

  @Post('filing-requests/:id/cancel')
  cancelFilingRequest(
    @Req() request: RequestWithSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    parseCancelBody(body);
    return this.outlookService.cancelFilingRequest(sessionUserId(request), parseUuid(id));
  }
}
