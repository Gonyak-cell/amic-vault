import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { MatterMemberController } from './matter-member.controller';
import { MatterMemberService } from './matter-member.service';
import { MatterController } from './matter.controller';
import { MatterService } from './matter.service';

@Module({
  imports: [AuditModule, PermissionModule, TenantModule, UserModule],
  controllers: [MatterController, MatterMemberController],
  providers: [MatterService, MatterMemberService],
  exports: [MatterService],
})
export class MatterModule {}
