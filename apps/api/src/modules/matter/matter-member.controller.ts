import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { RequestWithSession } from '../auth/session.guard';
import { addMatterMemberSchema } from './dto/add-member.dto';
import { updateMatterMemberSchema } from './dto/update-member.dto';
import { MatterMemberService } from './matter-member.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
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
  if (!userId) throw permissionDenied();
  return userId;
}

@Controller('matters/:matterId/members')
export class MatterMemberController {
  constructor(
    @Inject(MatterMemberService) private readonly matterMemberService: MatterMemberService,
  ) {}

  @Get()
  list(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.matterMemberService.list(sessionUserId(request), parseUuid(matterId));
  }

  @Post()
  add(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => addMatterMemberSchema.parse(body));
    return this.matterMemberService.add(sessionUserId(request), parseUuid(matterId), input);
  }

  @Delete(':userId')
  @HttpCode(204)
  remove(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('userId') userId: string,
  ) {
    return this.matterMemberService.remove(
      sessionUserId(request),
      parseUuid(matterId),
      parseUuid(userId),
    );
  }

  @Patch(':userId')
  update(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updateMatterMemberSchema.parse(body));
    return this.matterMemberService.update(
      sessionUserId(request),
      parseUuid(matterId),
      parseUuid(userId),
      input,
    );
  }
}
