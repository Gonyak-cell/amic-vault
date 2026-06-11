import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
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
