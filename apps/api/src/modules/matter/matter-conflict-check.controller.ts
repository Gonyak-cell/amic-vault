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
} from '@nestjs/common';
import type { RequestWithSession } from '../auth/session.guard';
import { resolveConflictCheckSchema } from './dto/resolve-conflict-check.dto';
import { MatterConflictCheckService } from './matter-conflict-check.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseOrValidation<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') throw validationFailed();
    throw error;
  }
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

@Controller()
export class MatterConflictCheckController {
  constructor(
    @Inject(MatterConflictCheckService)
    private readonly conflictCheckService: MatterConflictCheckService,
  ) {}

  @Post('matters/:matterId/conflict-checks')
  run(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.conflictCheckService.run(sessionUserId(request), parseUuid(matterId));
  }

  @Get('matters/:matterId/conflict-checks')
  list(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.conflictCheckService.list(sessionUserId(request), parseUuid(matterId));
  }

  @Patch('matters/:matterId/conflict-checks/:conflictCheckId')
  resolve(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('conflictCheckId') conflictCheckId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => resolveConflictCheckSchema.parse(body));
    return this.conflictCheckService.resolve(
      sessionUserId(request),
      parseUuid(matterId),
      parseUuid(conflictCheckId),
      input,
    );
  }
}
