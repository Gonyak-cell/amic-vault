import { describe, expect, it } from 'vitest';
import {
  graphConsistencyDriftSchema,
  graphConsistencyResponseSchema,
  graphFactSchema,
  graphFactsQuerySchema,
  graphNeighborhoodQuerySchema,
  graphNeighborhoodResponseSchema,
  graphNodeReviewRequestSchema,
  graphNodeReviewResponseSchema,
  graphNodeTypes,
  graphSyncRequestSchema,
} from './graph-types';

const uuid = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);
const graphNodeStatus = {
  provenance: 'derived',
  reviewStatus: 'confirmed',
  createdByKind: 'system',
} as const;

describe('graph shared contracts', () => {
  it('covers the R7 taxonomy without adding external or rule-store nodes', () => {
    expect(graphNodeTypes).toEqual([
      'client',
      'matter',
      'document',
      'version',
      'text_chunk',
      'clause',
      'defined_term',
      'fact',
      'evidence',
      'issue',
      'risk',
      'rfi',
      'party',
      'negotiation_position',
    ]);
  });

  it('accepts ID-only graph facts', () => {
    const fact = graphFactSchema.parse({
      edgeId: uuid,
      edgeType: 'HAS_DOCUMENT',
      matterId: uuid,
      documentId: uuid,
      sourceHash: hash,
      source: {
        nodeId: uuid,
        nodeType: 'matter',
        sourceId: uuid,
        matterId: uuid,
        documentId: null,
        versionId: null,
        ...graphNodeStatus,
      },
      target: {
        nodeId: uuid,
        nodeType: 'document',
        sourceId: uuid,
        matterId: uuid,
        documentId: uuid,
        versionId: null,
        ...graphNodeStatus,
      },
    });

    expect(JSON.stringify(fact)).not.toMatch(/body|snippet|raw|content|text/u);
  });

  it('bounds query, sync, and consistency contracts', () => {
    expect(graphFactsQuerySchema.parse({ matterId: uuid, limit: '5' }).limit).toBe(5);
    expect(
      graphNeighborhoodQuerySchema.parse({
        nodeId: uuid,
        depth: '3',
        edgeTypes: 'HAS_ISSUE,REQUIRES_ACTION',
      }),
    ).toMatchObject({ depth: 3, edgeTypes: ['HAS_ISSUE', 'REQUIRES_ACTION'] });
    expect(() => graphNeighborhoodQuerySchema.parse({ nodeId: uuid, depth: '4' })).toThrow();
    expect(graphSyncRequestSchema.parse({ matterId: uuid }).matterId).toBe(uuid);
    expect(
      graphConsistencyResponseSchema.parse({
        matterId: uuid,
        status: 'consistent',
        driftCount: 0,
        drifts: [],
      }).status,
    ).toBe('consistent');
    expect(
      graphNeighborhoodResponseSchema.parse({
        matterId: uuid,
        rootNodeId: uuid,
        depth: 1,
        nodes: [],
        edges: [],
        paths: [],
        nextCursor: null,
      }).nextCursor,
    ).toBeNull();
  });

  it('accepts F10 legal consistency drift categories by ids only', () => {
    const drift = graphConsistencyDriftSchema.parse({
      kind: 'defined_term_mismatch',
      matterId: uuid,
      documentId: null,
      versionId: null,
      nodeId: null,
      edgeId: null,
      termKey: 'confidential information',
      sourceVersionId: uuid,
      targetVersionId: '22222222-2222-4222-8222-222222222222',
      factId: null,
    });

    expect(drift).toMatchObject({
      kind: 'defined_term_mismatch',
      termKey: 'confidential information',
      sourceVersionId: uuid,
      targetVersionId: '22222222-2222-4222-8222-222222222222',
    });
    expect(JSON.stringify(drift)).not.toMatch(/body|snippet|raw|content|text/u);
  });

  it('accepts graph fact review requests and ID-only responses', () => {
    expect(graphNodeReviewRequestSchema.parse({ action: 'confirm' })).toEqual({
      action: 'confirm',
    });
    const response = graphNodeReviewResponseSchema.parse({
      nodeId: uuid,
      matterId: uuid,
      action: 'reject',
      provenance: 'ai_proposed',
      reviewStatus: 'proposed',
      stale: true,
    });

    expect(response.stale).toBe(true);
    expect(JSON.stringify(response)).not.toMatch(/body|snippet|raw|content|claimText/u);
  });
});
