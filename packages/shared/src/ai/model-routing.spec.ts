import { describe, expect, it } from 'vitest';
import {
  aiModelRouteSchema,
  aiRoutingDecisionSchema,
  aiTaskKindSchema,
} from './model-routing';

describe('AI model routing contracts', () => {
  it('keeps local_gemma as the only enabled R6 route', () => {
    expect(aiModelRouteSchema.parse('local_gemma')).toBe('local_gemma');
    expect(() => aiModelRouteSchema.parse('openai_gpt4')).toThrow();
  });

  it('parses conservative task kinds and routing decisions', () => {
    expect(aiTaskKindSchema.parse('legal_conclusion')).toBe('legal_conclusion');
    expect(aiTaskKindSchema.parse('matter_qa')).toBe('matter_qa');
    expect(
      aiRoutingDecisionSchema.parse({
        effect: 'ESCALATE',
        modelRoute: 'local_gemma',
        modelTier: 'local',
        risk: 'high',
        escalationRequired: true,
        reasonCode: 'high_risk_requires_review',
        appliedRules: ['task_risk:high'],
      }),
    ).toMatchObject({ effect: 'ESCALATE', escalationRequired: true });
  });
});
