import { Module } from '@nestjs/common';
import { PermissionModule } from '../../permission/permission.module';
import { TenantModule } from '../../tenant/tenant.module';
import { UserModule } from '../../user/user.module';
import { MatterAppRuntimeService } from './matter-app-runtime.service';
import { MatterSourcePolicyService } from './matter-source-policy';
import { MatterAppLookupController } from './matter-lookup.controller';
import { MatterAppStatusController } from './status.controller';

@Module({
  imports: [PermissionModule, TenantModule, UserModule],
  controllers: [MatterAppLookupController, MatterAppStatusController],
  providers: [MatterAppRuntimeService, MatterSourcePolicyService],
  exports: [MatterAppRuntimeService, MatterSourcePolicyService],
})
export class MatterAppModule {}
