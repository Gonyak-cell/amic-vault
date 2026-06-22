import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../auth/session.guard';
import { assignAccountLedgerIdSchema } from './dto/assign-account-ledger-id.dto';
import { UserLoginIdentityService } from './user-login-identity.service';

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

function sessionParts(request: RequestWithSession): { tenantId: TenantId; userId: string } {
  const tenantId = request.session?.tenantId as TenantId | undefined;
  const userId = request.session?.userId;
  if (!tenantId || !userId) throw permissionDenied();
  return { tenantId, userId };
}

@Controller('users')
export class UserLoginIdentityController {
  constructor(
    @Inject(UserLoginIdentityService)
    private readonly userLoginIdentityService: UserLoginIdentityService,
  ) {}

  @Patch(':userId/account-ledger-id')
  @RequireRoles('firm_admin')
  @UseGuards(RequireRolesGuard)
  assignAccountLedgerId(
    @Req() request: RequestWithSession,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    const session = sessionParts(request);
    const input = parseOrValidation(() => assignAccountLedgerIdSchema.parse(body));
    return this.userLoginIdentityService.assignAccountLedgerId(
      session.tenantId,
      session.userId,
      parseUuid(userId),
      input,
    );
  }
}
