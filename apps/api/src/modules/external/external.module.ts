import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { ExternalController } from './external.controller';
import { ExternalService } from './external.service';

@Module({
  imports: [AuditModule, PermissionModule],
  controllers: [ExternalController],
  providers: [ExternalService],
  exports: [ExternalService],
})
export class ExternalModule {}
