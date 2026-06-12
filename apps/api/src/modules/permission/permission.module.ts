import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BreakGlassModule } from '../break-glass/break-glass.module';
import { DocumentPermissionService } from './document-permission.service';
import { DocumentPermissionStub } from './document-permission.stub';
import { FailClosedPermissionWrapper } from './fail-closed.wrapper';
import { PermissionQueryBuilder } from './permission-query.builder';
import { PermissionService } from './permission.service';
import { WallMembershipReader } from './wall-membership.reader';

@Module({
  imports: [forwardRef(() => AuditModule), forwardRef(() => BreakGlassModule)],
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
