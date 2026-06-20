import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { OrgDirectoryController } from './org-directory.controller';
import { OrgDirectoryService } from './org-directory.service';

@Module({
  imports: [AuditModule, PermissionModule],
  controllers: [OrgDirectoryController],
  providers: [OrgDirectoryService],
  exports: [OrgDirectoryService],
})
export class OrgDirectoryModule {}
