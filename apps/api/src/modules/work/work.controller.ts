import { BadRequestException, Controller, Get, Inject, Req } from '@nestjs/common';
import type { RequestWithSession } from '../auth/session.guard';
import { WorkService } from './work.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw validationFailed();
  return userId;
}

@Controller('work')
export class WorkQueueController {
  constructor(@Inject(WorkService) private readonly workService: WorkService) {}

  @Get('items')
  listWorkItems(@Req() request: RequestWithSession) {
    return this.workService.listWorkItems(sessionUserId(request));
  }
}
