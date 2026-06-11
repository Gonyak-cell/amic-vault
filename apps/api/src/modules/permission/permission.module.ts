import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DocumentPermissionStub } from './document-permission.stub';
import { FailClosedPermissionWrapper } from './fail-closed.wrapper';
import { PermissionQueryBuilder } from './permission-query.builder';
import { PermissionService } from './permission.service';
import { WallMembershipReader } from './wall-membership.reader';

@Module({
  imports: [AuditModule],
  providers: [
    DocumentPermissionStub,
    FailClosedPermissionWrapper,
    PermissionQueryBuilder,
    PermissionService,
    WallMembershipReader,
  ],
  exports: [
    DocumentPermissionStub,
    FailClosedPermissionWrapper,
    PermissionQueryBuilder,
    PermissionService,
  ],
})
export class PermissionModule {}

