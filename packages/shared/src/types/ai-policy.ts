export type AiPolicyDefaultEffect = 'DENY';
export type AiPolicyDecisionEffect = 'ALLOW' | 'DENY';
export type AiPolicyAuditResult = 'success' | 'denied' | 'failure';

export const aiModelRouteKeys = ['local_gemma'] as const;
export const aiModelTiers = ['local'] as const;
export const aiPolicyPurposes = ['retrieval', 'summary', 'citation', 'evaluation'] as const;
export const aiPolicyBlockReasonCodes = [
  'matter_policy_missing',
  'matter_policy_default_deny',
  'model_route_unknown',
  'model_route_disabled',
  'model_tier_not_allowed',
  'document_missing_or_denied',
  'document_ai_not_allowed',
  'policy_parse_failure',
  'permission_context_denied',
  'evaluation_error',
] as const;

export type AiModelRouteKey = (typeof aiModelRouteKeys)[number];
export type AiModelTier = (typeof aiModelTiers)[number];
export type AiPolicyPurpose = (typeof aiPolicyPurposes)[number];
export type AiPolicyBlockReasonCode = (typeof aiPolicyBlockReasonCodes)[number];

export interface AiPolicySchema {
  policyId: string;
  tenantId: string;
  name: string;
  allowedModelTiers: readonly string[];
  externalModelAllowed: false;
  defaultEffect: AiPolicyDefaultEffect;
  createdAt: string;
  updatedAt: string;
}

export interface AiPolicyEvaluationRequest {
  tenantId: string;
  userId: string;
  matterId: string;
  modelRoute?: string | undefined;
  purpose?: AiPolicyPurpose | undefined;
  documentIds?: readonly string[] | undefined;
}

export interface AiDocumentPolicyDecision {
  documentId: string;
  aiAllowed: boolean;
}

export interface AiPolicyEvaluationResult {
  effect: AiPolicyDecisionEffect;
  code?: 'AI_POLICY_BLOCKED' | undefined;
  reasonCode?: AiPolicyBlockReasonCode | undefined;
  auditResult: AiPolicyAuditResult;
  policyId: string | null;
  modelRoute: string | null;
  matterId: string;
  documentDecisions: readonly AiDocumentPolicyDecision[];
  appliedRules: readonly string[];
  decisionRef: string;
}

export interface AiPolicyBlockedResponse {
  code: 'AI_POLICY_BLOCKED';
  decisionRef: string;
  reasonCode: AiPolicyBlockReasonCode;
}

export function aiPolicyBlockedResponse(
  result: Pick<AiPolicyEvaluationResult, 'decisionRef' | 'reasonCode'>,
): AiPolicyBlockedResponse {
  return {
    code: 'AI_POLICY_BLOCKED',
    decisionRef: result.decisionRef,
    reasonCode: result.reasonCode ?? 'evaluation_error',
  };
}
