import { Inject, Injectable } from '@nestjs/common';
import {
  aiRoutingDecisionSchema,
  type AiModelRoute,
  type AiPolicyPurpose,
  type AiRoutingDecisionDto,
  type AiTaskKind,
} from '@amic-vault/shared';
import { AiPolicyService } from '../../ai-policy/ai-policy.service';
import { AiTaskRiskClassifier } from './task-risk.classifier';

export interface AiModelRoutingContext {
  tenantId: string;
  userId: string;
}

export interface AiModelRoutingRequest {
  matterId: string;
  modelRoute?: string | undefined;
  taskKind?: AiTaskKind | undefined;
  prompt?: string | undefined;
  documentIds?: readonly string[] | undefined;
}

@Injectable()
export class AiModelRoutingService {
  constructor(
    @Inject(AiPolicyService) private readonly aiPolicyService: AiPolicyService,
    @Inject(AiTaskRiskClassifier) private readonly riskClassifier: AiTaskRiskClassifier,
  ) {}

  async decide(
    ctx: AiModelRoutingContext,
    input: AiModelRoutingRequest,
  ): Promise<AiRoutingDecisionDto> {
    const requestedRoute = input.modelRoute ?? 'local_gemma';
    const risk = this.riskClassifier.classify({
      taskKind: input.taskKind,
      prompt: input.prompt,
    });
    const policy = await this.aiPolicyService.evaluate({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      matterId: input.matterId,
      modelRoute: requestedRoute,
      purpose: purposeForTask(input.taskKind),
      documentIds: input.documentIds,
    });
    const modelRoute: AiModelRoute | null =
      policy.modelRoute === 'local_gemma' ? 'local_gemma' : null;
    const appliedRules = [...risk.appliedRules, ...policy.appliedRules];

    if (policy.effect !== 'ALLOW') {
      return aiRoutingDecisionSchema.parse({
        effect: 'DENY',
        modelRoute,
        modelTier: null,
        risk: risk.risk,
        escalationRequired: true,
        reasonCode: policy.reasonCode ?? 'evaluation_error',
        auditDecisionRef: policy.decisionRef,
        appliedRules,
      });
    }

    if (risk.escalationRequired) {
      return aiRoutingDecisionSchema.parse({
        effect: 'ESCALATE',
        modelRoute: 'local_gemma',
        modelTier: 'local',
        risk: risk.risk,
        escalationRequired: true,
        reasonCode: risk.reasonCode ?? 'high_risk_requires_review',
        auditDecisionRef: policy.decisionRef,
        appliedRules,
      });
    }

    return aiRoutingDecisionSchema.parse({
      effect: 'ALLOW',
      modelRoute: 'local_gemma',
      modelTier: 'local',
      risk: risk.risk,
      escalationRequired: false,
      auditDecisionRef: policy.decisionRef,
      appliedRules,
    });
  }
}

function purposeForTask(taskKind: AiTaskKind | undefined): AiPolicyPurpose {
  if (taskKind === 'citation') return 'citation';
  if (
    taskKind === 'document_summary' ||
    taskKind === 'matter_summary' ||
    taskKind === 'email_thread_summary'
  ) {
    return 'summary';
  }
  if (taskKind === 'retrieval' || taskKind === 'query_rewrite') return 'retrieval';
  return 'evaluation';
}
