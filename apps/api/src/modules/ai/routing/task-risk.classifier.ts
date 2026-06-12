import { Injectable } from '@nestjs/common';
import type { AiTaskKind, AiTaskRisk } from '@amic-vault/shared';

export interface AiTaskRiskInput {
  taskKind?: AiTaskKind | undefined;
  prompt?: string | undefined;
}

export interface AiTaskRiskDecision {
  risk: AiTaskRisk;
  escalationRequired: boolean;
  reasonCode?: 'high_risk_requires_review' | 'unsupported_scope' | 'unknown_task_kind';
  appliedRules: readonly string[];
}

const highRiskPromptPattern =
  /(legal opinion|final advice|send to client|external response|법률\s*의견|최종\s*검토|고객에게\s*발송|대외\s*문안|위험\s*평가)/i;

const lowRiskTasks = new Set<AiTaskKind>(['retrieval', 'citation', 'query_rewrite']);
const mediumRiskTasks = new Set<AiTaskKind>([
  'document_summary',
  'matter_summary',
  'email_thread_summary',
  'clause_analysis',
]);
const highRiskTasks = new Set<AiTaskKind>([
  'risk_extraction',
  'legal_conclusion',
  'external_communication',
]);
const unsupportedTasks = new Set<AiTaskKind>(['unsupported_graph', 'unsupported_rule']);

@Injectable()
export class AiTaskRiskClassifier {
  classify(input: AiTaskRiskInput): AiTaskRiskDecision {
    const taskKind = input.taskKind ?? 'unknown';
    if (unsupportedTasks.has(taskKind)) {
      return {
        risk: 'unsupported',
        escalationRequired: true,
        reasonCode: 'unsupported_scope',
        appliedRules: [`task_kind:${taskKind}`, 'task_risk:unsupported'],
      };
    }
    if (highRiskTasks.has(taskKind) || highRiskPromptPattern.test(input.prompt ?? '')) {
      return {
        risk: 'high',
        escalationRequired: true,
        reasonCode: 'high_risk_requires_review',
        appliedRules: [`task_kind:${taskKind}`, 'task_risk:high'],
      };
    }
    if (mediumRiskTasks.has(taskKind)) {
      return {
        risk: 'medium',
        escalationRequired: false,
        appliedRules: [`task_kind:${taskKind}`, 'task_risk:medium'],
      };
    }
    if (lowRiskTasks.has(taskKind)) {
      return {
        risk: 'low',
        escalationRequired: false,
        appliedRules: [`task_kind:${taskKind}`, 'task_risk:low'],
      };
    }
    return {
      risk: 'high',
      escalationRequired: true,
      reasonCode: 'unknown_task_kind',
      appliedRules: [`task_kind:${taskKind}`, 'task_risk:unknown_to_high'],
    };
  }
}
