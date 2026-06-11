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
import { createPartySchema } from './dto/create-party.dto';
import { listPartiesQuerySchema } from './dto/list-parties.dto';
import { updatePartySchema } from './dto/update-party.dto';
import { PartyService } from './party.service';

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
export class PartyController {
  constructor(@Inject(PartyService) private readonly partyService: PartyService) {}

  @Post('matters/:matterId/parties')
  create(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => createPartySchema.parse(body));
    return this.partyService.create(sessionUserId(request), parseUuid(matterId), input);
  }

  @Get('matters/:matterId/parties')
  list(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const input = parseOrValidation(() => listPartiesQuerySchema.parse(query));
    return this.partyService.list(sessionUserId(request), parseUuid(matterId), input);
  }

  @Patch('parties/:partyId')
  update(
    @Req() request: RequestWithSession,
    @Param('partyId') partyId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updatePartySchema.parse(body));
    return this.partyService.update(sessionUserId(request), parseUuid(partyId), input);
  }
}
