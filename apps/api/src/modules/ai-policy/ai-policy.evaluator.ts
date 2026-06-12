import type {
  AiDocumentPolicyDecision,
  AiPolicyAuditResult,
  AiPolicyBlockReasonCode,
  AiPolicyDecisionEffect,
} from '@amic-vault/shared';
import { aiModelRouteKeys } from '@amic-vault/shared';

const knownRoutes = new Set<string>(aiModelRouteKeys);
const routePattern = /^[a-z0-9_]{1,64}$/;

export interface MatterPolicySnapshot {
  policyId: string | null;
  allowedModelTiers: readonly string[];
  externalModelAllowed: boolean;
  defaultEffect: string;
}

export interface ModelAccessPolicySnapshot {
  routeKey: string;
  modelTier: string;
  status: 'enabled' | 'disabled';
  externalModelAllowed: boolean;
}

export interface AiPolicySnapshotInput {
  matterId: string;
  modelRoute: string;
  matterPolicy: MatterPolicySnapshot | null;
  modelAccessPolicy: ModelAccessPolicySnapshot | null;
  requestedDocumentIds: readonly string[];
  documents: readonly AiDocumentPolicyDecision[];
}

export interface AiPolicyCoreDecision {
  effect: AiPolicyDecisionEffect;
  code?: 'AI_POLICY_BLOCKED';
  reasonCode?: AiPolicyBlockReasonCode;
  auditResult: AiPolicyAuditResult;
  policyId: string | null;
  modelRoute: string | null;
  matterId: string;
  documentDecisions: readonly AiDocumentPolicyDecision[];
  appliedRules: readonly string[];
}

function deny(
  input: AiPolicySnapshotInput,
  reasonCode: AiPolicyBlockReasonCode,
  appliedRules: readonly string[],
  auditResult: AiPolicyAuditResult = 'denied',
): AiPolicyCoreDecision {
  return {
    effect: 'DENY',
    code: 'AI_POLICY_BLOCKED',
    reasonCode,
    auditResult,
    policyId: input.matterPolicy?.policyId ?? null,
    modelRoute: routePattern.test(input.modelRoute) ? input.modelRoute : null,
    matterId: input.matterId,
    documentDecisions: input.documents,
    appliedRules,
  };
}

export function evaluateAiPolicySnapshot(input: AiPolicySnapshotInput): AiPolicyCoreDecision {
  if (!routePattern.test(input.modelRoute)) {
    return deny(input, 'policy_parse_failure', ['model_route:invalid_syntax'], 'failure');
  }
  if (!knownRoutes.has(input.modelRoute)) {
    return deny(input, 'model_route_unknown', ['model_route:unknown']);
  }
  if (!input.matterPolicy?.policyId) {
    return deny(input, 'matter_policy_missing', ['matter.ai_policy_id:missing']);
  }
  if (
    input.matterPolicy.defaultEffect !== 'DENY' ||
    input.matterPolicy.externalModelAllowed !== false ||
    !Array.isArray(input.matterPolicy.allowedModelTiers)
  ) {
    return deny(input, 'policy_parse_failure', ['matter_policy:invalid_shape'], 'failure');
  }
  if (!input.modelAccessPolicy) {
    return deny(input, 'model_route_unknown', ['model_access_policy:missing']);
  }
  if (
    input.modelAccessPolicy.routeKey !== input.modelRoute ||
    input.modelAccessPolicy.externalModelAllowed !== false
  ) {
    return deny(input, 'policy_parse_failure', ['model_access_policy:invalid_shape'], 'failure');
  }
  if (input.modelAccessPolicy.status !== 'enabled') {
    return deny(input, 'model_route_disabled', ['model_access_policy:disabled']);
  }
  if (input.matterPolicy.allowedModelTiers.length === 0) {
    return deny(input, 'matter_policy_default_deny', ['matter_policy:default_deny']);
  }
  if (!input.matterPolicy.allowedModelTiers.includes(input.modelAccessPolicy.modelTier)) {
    return deny(input, 'model_tier_not_allowed', ['model_tier:not_allowed']);
  }
  if (input.documents.length !== input.requestedDocumentIds.length) {
    return deny(input, 'document_missing_or_denied', ['document:missing_or_outside_matter']);
  }
  if (input.documents.some((document) => !document.aiAllowed)) {
    return deny(input, 'document_ai_not_allowed', ['document.ai_allowed:false']);
  }

  return {
    effect: 'ALLOW',
    auditResult: 'success',
    policyId: input.matterPolicy.policyId,
    modelRoute: input.modelRoute,
    matterId: input.matterId,
    documentDecisions: input.documents,
    appliedRules: [
      'matter_policy:present',
      'model_access_policy:enabled',
      'model_tier:allowed',
      'document.ai_allowed:true_or_not_requested',
    ],
  };
}
