import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EthicalWallModule } from '../ethical-wall/ethical-wall.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { MatterMemberController } from './matter-member.controller';
import { MatterMemberService } from './matter-member.service';
import { MatterController } from './matter.controller';
import { MatterService } from './matter.service';

@Module({
  imports: [AuditModule, EthicalWallModule, TenantModule, UserModule],
  controllers: [MatterController, MatterMemberController],
  providers: [MatterService, MatterMemberService],
  exports: [MatterService],
})
export class MatterModule {}
