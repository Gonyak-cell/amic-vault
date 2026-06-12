import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ethicalWallMembershipInputSchema, listEthicalWallsQuerySchema } from '@amic-vault/shared';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../auth/session.guard';
import { createEthicalWallSchema } from './dto/create-ethical-wall.dto';
import { EthicalWallService } from './ethical-wall.service';

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

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw permissionDenied();
  return userId;
}

@Controller('ethical-walls')
export class EthicalWallController {
  constructor(
    @Inject(EthicalWallService) private readonly ethicalWallService: EthicalWallService,
  ) {}

  @Get()
  @RequireRoles('security_admin')
  @UseGuards(RequireRolesGuard)
  list(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => listEthicalWallsQuerySchema.parse(query));
    return this.ethicalWallService.list(sessionUserId(request), input);
  }

  @Post()
  @RequireRoles('security_admin')
  @UseGuards(RequireRolesGuard)
  create(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createEthicalWallSchema.parse(body));
    return this.ethicalWallService.create(sessionUserId(request), input);
  }

  @Post(':wallId/break-glass')
  @RequireRoles('security_admin', 'matter_owner')
  @UseGuards(RequireRolesGuard)
  requestBreakGlassOverride(@Req() request: RequestWithSession, @Param('wallId') wallId: string) {
    return this.ethicalWallService.requestBreakGlassOverride(sessionUserId(request), wallId);
  }

  @Post(':wallId/memberships')
  @RequireRoles('security_admin')
  @UseGuards(RequireRolesGuard)
  addMembership(
    @Req() request: RequestWithSession,
    @Param('wallId') wallId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => ethicalWallMembershipInputSchema.parse(body));
    return this.ethicalWallService.addMembership(sessionUserId(request), wallId, input);
  }

  @Delete(':wallId/memberships/:membershipId')
  @RequireRoles('security_admin')
  @UseGuards(RequireRolesGuard)
  removeMembership(
    @Req() request: RequestWithSession,
    @Param('wallId') wallId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.ethicalWallService.removeMembership(sessionUserId(request), wallId, membershipId);
  }
}
