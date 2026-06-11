export type AiPolicyDefaultEffect = 'DENY';

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
