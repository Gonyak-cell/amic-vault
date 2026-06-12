import { Module } from '@nestjs/common';
import { AiPolicyModule } from '../ai-policy/ai-policy.module';
import { AuditModule } from '../audit/audit.module';
import { DlpModule } from '../dlp/dlp.module';
import { SearchModule } from '../search/search.module';
import { AiMetadataFilterBuilder } from './retrieval/metadata-filter.builder';
import { AiQuestionClassifier } from './retrieval/question-classifier';
import { AiRedactionPreprocessor } from './retrieval/redaction-preprocessor';
import { AiDeterministicReranker } from './retrieval/reranker';
import { AiRetrievalOrchestratorService } from './retrieval/retrieval-orchestrator.service';

@Module({
  imports: [AiPolicyModule, AuditModule, DlpModule, SearchModule],
  providers: [
    AiDeterministicReranker,
    AiMetadataFilterBuilder,
    AiQuestionClassifier,
    AiRedactionPreprocessor,
    AiRetrievalOrchestratorService,
  ],
  exports: [AiRetrievalOrchestratorService],
})
export class AiModule {}
