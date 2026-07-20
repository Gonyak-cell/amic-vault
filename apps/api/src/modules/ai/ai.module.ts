import { Module } from '@nestjs/common';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { AiPolicyModule } from '../ai-policy/ai-policy.module';
import { AuditModule } from '../audit/audit.module';
import { ContractIntelModule } from '../contract-intel/contract-intel.module';
import { DlpModule } from '../dlp/dlp.module';
import { DdModule } from '../dd/dd.module';
import { GraphModule } from '../graph/graph.module';
import { LitigationModule } from '../litigation/litigation.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
import { WorkModule } from '../work/work.module';
import { AiCitationController } from './citation/ai-citation.controller';
import { AiAuditRecorder } from './audit/ai-audit-recorder.service';
import { AiCitationMapperService } from './citation/citation-mapper.service';
import { AiCitationVerifier } from './citation/citation-verifier';
import { AiContextRanker } from './context/context-ranker';
import { AiContextWindowManager } from './context/context-window.manager';
import { AiEvidencePackBuilder } from './context/evidence-pack.builder';
import { AiFeedbackController } from './feedback/ai-feedback.controller';
import { AiFeedbackService } from './feedback/ai-feedback.service';
import { AiSummaryController } from './features/ai-summary.controller';
import { AiSummaryGenerationGateService } from './features/ai-summary-generation-gate.service';
import { AiSummaryService } from './features/ai-summary.service';
import { ContractAiReviewWorkerService } from './features/contract-ai-review-worker.service';
import { AiEvidencePromptCompiler } from './generation/evidence-prompt.compiler';
import { AiGroundedOutputGuard } from './generation/grounded-output.guard';
import { LocalGemmaGenerationService } from './generation/local-gemma-generation.service';
import { AiOpsController } from './ops/ai-ops.controller';
import { AiOpsService } from './ops/ai-ops.service';
import { AiPrepProcessor } from './prep/ai-prep.processor';
import { AiPrepQueueService } from './prep/ai-prep-queue.service';
import { AiPrepRepository } from './prep/ai-prep.repository';
import { AiPrepStatusController } from './prep/ai-prep-status.controller';
import { AiPrepStatusService } from './prep/ai-prep-status.service';
import { MatterTimelineBuilder } from './prep/matter-timeline.builder';
import { MinutesQcBuilder } from './prep/minutes-qc.builder';
import { AiSessionController } from './session/ai-session.controller';
import { AiSessionLogService } from './session/ai-session-log.service';
import { AiMetadataFilterBuilder } from './retrieval/metadata-filter.builder';
import { AiQuestionClassifier } from './retrieval/question-classifier';
import { AiRedactionPreprocessor } from './retrieval/redaction-preprocessor';
import { AiDeterministicReranker } from './retrieval/reranker';
import { AiRetrievalOrchestratorService } from './retrieval/retrieval-orchestrator.service';
import { AiModelRoutingService } from './routing/model-routing.service';
import { AiTaskRiskClassifier } from './routing/task-risk.classifier';

@Module({
  imports: [
    AiPolicyModule,
    AuditModule,
    ContractIntelModule,
    DdModule,
    DlpModule,
    GraphModule,
    LitigationModule,
    PermissionModule,
    SearchModule,
    WorkModule,
  ],
  controllers: [
    AiCitationController,
    AiFeedbackController,
    AiOpsController,
    AiPrepStatusController,
    AiSessionController,
    AiSummaryController,
  ],
  providers: [
    AiCitationMapperService,
    AiAuditRecorder,
    AiCitationVerifier,
    AiContextRanker,
    AiContextWindowManager,
    AiEvidencePackBuilder,
    AiDeterministicReranker,
    AiMetadataFilterBuilder,
    AiQuestionClassifier,
    AiRedactionPreprocessor,
    AiRetrievalOrchestratorService,
    AiSessionLogService,
    AiModelRoutingService,
    AiTaskRiskClassifier,
    AiEvidencePromptCompiler,
    AiGroundedOutputGuard,
    LocalGemmaGenerationService,
    AiOpsService,
    PgRoleLookup,
    RequireRolesGuard,
    AiPrepProcessor,
    AiPrepQueueService,
    AiPrepRepository,
    MatterTimelineBuilder,
    MinutesQcBuilder,
    AiPrepStatusService,
    AiSummaryGenerationGateService,
    AiSummaryService,
    ContractAiReviewWorkerService,
    AiFeedbackService,
  ],
  exports: [
    AiCitationMapperService,
    AiAuditRecorder,
    AiCitationVerifier,
    AiEvidencePackBuilder,
    AiRetrievalOrchestratorService,
    AiSessionLogService,
    AiModelRoutingService,
    AiTaskRiskClassifier,
    AiEvidencePromptCompiler,
    AiGroundedOutputGuard,
    LocalGemmaGenerationService,
    AiOpsService,
    AiPrepQueueService,
    AiPrepRepository,
    MatterTimelineBuilder,
    MinutesQcBuilder,
    AiPrepStatusService,
    AiSummaryGenerationGateService,
    AiSummaryService,
    ContractAiReviewWorkerService,
    AiFeedbackService,
  ],
})
export class AiModule {}
