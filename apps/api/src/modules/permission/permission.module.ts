import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DocumentPermissionService } from './document-permission.service';
import { DocumentPermissionStub } from './document-permission.stub';
import { FailClosedPermissionWrapper } from './fail-closed.wrapper';
import { PermissionQueryBuilder } from './permission-query.builder';
import { PermissionService } from './permission.service';
import { WallMembershipReader } from './wall-membership.reader';

@Module({
  imports: [AuditModule],
  providers: [
    DocumentPermissionStub,
    DocumentPermissionService,
    FailClosedPermissionWrapper,
    PermissionQueryBuilder,
    PermissionService,
    WallMembershipReader,
  ],
  exports: [
    DocumentPermissionStub,
    DocumentPermissionService,
    FailClosedPermissionWrapper,
    PermissionQueryBuilder,
    PermissionService,
  ],
})
export class PermissionModule {}
