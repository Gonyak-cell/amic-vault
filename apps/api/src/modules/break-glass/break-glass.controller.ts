import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../auth/session.guard';
import {
  createBreakGlassRequestSchema,
  revokeBreakGlassRequestSchema,
} from './dto/break-glass.dto';
import { BreakGlassService } from './break-glass.service';

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

@Controller('break-glass')
export class BreakGlassController {
  constructor(@Inject(BreakGlassService) private readonly breakGlassService: BreakGlassService) {}

  @Post('requests')
  @RequireRoles('security_admin', 'matter_owner')
  @UseGuards(RequireRolesGuard)
  createRequest(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createBreakGlassRequestSchema.parse(body));
    return this.breakGlassService.createRequest(sessionUserId(request), input);
  }

  @Post('requests/:requestId/approvals')
  @RequireRoles('firm_admin', 'security_admin', 'matter_owner')
  @UseGuards(RequireRolesGuard)
  approveRequest(@Req() request: RequestWithSession, @Param('requestId') requestId: string) {
    return this.breakGlassService.approveRequest(sessionUserId(request), requestId);
  }

  @Post('requests/:requestId/revoke')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  revokeRequest(
    @Req() request: RequestWithSession,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => revokeBreakGlassRequestSchema.parse(body));
    return this.breakGlassService.revokeRequest(sessionUserId(request), requestId, input);
  }
}
