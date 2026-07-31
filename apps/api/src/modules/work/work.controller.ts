import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import {
  dmsWorkReassignmentCandidatesQuerySchema,
  dmsWorkQueueQuerySchema,
  reassignWorkItemSchema,
  updateWorkItemDueAtSchema,
} from '@amic-vault/shared';
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

function parseWorkQuery(query: unknown) {
  try {
    return dmsWorkQueueQuerySchema.parse(query ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseReassignBody(body: unknown) {
  try {
    return reassignWorkItemSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseReassignmentCandidatesQuery(query: unknown) {
  try {
    return dmsWorkReassignmentCandidatesQuerySchema.parse(query ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseDueAtBody(body: unknown) {
  try {
    return updateWorkItemDueAtSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

@Controller('work')
export class WorkQueueController {
  constructor(@Inject(WorkService) private readonly workService: WorkService) {}

  @Get('items')
  listWorkItems(@Req() request: RequestWithSession, @Query() query: unknown) {
    return this.workService.listWorkItems(sessionUserId(request), parseWorkQuery(query));
  }

  @Get('items/:itemKey/reassignment-candidates')
  listReassignmentCandidates(
    @Req() request: RequestWithSession,
    @Param('itemKey') itemKey: string,
    @Query() query: unknown,
  ) {
    return this.workService.listReassignmentCandidates(
      sessionUserId(request),
      itemKey,
      parseReassignmentCandidatesQuery(query),
    );
  }

  @Patch('items/:itemKey/assignee')
  reassignWorkItem(
    @Req() request: RequestWithSession,
    @Param('itemKey') itemKey: string,
    @Body() body: unknown,
  ) {
    return this.workService.reassignWorkItem(
      sessionUserId(request),
      itemKey,
      parseReassignBody(body),
    );
  }

  @Patch('items/:itemKey/due-at')
  updateWorkItemDueAt(
    @Req() request: RequestWithSession,
    @Param('itemKey') itemKey: string,
    @Body() body: unknown,
  ) {
    return this.workService.updateWorkItemDueAt(
      sessionUserId(request),
      itemKey,
      parseDueAtBody(body),
    );
  }
}
