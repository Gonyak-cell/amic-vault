import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  acquireOutlookGraphAttachmentSchema,
  cancelOutlookFilingRequestSchema,
  createOutlookDocumentInsertionSchema,
  createOutlookSendFileRequestSchema,
  createOutlookFolderMappingSchema,
  createOutlookEmailFilingRequestSchema,
  evaluateOutlookSendPolicySchema,
  outlookAddinSessionExchangeSchema,
  updateOutlookFolderMappingSchema,
} from '@amic-vault/shared';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../auth/session.guard';
import { OutlookAuthService } from './outlook-auth.service';
import { OutlookDocumentInsertionService } from './outlook-document-insertion.service';
import { OutlookFolderMappingService } from './outlook-folder-mapping.service';
import { OutlookGraphAttachmentService } from './outlook-graph-attachment.service';
import { OutlookIntegrationStatusService } from './outlook-integration-status.service';
import { OutlookSendFileService } from './outlook-send-file.service';
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

function parseSendPolicyBody(body: unknown) {
  try {
    return evaluateOutlookSendPolicySchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseSendFileBody(body: unknown) {
  try {
    return createOutlookSendFileRequestSchema.parse(body ?? {});
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

function parseDocumentInsertionBody(body: unknown) {
  try {
    return createOutlookDocumentInsertionSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseFolderMappingBody(body: unknown) {
  try {
    return createOutlookFolderMappingSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseUpdateFolderMappingBody(body: unknown) {
  try {
    return updateOutlookFolderMappingSchema.parse(body ?? {});
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
    @Inject(OutlookSendFileService)
    private readonly outlookSendFileService: OutlookSendFileService,
    @Inject(OutlookDocumentInsertionService)
    private readonly outlookDocumentInsertionService: OutlookDocumentInsertionService,
    @Inject(OutlookFolderMappingService)
    private readonly outlookFolderMappingService: OutlookFolderMappingService,
    @Inject(OutlookIntegrationStatusService)
    private readonly outlookIntegrationStatusService: OutlookIntegrationStatusService,
  ) {}

  @Get('admin-status')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  getAdminStatus() {
    return this.outlookIntegrationStatusService.getAdminStatus();
  }

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

  @Post('send-policy-decisions')
  evaluateSendPolicy(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.outlookSendFileService.evaluateSendPolicy(
      sessionUserId(request),
      parseSendPolicyBody(body),
    );
  }

  @Post('send-file-requests')
  createSendFileRequest(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.outlookSendFileService.createSendFileRequest(
      sessionUserId(request),
      parseSendFileBody(body),
    );
  }

  @Post('attachment-acquisitions')
  acquireAttachment(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.outlookGraphAttachmentService.acquireAttachment(
      sessionUserId(request),
      parseGraphAttachmentBody(body),
    );
  }

  @Post('document-insertions')
  createDocumentInsertion(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.outlookDocumentInsertionService.createDocumentInsertion(
      sessionUserId(request),
      parseDocumentInsertionBody(body),
    );
  }

  @Post('folder-mappings')
  createFolderMapping(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.outlookFolderMappingService.createFolderMapping(
      sessionUserId(request),
      parseFolderMappingBody(body),
    );
  }

  @Patch('folder-mappings/:id')
  updateFolderMapping(
    @Req() request: RequestWithSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.outlookFolderMappingService.updateFolderMapping(
      sessionUserId(request),
      parseUuid(id),
      parseUpdateFolderMappingBody(body),
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
