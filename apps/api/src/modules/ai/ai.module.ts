import { Module } from '@nestjs/common';
import { AiPolicyModule } from '../ai-policy/ai-policy.module';
import { AuditModule } from '../audit/audit.module';
import { ContractIntelModule } from '../contract-intel/contract-intel.module';
import { DlpModule } from '../dlp/dlp.module';
import { GraphModule } from '../graph/graph.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
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
import { AiSummaryService } from './features/ai-summary.service';
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
    DlpModule,
    GraphModule,
    PermissionModule,
    SearchModule,
  ],
  controllers: [AiCitationController, AiFeedbackController, AiSessionController, AiSummaryController],
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
    AiSummaryService,
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
    AiSummaryService,
    AiFeedbackService,
  ],
})
export class AiModule {}
