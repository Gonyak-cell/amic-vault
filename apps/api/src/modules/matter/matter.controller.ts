import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RequestWithSession } from '../auth/session.guard';
import { createMatterSchema } from './dto/create-matter.dto';
import { listMattersQuerySchema } from './dto/list-matters.query';
import { updateMatterStatusSchema } from './dto/update-matter-status.dto';
import { MatterService } from './matter.service';

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

@Controller('matters')
export class MatterController {
  constructor(@Inject(MatterService) private readonly matterService: MatterService) {}

  @Post()
  create(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createMatterSchema.parse(body));
    return this.matterService.create(sessionUserId(request), input);
  }

  @Get()
  list(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => listMattersQuerySchema.parse(query));
    return this.matterService.list(sessionUserId(request), input);
  }

  @Get(':matterId')
  get(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.matterService.get(sessionUserId(request), parseUuid(matterId));
  }

  @Patch(':matterId/status')
  updateStatus(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updateMatterStatusSchema.parse(body));
    return this.matterService.updateStatus(sessionUserId(request), parseUuid(matterId), input);
  }
}
