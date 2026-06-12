import { z } from 'zod';
import { aiModelRouteKeys, aiModelTiers } from '../types/ai-policy';

export const aiModelRouteSchema = z.enum(aiModelRouteKeys);
export const aiModelTierSchema = z.enum(aiModelTiers);

export const aiTaskKindSchema = z.enum([
  'retrieval',
  'citation',
  'query_rewrite',
  'document_summary',
  'matter_summary',
  'email_thread_summary',
  'clause_analysis',
  'risk_extraction',
  'legal_conclusion',
  'external_communication',
  'unsupported_graph',
  'unsupported_rule',
  'unknown',
]);

export const aiTaskRiskSchema = z.enum(['low', 'medium', 'high', 'unsupported']);

export const aiRoutingEffectSchema = z.enum(['ALLOW', 'DENY', 'ESCALATE']);

export const aiRoutingDecisionSchema = z
  .object({
    effect: aiRoutingEffectSchema,
    modelRoute: aiModelRouteSchema.nullable(),
    modelTier: aiModelTierSchema.nullable(),
    risk: aiTaskRiskSchema,
    escalationRequired: z.boolean(),
    reasonCode: z.string().min(1).max(80).optional(),
    auditDecisionRef: z.string().min(1).max(160).optional(),
    appliedRules: z.array(z.string().min(1).max(120)).max(20),
  })
  .strict();

export type AiModelRoute = z.infer<typeof aiModelRouteSchema>;
export type AiModelTier = z.infer<typeof aiModelTierSchema>;
export type AiTaskKind = z.infer<typeof aiTaskKindSchema>;
export type AiTaskRisk = z.infer<typeof aiTaskRiskSchema>;
export type AiRoutingEffect = z.infer<typeof aiRoutingEffectSchema>;
export type AiRoutingDecisionDto = z.infer<typeof aiRoutingDecisionSchema>;
