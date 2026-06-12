import { Module } from '@nestjs/common';
import { AiPolicyModule } from '../ai-policy/ai-policy.module';
import { AuditModule } from '../audit/audit.module';
import { DlpModule } from '../dlp/dlp.module';
import { SearchModule } from '../search/search.module';
import { AiContextRanker } from './context/context-ranker';
import { AiContextWindowManager } from './context/context-window.manager';
import { AiEvidencePackBuilder } from './context/evidence-pack.builder';
import { AiMetadataFilterBuilder } from './retrieval/metadata-filter.builder';
import { AiQuestionClassifier } from './retrieval/question-classifier';
import { AiRedactionPreprocessor } from './retrieval/redaction-preprocessor';
import { AiDeterministicReranker } from './retrieval/reranker';
import { AiRetrievalOrchestratorService } from './retrieval/retrieval-orchestrator.service';

@Module({
  imports: [AiPolicyModule, AuditModule, DlpModule, SearchModule],
  providers: [
    AiContextRanker,
    AiContextWindowManager,
    AiEvidencePackBuilder,
    AiDeterministicReranker,
    AiMetadataFilterBuilder,
    AiQuestionClassifier,
    AiRedactionPreprocessor,
    AiRetrievalOrchestratorService,
  ],
  exports: [AiEvidencePackBuilder, AiRetrievalOrchestratorService],
})
export class AiModule {}
