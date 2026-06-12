import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
import { LitigationController } from './litigation.controller';
import { LitigationService } from './litigation.service';

@Module({
  imports: [AuditModule, PermissionModule, SearchModule],
  controllers: [LitigationController],
  providers: [LitigationService],
  exports: [LitigationService],
})
export class LitigationModule {}
