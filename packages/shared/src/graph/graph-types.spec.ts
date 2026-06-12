import { describe, expect, it } from 'vitest';
import {
  graphConsistencyResponseSchema,
  graphFactSchema,
  graphFactsQuerySchema,
  graphNodeTypes,
  graphSyncRequestSchema,
} from './graph-types';

const uuid = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);

describe('graph shared contracts', () => {
  it('covers the R7 taxonomy without adding external or rule-store nodes', () => {
    expect(graphNodeTypes).toEqual([
      'client',
      'matter',
      'document',
      'version',
      'clause',
      'issue',
      'risk',
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
      },
      target: {
        nodeId: uuid,
        nodeType: 'document',
        sourceId: uuid,
        matterId: uuid,
        documentId: uuid,
        versionId: null,
      },
    });

    expect(JSON.stringify(fact)).not.toMatch(/body|snippet|raw|content|text/u);
  });

  it('bounds query, sync, and consistency contracts', () => {
    expect(graphFactsQuerySchema.parse({ matterId: uuid, limit: '5' }).limit).toBe(5);
    expect(graphSyncRequestSchema.parse({ matterId: uuid }).matterId).toBe(uuid);
    expect(
      graphConsistencyResponseSchema.parse({
        matterId: uuid,
        status: 'consistent',
        driftCount: 0,
        drifts: [],
      }).status,
    ).toBe('consistent');
  });
});
