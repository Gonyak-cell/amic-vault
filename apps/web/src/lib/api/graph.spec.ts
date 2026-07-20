import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAiSessionClaims,
  listGraphFacts,
  listGraphNeighborhood,
} from './graph';
import { apiFetch } from '../api-client';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (path.startsWith('/graph/facts')) return graphFactsResponse();
    if (path.startsWith('/graph/neighborhood')) return graphNeighborhoodResponse();
    if (path.startsWith('/ai/sessions/')) return claimsResponse();
    return {};
  }),
}));

describe('graph API client', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockClear();
  });

  it('serializes graph facts query params and parses the response', async () => {
    const result = await listGraphFacts({
      documentId: '11111111-1111-4111-8111-111111111003',
      limit: 12,
      matterId: '11111111-1111-4111-8111-111111111001',
    });

    expect(result.facts).toHaveLength(1);
    expect(apiFetch).toHaveBeenCalledWith(
      '/graph/facts?documentId=11111111-1111-4111-8111-111111111003&limit=12&matterId=11111111-1111-4111-8111-111111111001',
    );
  });

  it('serializes graph neighborhood edge types as a bounded comma list', async () => {
    await listGraphNeighborhood({
      depth: 2,
      edgeTypes: ['HAS_FACT', 'EVIDENCED_BY'],
      limit: 80,
      nodeId: '11111111-1111-4111-8111-111111111010',
    });

    expect(apiFetch).toHaveBeenCalledWith(
      '/graph/neighborhood?depth=2&edgeTypes=HAS_FACT%2CEVIDENCED_BY&limit=80&nodeId=11111111-1111-4111-8111-111111111010',
    );
  });

  it('loads AI claim citation ledger through the session claims endpoint', async () => {
    const result = await getAiSessionClaims('11111111-1111-4111-8111-111111111020');

    expect(result.claims[0]?.citations[0]?.documentId).toBe(
      '11111111-1111-4111-8111-111111111003',
    );
    expect(apiFetch).toHaveBeenCalledWith(
      '/ai/sessions/11111111-1111-4111-8111-111111111020/claims',
      { redirectOnAuthRequired: false },
    );
  });
});

function graphFactsResponse() {
  return {
    matterId: '11111111-1111-4111-8111-111111111001',
    facts: [
      {
        edgeId: '11111111-1111-4111-8111-111111111100',
        edgeType: 'EVIDENCED_BY',
        matterId: '11111111-1111-4111-8111-111111111001',
        documentId: '11111111-1111-4111-8111-111111111003',
        source: graphNode('11111111-1111-4111-8111-111111111010', 'fact', 'human_confirmed'),
        target: graphNode('11111111-1111-4111-8111-111111111011', 'evidence', 'derived'),
        sourceHash: 'a'.repeat(64),
      },
    ],
  };
}

function graphNeighborhoodResponse() {
  const fact = graphFactsResponse().facts[0]!;
  return {
    matterId: '11111111-1111-4111-8111-111111111001',
    rootNodeId: '11111111-1111-4111-8111-111111111010',
    depth: 1,
    nodes: [fact.source, fact.target],
    edges: [fact],
    paths: [
      {
        depth: 1,
        nodeIds: [fact.source.nodeId, fact.target.nodeId],
        edgeIds: [fact.edgeId],
      },
    ],
    nextCursor: null,
  };
}

function claimsResponse() {
  return {
    sessionId: '11111111-1111-4111-8111-111111111020',
    claims: [
      {
        claimId: '11111111-1111-4111-8111-111111111021',
        sessionClaimId: 'claim-1',
        sessionId: '11111111-1111-4111-8111-111111111020',
        claimHash: 'b'.repeat(64),
        claimText: 'LOI 체결 사실이 확인되었습니다.',
        kind: 'key_fact',
        isLegalConclusion: false,
        verificationStatus: 'cited',
        citations: [
          {
            sourceRef: 'chunk:11111111-1111-4111-8111-111111111004',
            documentId: '11111111-1111-4111-8111-111111111003',
            versionId: '11111111-1111-4111-8111-111111111005',
            chunkId: '11111111-1111-4111-8111-111111111004',
          },
        ],
        createdAt: '2026-07-05T00:00:00.000Z',
      },
    ],
  };
}

function graphNode(nodeId: string, nodeType: string, provenance: string) {
  return {
    nodeId,
    nodeType,
    sourceId: nodeId,
    matterId: '11111111-1111-4111-8111-111111111001',
    documentId: nodeType === 'evidence' ? '11111111-1111-4111-8111-111111111003' : null,
    versionId: nodeType === 'evidence' ? '11111111-1111-4111-8111-111111111005' : null,
    provenance,
    reviewStatus: provenance === 'ai_proposed' ? 'proposed' : 'confirmed',
    createdByKind: provenance === 'human_confirmed' ? 'human' : 'system',
  };
}
