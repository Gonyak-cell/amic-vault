import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GraphModule } from '../graph/graph.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
import { WorkModule } from '../work/work.module';
import { LitigationController } from './litigation.controller';
import { LitigationAiClassifierService } from './litigation-ai-classifier.service';
import { LitigationService } from './litigation.service';

@Module({
  imports: [AuditModule, GraphModule, PermissionModule, SearchModule, WorkModule],
  controllers: [LitigationController],
  providers: [LitigationAiClassifierService, LitigationService],
  exports: [LitigationAiClassifierService, LitigationService],
})
export class LitigationModule {}
