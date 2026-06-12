import { describe, expect, it } from 'vitest';
import type { AuditLogInput, AuditLogResult, AuditService } from '../../audit/audit.service';
import type { AiPolicyService } from '../../ai-policy/ai-policy.service';
import type {
  SearchPermissionScopeDecision,
  SearchPermissionScopeProvider,
} from '../../search/permission/search-permission-scope.provider';
import type { SearchQueryBuilder } from '../../search/query/search-query.builder';
import { AiMetadataFilterBuilder } from './metadata-filter.builder';
import { AiQuestionClassifier } from './question-classifier';
import type { AiRedactionPreprocessor } from './redaction-preprocessor';
import type { AiDeterministicReranker } from './reranker';
import { AiRetrievalOrchestratorService } from './retrieval-orchestrator.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111102';

describe('AiRetrievalOrchestratorService', () => {
  it('fails closed before AI policy when permission scope injection throws', async () => {
    const auditInputs: AuditLogInput[] = [];
    let aiPolicyCalls = 0;
    const service = new AiRetrievalOrchestratorService(
      {
        async log(input: AuditLogInput): Promise<AuditLogResult> {
          auditInputs.push(input);
          return { eventId: 'event-1', createdAt: new Date('2026-06-12T00:00:00.000Z') };
        },
      } as unknown as AuditService,
      {
        async assertAllowed(): Promise<never> {
          aiPolicyCalls += 1;
          throw new Error('must not evaluate AI policy after scope failure');
        },
      } as unknown as AiPolicyService,
      {
        async scopeForSearch(): Promise<SearchPermissionScopeDecision> {
          throw new Error('scope unavailable');
        },
      } satisfies SearchPermissionScopeProvider,
      {} as unknown as SearchQueryBuilder,
      new AiQuestionClassifier(),
      new AiMetadataFilterBuilder(),
      {} as unknown as AiRedactionPreprocessor,
      {} as unknown as AiDeterministicReranker,
    );

    const result = await service.retrieve({
      tenantId,
      userId,
      matterId,
      query: 'termination covenant',
    });

    expect(result).toMatchObject({
      status: 'denied',
      reasonCode: 'permission_denied',
      chunks: [],
    });
    expect(result.appliedRules).toContain('permission_scope:error');
    expect(aiPolicyCalls).toBe(0);
    expect(auditInputs[0]).toMatchObject({
      action: 'SEARCH_EXECUTED',
      targetType: 'ai_retrieval',
      result: 'denied',
    });
  });
});
