import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
import { DdController } from './dd.controller';
import { DdService } from './dd.service';

@Module({
  imports: [AuditModule, PermissionModule, SearchModule],
  controllers: [DdController],
  providers: [DdService],
  exports: [DdService],
})
export class DdModule {}
