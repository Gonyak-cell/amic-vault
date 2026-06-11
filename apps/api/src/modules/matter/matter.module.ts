import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { MatterController } from './matter.controller';
import { MatterService } from './matter.service';

@Module({
  imports: [AuditModule, TenantModule, UserModule],
  controllers: [MatterController],
  providers: [MatterService],
  exports: [MatterService],
})
export class MatterModule {}
