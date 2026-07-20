import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { RecordsModule } from '../records/records.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { WorkModule } from '../work/work.module';
import { ClosingBinderService } from './closing-binder.service';
import { KnowledgeCandidateService } from './knowledge-candidate.service';
import { MatterMemberController } from './matter-member.controller';
import { MatterMemberService } from './matter-member.service';
import { MatterClosingService } from './matter-closing.service';
import { MatterConflictCheckController } from './matter-conflict-check.controller';
import { MatterConflictCheckService } from './matter-conflict-check.service';
import { MatterController } from './matter.controller';
import { MatterDashboardService } from './matter-dashboard.service';
import { MatterIssueService } from './matter-issue.service';
import { MatterService } from './matter.service';
import { MatterWikiService } from './matter-wiki.service';

@Module({
  imports: [
    AiModule,
    AuditModule,
    PermissionModule,
    RecordsModule,
    StorageModule,
    TenantModule,
    UserModule,
    WorkModule,
  ],
  controllers: [MatterController, MatterMemberController, MatterConflictCheckController],
  providers: [
    MatterService,
    ClosingBinderService,
    MatterMemberService,
    MatterClosingService,
    KnowledgeCandidateService,
    MatterConflictCheckService,
    MatterIssueService,
    MatterDashboardService,
    MatterWikiService,
  ],
  exports: [MatterService],
})
export class MatterModule {}
