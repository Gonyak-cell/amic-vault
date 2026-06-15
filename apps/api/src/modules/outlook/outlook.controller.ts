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
  cancelOutlookFilingRequestSchema,
  createOutlookEmailFilingRequestSchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
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

@Controller('m365/outlook')
export class OutlookController {
  constructor(@Inject(OutlookService) private readonly outlookService: OutlookService) {}

  @Post('filing-requests')
  createFilingRequest(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.outlookService.createFilingRequest(sessionUserId(request), parseCreateBody(body));
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
