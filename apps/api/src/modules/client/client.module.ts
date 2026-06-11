import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';

@Module({
  imports: [AuditModule, TenantModule, UserModule],
  controllers: [ClientController],
  providers: [ClientService],
  exports: [ClientService],
})
export class ClientModule {}
