import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { TenantContextService } from './tenant-context';
import { TenantService } from './tenant.service';
import { WorkspaceService } from './workspace.service';

@Controller('tenant')
export class TenantController {
  constructor(
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(TenantService) private readonly tenantService: TenantService,
    @Inject(WorkspaceService) private readonly workspaceService: WorkspaceService,
  ) {}

  @Get('settings')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  async getSettings() {
    const context = this.tenantContext.require();
    const tenant = await this.tenantService.findById(context.tenantId);
    if (!tenant) {
      throw new NotFoundException({ code: 'PERMISSION_DENIED' });
    }
    return this.tenantService.toSettingsDto(tenant);
  }

  @Get('workspaces')
  async listWorkspaces() {
    const context = this.tenantContext.require();
    return this.workspaceService.listForTenant(context.tenantId);
  }

  @Get('workspaces/:workspaceId')
  async getWorkspace(@Param('workspaceId') workspaceId: string) {
    const context = this.tenantContext.require();
    const workspace = await this.workspaceService.findByIdForTenant(context.tenantId, workspaceId);
    if (!workspace) {
      throw new NotFoundException({ code: 'PERMISSION_DENIED' });
    }
    return workspace;
  }
}
