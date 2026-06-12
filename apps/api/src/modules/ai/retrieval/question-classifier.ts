import { Injectable } from '@nestjs/common';
import type { AiQuestionKind } from './ai-retrieval.types';

export interface AiQuestionClassification {
  kind: AiQuestionKind;
  appliedRules: readonly string[];
}

const graphPattern = /\b(graph|relationship|network|neo4j|connected|link\s+analysis)\b|관계망|그래프|연결\s*관계/iu;
const rulePattern = /\b(rule\s+finding|clause\s+classification|clause\s+extraction|playbook|defined\s+term)\b|조항\s*분류|조항\s*추출|정의어|룰\s*판정/iu;

@Injectable()
export class AiQuestionClassifier {
  classify(query: string): AiQuestionClassification {
    if (graphPattern.test(query)) {
      return {
        kind: 'unsupported_graph',
        appliedRules: ['question.graph:unsupported_before_r7'],
      };
    }
    if (rulePattern.test(query)) {
      return {
        kind: 'unsupported_rule',
        appliedRules: ['question.rule_findings:unsupported_before_r8'],
      };
    }
    return {
      kind: 'retrieval',
      appliedRules: ['question.retrieval:supported'],
    };
  }
}
