import { Module } from '@nestjs/common';
import { AiPolicyModule } from '../ai-policy/ai-policy.module';
import { AuditModule } from '../audit/audit.module';
import { DlpModule } from '../dlp/dlp.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
import { AiCitationController } from './citation/ai-citation.controller';
import { AiCitationMapperService } from './citation/citation-mapper.service';
import { AiCitationVerifier } from './citation/citation-verifier';
import { AiContextRanker } from './context/context-ranker';
import { AiContextWindowManager } from './context/context-window.manager';
import { AiEvidencePackBuilder } from './context/evidence-pack.builder';
import { AiSessionController } from './session/ai-session.controller';
import { AiSessionLogService } from './session/ai-session-log.service';
import { AiMetadataFilterBuilder } from './retrieval/metadata-filter.builder';
import { AiQuestionClassifier } from './retrieval/question-classifier';
import { AiRedactionPreprocessor } from './retrieval/redaction-preprocessor';
import { AiDeterministicReranker } from './retrieval/reranker';
import { AiRetrievalOrchestratorService } from './retrieval/retrieval-orchestrator.service';

@Module({
  imports: [AiPolicyModule, AuditModule, DlpModule, PermissionModule, SearchModule],
  controllers: [AiCitationController, AiSessionController],
  providers: [
    AiCitationMapperService,
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
  ],
  exports: [
    AiCitationMapperService,
    AiCitationVerifier,
    AiEvidencePackBuilder,
    AiRetrievalOrchestratorService,
    AiSessionLogService,
  ],
})
export class AiModule {}
