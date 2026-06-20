import { Module } from '@nestjs/common';
import { PermissionModule } from '../../permission/permission.module';
import { TenantModule } from '../../tenant/tenant.module';
import { UserModule } from '../../user/user.module';
import { MatterAppRuntimeService } from './matter-app-runtime.service';
import { MatterAppLookupController } from './matter-lookup.controller';
import { MatterAppStatusController } from './status.controller';

@Module({
  imports: [PermissionModule, TenantModule, UserModule],
  controllers: [MatterAppLookupController, MatterAppStatusController],
  providers: [MatterAppRuntimeService],
  exports: [MatterAppRuntimeService],
})
export class MatterAppModule {}
