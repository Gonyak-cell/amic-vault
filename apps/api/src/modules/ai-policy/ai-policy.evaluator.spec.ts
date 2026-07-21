import { describe, expect, it } from 'vitest';
import { evaluateAiPolicySnapshot } from './ai-policy.evaluator';

const matterPolicy = {
  policyId: 'policy-1',
  allowedModelTiers: ['local'],
  externalModelAllowed: false,
  defaultEffect: 'DENY' as const,
};

const enabledLocalRoute = {
  routeKey: 'local_gemma',
  modelTier: 'local',
  status: 'enabled' as const,
  externalModelAllowed: false,
};

describe('AI policy evaluator', () => {
  it('fails closed when matter policy is missing', () => {
    const result = evaluateAiPolicySnapshot({
      matterId: 'matter-1',
      modelRoute: 'local_gemma',
      matterPolicy: null,
      modelAccessPolicy: enabledLocalRoute,
      requestedDocumentIds: [],
      documents: [],
    });

    expect(result.effect).toBe('DENY');
    expect(result.reasonCode).toBe('matter_policy_missing');
    expect(result.code).toBe('AI_POLICY_BLOCKED');
  });

  it('allows only explicit local tier policy with aiAllowed documents', () => {
    const result = evaluateAiPolicySnapshot({
      matterId: 'matter-1',
      modelRoute: 'local_gemma',
      matterPolicy,
      modelAccessPolicy: enabledLocalRoute,
      requestedDocumentIds: ['doc-1'],
      documents: [{ documentId: 'doc-1', aiAllowed: true }],
    });

    expect(result.effect).toBe('ALLOW');
    expect(result.reasonCode).toBeUndefined();
    expect(result.allowedDocumentIds).toEqual(['doc-1']);
    expect(result.excludedDocumentDecisions).toEqual([]);
  });

  it('requires document aiAllowed but treats it as insufficient alone', () => {
    const result = evaluateAiPolicySnapshot({
      matterId: 'matter-1',
      modelRoute: 'local_gemma',
      matterPolicy,
      modelAccessPolicy: null,
      requestedDocumentIds: ['doc-1'],
      documents: [{ documentId: 'doc-1', aiAllowed: true }],
    });

    expect(result.effect).toBe('DENY');
    expect(result.reasonCode).toBe('model_route_unknown');
  });

  it('partitions mixed aiAllowed documents without exposing blocked chunks to evidence', () => {
    const result = evaluateAiPolicySnapshot({
      matterId: 'matter-1',
      modelRoute: 'local_gemma',
      matterPolicy,
      modelAccessPolicy: enabledLocalRoute,
      requestedDocumentIds: ['doc-1', 'doc-2', 'doc-3'],
      documents: [
        { documentId: 'doc-1', aiAllowed: true },
        { documentId: 'doc-2', aiAllowed: false },
        { documentId: 'doc-3', aiAllowed: true },
      ],
    });

    expect(result.effect).toBe('ALLOW');
    expect(result.allowedDocumentIds).toEqual(['doc-1', 'doc-3']);
    expect(result.excludedDocumentDecisions).toEqual([
      { documentId: 'doc-2', reasonCode: 'document_ai_not_allowed' },
    ]);
    expect(result.appliedRules).toContain('document.ai_allowed:mixed_excluded');
  });

  it('blocks when every requested document has aiAllowed false', () => {
    const result = evaluateAiPolicySnapshot({
      matterId: 'matter-1',
      modelRoute: 'local_gemma',
      matterPolicy,
      modelAccessPolicy: enabledLocalRoute,
      requestedDocumentIds: ['doc-1', 'doc-2'],
      documents: [
        { documentId: 'doc-1', aiAllowed: false },
        { documentId: 'doc-2', aiAllowed: false },
      ],
    });

    expect(result.effect).toBe('DENY');
    expect(result.reasonCode).toBe('document_ai_not_allowed');
    expect(result.excludedDocumentDecisions).toEqual([
      { documentId: 'doc-1', reasonCode: 'document_ai_not_allowed' },
      { documentId: 'doc-2', reasonCode: 'document_ai_not_allowed' },
    ]);
  });

  it('distinguishes invalid route syntax from unknown routes', () => {
    const invalid = evaluateAiPolicySnapshot({
      matterId: 'matter-1',
      modelRoute: 'local/gemma',
      matterPolicy,
      modelAccessPolicy: null,
      requestedDocumentIds: [],
      documents: [],
    });
    const unknown = evaluateAiPolicySnapshot({
      matterId: 'matter-1',
      modelRoute: 'outside_model',
      matterPolicy,
      modelAccessPolicy: null,
      requestedDocumentIds: [],
      documents: [],
    });

    expect(invalid.auditResult).toBe('failure');
    expect(invalid.reasonCode).toBe('policy_parse_failure');
    expect(unknown.auditResult).toBe('denied');
    expect(unknown.reasonCode).toBe('model_route_unknown');
  });

  it('fails closed on malformed policy snapshots', () => {
    const result = evaluateAiPolicySnapshot({
      matterId: 'matter-1',
      modelRoute: 'local_gemma',
      matterPolicy: {
        ...matterPolicy,
        defaultEffect: 'ALLOW',
      },
      modelAccessPolicy: enabledLocalRoute,
      requestedDocumentIds: [],
      documents: [],
    });

    expect(result.auditResult).toBe('failure');
    expect(result.reasonCode).toBe('policy_parse_failure');
  });
});
