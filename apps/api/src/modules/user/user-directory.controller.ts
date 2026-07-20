import { Controller, ForbiddenException, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../auth/session.guard';
import { UserService } from './user.service';

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function sessionTenantId(request: RequestWithSession): TenantId {
  const tenantId = request.session?.tenantId as TenantId | undefined;
  if (!tenantId) throw permissionDenied();
  return tenantId;
}

@Controller('users')
export class UserDirectoryController {
  constructor(@Inject(UserService) private readonly users: UserService) {}

  @Get()
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  list(@Req() request: RequestWithSession) {
    return this.users.listSummaries(sessionTenantId(request));
  }
}
