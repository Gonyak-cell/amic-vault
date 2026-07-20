import {
  BadRequestException,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../auth/session.guard';
import { UserLifecycleService } from './user-lifecycle.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
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
export class UserLifecycleController {
  constructor(@Inject(UserLifecycleService) private readonly lifecycle: UserLifecycleService) {}

  @Post(':userId/deactivate')
  @HttpCode(200)
  @RequireRoles('firm_admin')
  @UseGuards(RequireRolesGuard)
  deactivate(@Req() request: RequestWithSession, @Param('userId') userId: string) {
    const session = sessionParts(request);
    return this.lifecycle.deactivate(session.tenantId, session.userId, parseUuid(userId));
  }

  @Post(':userId/reactivate')
  @HttpCode(200)
  @RequireRoles('firm_admin')
  @UseGuards(RequireRolesGuard)
  reactivate(@Req() request: RequestWithSession, @Param('userId') userId: string) {
    const session = sessionParts(request);
    return this.lifecycle.reactivate(session.tenantId, session.userId, parseUuid(userId));
  }
}
