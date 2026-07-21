import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MatterKnowledgeTab,
  type MatterKnowledgeInitialData,
} from '@/components/matter/matter-knowledge-tab';

type KnowledgeNode = MatterKnowledgeInitialData['facts'][number]['source'];

describe('MatterKnowledgeTab', () => {
  it('renders graph facts, wiki pages, issue map, and citation ledger links', () => {
    const html = renderToStaticMarkup(
      <MatterKnowledgeTab
        matterId="11111111-1111-4111-8111-111111111001"
        initialData={knowledgeData()}
      />,
    );

    expect(html).toContain('Matter Graph');
    expect(html).toContain('Matter 지식 서브탭');
    expect(html).toContain('[확정]');
    expect(html).toContain('[AI제안]');
    expect(html).toContain('[파생]');
    expect(html).toContain('EVIDENCED_BY');
    expect(html).toContain('id="graph-node-11111111-1111-4111-8111-111111111010"');
    expect(html).toContain('/documents/11111111-1111-4111-8111-111111111003');
    expect(html).toContain('위키');
    expect(html).toContain('계약 종료 쟁점');
    expect(html).toContain(
      '/matters/11111111-1111-4111-8111-111111111001#graph-node-11111111-1111-4111-8111-111111111010',
    );
    expect(html).toContain(
      'http://localhost:3001/v1/matters/11111111-1111-4111-8111-111111111001/wiki-export',
    );
    expect(html).toContain('Issue Map');
    expect(html).toContain('LIT-001');
    expect(html).toContain('DD-ISSUE-001');
    expect(html).toContain('Citation Panel');
    expect(html).toContain('LOI 체결 사실이 확인되었습니다.');
    expect(html).toContain('/documents/11111111-1111-4111-8111-111111111003?chunk=1');
  });

  it('renders a safe API error state', () => {
    const html = renderToStaticMarkup(
      <MatterKnowledgeTab
        matterId="11111111-1111-4111-8111-111111111001"
        initialError="PERMISSION_DENIED"
      />,
    );

    expect(html).toContain('지식 데이터를 표시할 수 없습니다.');
    expect(html).toContain('PERMISSION_DENIED');
  });
});

function knowledgeData(): MatterKnowledgeInitialData {
  const confirmed = graphNode(
    '11111111-1111-4111-8111-111111111010',
    'fact',
    'human_confirmed',
  );
  const proposed = graphNode(
    '11111111-1111-4111-8111-111111111011',
    'issue',
    'ai_proposed',
  );
  const derived = graphNode(
    '11111111-1111-4111-8111-111111111012',
    'document',
    'derived',
  );
  return {
    facts: [
      {
        edgeId: '11111111-1111-4111-8111-111111111100',
        edgeType: 'EVIDENCED_BY',
        matterId: '11111111-1111-4111-8111-111111111001',
        documentId: '11111111-1111-4111-8111-111111111003',
        source: confirmed,
        target: derived,
        sourceHash: 'a'.repeat(64),
      },
      {
        edgeId: '11111111-1111-4111-8111-111111111101',
        edgeType: 'HAS_ISSUE',
        matterId: '11111111-1111-4111-8111-111111111001',
        documentId: null,
        source: confirmed,
        target: proposed,
        sourceHash: 'b'.repeat(64),
      },
    ],
    neighborhood: {
      matterId: '11111111-1111-4111-8111-111111111001',
      rootNodeId: confirmed.nodeId,
      depth: 1,
      nodes: [confirmed, proposed, derived],
      edges: [],
      paths: [],
      nextCursor: null,
    },
    wiki: {
      matterId: '11111111-1111-4111-8111-111111111001',
      pages: [
        {
          pageId: '11111111-1111-4111-8111-111111111301',
          matterId: '11111111-1111-4111-8111-111111111001',
          pageKind: 'overview',
          title: '사건 개요',
          markdownBody: [
            '# 사건 개요',
            '',
            '[[11111111-1111-4111-8111-111111111010|계약 종료 쟁점]]은 근거 문서와 연결됩니다.',
            '- [[dd_issue:11111111-1111-4111-8111-111111111202|근거 문서]] 확인 필요',
            '[^1]: graph_node:11111111-1111-4111-8111-111111111010',
          ].join('\n'),
          sourceRefs: [
            {
              sourceRef: 'graph_node:11111111-1111-4111-8111-111111111010',
              sourceKind: 'graph_node',
              nodeId: confirmed.nodeId,
            },
            {
              sourceRef: 'dd_issue:11111111-1111-4111-8111-111111111202',
              sourceKind: 'dd_issue',
              documentId: '11111111-1111-4111-8111-111111111003',
            },
          ],
          provenance: 'ai_proposed',
          reviewStatus: 'confirmed',
          reviewedBy: '11111111-1111-4111-8111-111111111101',
          reviewedAt: '2026-07-05T00:00:00.000Z',
          reviewReason: 'matter knowledge tab test',
          workItemId: '11111111-1111-4111-8111-111111111302',
          createdAt: '2026-07-05T00:00:00.000Z',
          updatedAt: '2026-07-05T00:00:00.000Z',
        },
      ],
    },
    litigationIssues: [
      {
        issueId: '11111111-1111-4111-8111-111111111201',
        matterId: '11111111-1111-4111-8111-111111111001',
        parentIssueId: null,
        issueCode: 'LIT-001',
        label: '진술 신빙성',
        issueType: 'argument',
        status: 'open',
        position: 1,
        createdAt: '2026-07-05T00:00:00.000Z',
        updatedAt: '2026-07-05T00:00:00.000Z',
      },
    ],
    ddIssues: [
      {
        issueId: '11111111-1111-4111-8111-111111111202',
        matterId: '11111111-1111-4111-8111-111111111001',
        rfiId: null,
        documentId: '11111111-1111-4111-8111-111111111003',
        issueCode: 'DD-ISSUE-001',
        title: '자료 미제출',
        severity: 'high',
        status: 'open',
        citationRefs: ['document:11111111-1111-4111-8111-111111111003'],
        reportInclusion: true,
        createdAt: '2026-07-05T00:00:00.000Z',
        updatedAt: '2026-07-05T00:00:00.000Z',
      },
    ],
    claims: {
      sessionId: '11111111-1111-4111-8111-111111111020',
      claims: [
        {
          claimId: '11111111-1111-4111-8111-111111111021',
          sessionClaimId: 'claim-1',
          sessionId: '11111111-1111-4111-8111-111111111020',
          claimHash: 'c'.repeat(64),
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
    },
  };
}

function graphNode(
  nodeId: string,
  nodeType: 'document' | 'fact' | 'issue',
  provenance: KnowledgeNode['provenance'],
): KnowledgeNode {
  const createdByKind: KnowledgeNode['createdByKind'] =
    provenance === 'human_confirmed' ? 'human' : 'system';
  const reviewStatus: KnowledgeNode['reviewStatus'] =
    provenance === 'ai_proposed' ? 'proposed' : 'confirmed';
  return {
    nodeId,
    nodeType,
    sourceId: nodeId,
    matterId: '11111111-1111-4111-8111-111111111001',
    documentId: nodeType === 'document' ? '11111111-1111-4111-8111-111111111003' : null,
    versionId: nodeType === 'document' ? '11111111-1111-4111-8111-111111111005' : null,
    provenance,
    reviewStatus,
    createdByKind,
  };
}
