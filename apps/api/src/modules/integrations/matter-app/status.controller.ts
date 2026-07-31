import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../../common/guards/require-roles.guard';
import { MatterAppRuntimeService } from './matter-app-runtime.service';

@Controller('integrations/matter-app')
export class MatterAppStatusController {
  constructor(
    @Inject(MatterAppRuntimeService) private readonly matterApp: MatterAppRuntimeService,
  ) {}

  @Get('status')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  status() {
    return this.matterApp.status();
  }
}
