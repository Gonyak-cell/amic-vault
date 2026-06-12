import { describe, expect, it, vi } from 'vitest';
import type { AiPolicyEvaluationRequest, AiPolicyEvaluationResult } from '@amic-vault/shared';
import type { AiPolicyService } from '../../ai-policy/ai-policy.service';
import { AiModelRoutingService } from './model-routing.service';
import { AiTaskRiskClassifier } from './task-risk.classifier';

const ctx = {
  tenantId: '11111111-1111-4111-8111-111111111001',
  userId: '11111111-1111-4111-8111-111111111002',
};
const matterId = '11111111-1111-4111-8111-111111111003';

describe('AiModelRoutingService', () => {
  it('allows low-risk local_gemma when policy allows', async () => {
    const service = createService(allowedPolicy());

    await expect(
      service.decide(ctx, { matterId, modelRoute: 'local_gemma', taskKind: 'retrieval' }),
    ).resolves.toMatchObject({
      effect: 'ALLOW',
      modelRoute: 'local_gemma',
      modelTier: 'local',
      risk: 'low',
      escalationRequired: false,
    });
  });

  it('sets escalation for high-risk tasks without fabricating an answer', async () => {
    const service = createService(allowedPolicy());
    const decision = await service.decide(ctx, {
      matterId,
      modelRoute: 'local_gemma',
      taskKind: 'legal_conclusion',
    });

    expect(decision).toMatchObject({
      effect: 'ESCALATE',
      reasonCode: 'high_risk_requires_review',
      escalationRequired: true,
    });
    expect(decision).not.toHaveProperty('answer');
  });

  it('denies unknown routes through policy evaluation', async () => {
    const evaluate = vi.fn(async (input: AiPolicyEvaluationRequest) => ({
      ...deniedPolicy('model_route_unknown'),
      modelRoute: input.modelRoute ?? null,
    }));
    const service = new AiModelRoutingService(
      { evaluate } as unknown as AiPolicyService,
      new AiTaskRiskClassifier(),
    );

    const decision = await service.decide(ctx, {
      matterId,
      modelRoute: 'openai_gpt4',
      taskKind: 'retrieval',
    });

    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ modelRoute: 'openai_gpt4', purpose: 'retrieval' }),
    );
    expect(decision).toMatchObject({
      effect: 'DENY',
      modelRoute: null,
      reasonCode: 'model_route_unknown',
      escalationRequired: true,
    });
  });
});

function createService(policyResult: AiPolicyEvaluationResult): AiModelRoutingService {
  return new AiModelRoutingService(
    { evaluate: vi.fn(async () => policyResult) } as unknown as AiPolicyService,
    new AiTaskRiskClassifier(),
  );
}

function allowedPolicy(): AiPolicyEvaluationResult {
  return {
    effect: 'ALLOW',
    auditResult: 'success',
    policyId: 'policy-1',
    modelRoute: 'local_gemma',
    matterId,
    documentDecisions: [],
    appliedRules: ['model_access_policy:enabled'],
    decisionRef: 'ai_policy_decision:allow',
  };
}

function deniedPolicy(reasonCode: AiPolicyEvaluationResult['reasonCode']): AiPolicyEvaluationResult {
  return {
    effect: 'DENY',
    code: 'AI_POLICY_BLOCKED',
    reasonCode,
    auditResult: 'denied',
    policyId: 'policy-1',
    modelRoute: null,
    matterId,
    documentDecisions: [],
    appliedRules: ['model_route:unknown'],
    decisionRef: 'ai_policy_decision:deny',
  };
}
