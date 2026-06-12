import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AiRetrievalResult, AiRetrievedChunk } from '../retrieval/ai-retrieval.types';
import { AiContextRanker } from './context-ranker';
import { AiContextWindowManager } from './context-window.manager';
import { AiEvidencePackBuilder } from './evidence-pack.builder';

const tenantId = '11111111-1111-4111-8111-111111111001';
const matterId = '11111111-1111-4111-8111-111111111002';
const versionId = '11111111-1111-4111-8111-111111111003';
const sourceHash = 'c'.repeat(64);

function chunk(input: Partial<AiRetrievedChunk>): AiRetrievedChunk {
  return {
    documentId: '11111111-1111-4111-8111-111111111201',
    versionId,
    matterId,
    chunkId: '11111111-1111-4111-8111-111111111301',
    parentChunkId: null,
    chunkOrdinal: 0,
    tokenCount: 10,
    score: 0.9,
    redactedText: 'redacted and authorized context only',
    textHash: sourceHash,
    sourceTextHash: sourceHash,
    ...input,
  };
}

function readyRetrieval(chunks: AiRetrievedChunk[]): AiRetrievalResult {
  return {
    status: 'ready',
    questionKind: 'retrieval',
    chunks,
    omittedChunkIds: [],
    appliedRules: [
      'question.retrieval:supported',
      'matter.membership:required',
      'retrieval.hybrid:query_stage_scope',
    ],
  };
}

describe('AiEvidencePackBuilder', () => {
  it('builds R6 degraded evidence packs from scoped authorized chunks only', () => {
    const builder = new AiEvidencePackBuilder(
      new AiContextRanker(),
      new AiContextWindowManager(),
    );
    const lowerScoreChunk = chunk({
      documentId: '11111111-1111-4111-8111-111111111203',
      chunkId: '11111111-1111-4111-8111-111111111303',
      score: 0.7,
      redactedText: 'later authorized context',
    });
    const higherScoreChunk = {
      ...chunk({
        documentId: '11111111-1111-4111-8111-111111111202',
        chunkId: '11111111-1111-4111-8111-111111111302',
        score: 0.95,
        redactedText: 'safe context with [REDACTED:email_address]',
      }),
      title: 'privileged title leakage',
      snippet: 'snippet leakage',
      metadata: { secret: 'metadata leakage' },
      chunkText: 'raw lawyer@example.test body leakage',
    };

    const pack = builder.build({
      tenantId,
      matterId,
      userQuestion: '계약 해지 조항을 요약해줘',
      retrieval: readyRetrieval([lowerScoreChunk, higherScoreChunk]),
      tokenBudget: 20,
      taskType: 'summary',
    });

    expect(pack.graphFacts).toEqual([]);
    expect(pack.ruleFindings).toEqual([]);
    expect(pack.retrievedChunks.map((item) => item.chunkId)).toEqual([
      '11111111-1111-4111-8111-111111111302',
      '11111111-1111-4111-8111-111111111303',
    ]);
    expect(pack.citationRequirements.sourceRefs).toEqual([
      'chunk:11111111-1111-4111-8111-111111111302',
      'chunk:11111111-1111-4111-8111-111111111303',
    ]);
    const serialized = JSON.stringify(pack);
    expect(serialized).not.toContain('privileged title leakage');
    expect(serialized).not.toContain('snippet leakage');
    expect(serialized).not.toContain('metadata leakage');
    expect(serialized).not.toContain('lawyer@example.test');
    expect(pack.retrievedChunks[0]?.redactedText).toContain('[REDACTED:email_address]');
  });

  it('fails closed when retrieval was not query-stage permission scoped', () => {
    const builder = new AiEvidencePackBuilder(
      new AiContextRanker(),
      new AiContextWindowManager(),
    );

    expect(() =>
      builder.build({
        tenantId,
        matterId,
        userQuestion: 'summarize',
        retrieval: {
          ...readyRetrieval([chunk({})]),
          appliedRules: ['question.retrieval:supported'],
        },
      }),
    ).toThrow(ForbiddenException);
  });

  it('includes R7 graph facts only as bounded ID relationships', () => {
    const builder = new AiEvidencePackBuilder(
      new AiContextRanker(),
      new AiContextWindowManager(),
    );

    const pack = builder.build({
      tenantId,
      matterId,
      userQuestion: 'show graph context',
      retrieval: readyRetrieval([chunk({})]),
      graphFacts: [
        {
          edgeId: '11111111-1111-4111-8111-111111111401',
          edgeType: 'HAS_DOCUMENT',
          matterId,
          documentId: '11111111-1111-4111-8111-111111111201',
          sourceHash,
          source: {
            nodeId: '11111111-1111-4111-8111-111111111402',
            nodeType: 'matter',
            sourceId: matterId,
            matterId,
            documentId: null,
            versionId: null,
          },
          target: {
            nodeId: '11111111-1111-4111-8111-111111111403',
            nodeType: 'document',
            sourceId: '11111111-1111-4111-8111-111111111201',
            matterId,
            documentId: '11111111-1111-4111-8111-111111111201',
            versionId: null,
          },
        },
      ],
    });

    expect(pack.graphFacts).toEqual([
      {
        edgeId: '11111111-1111-4111-8111-111111111401',
        edgeType: 'HAS_DOCUMENT',
        matterId,
        documentId: '11111111-1111-4111-8111-111111111201',
        sourceNodeId: '11111111-1111-4111-8111-111111111402',
        sourceNodeType: 'matter',
        targetNodeId: '11111111-1111-4111-8111-111111111403',
        targetNodeType: 'document',
        sourceHash,
      },
    ]);
    expect(JSON.stringify(pack.graphFacts)).not.toMatch(/body|snippet|raw|content|text/u);
    expect(pack.ruleFindings).toEqual([]);
  });

  it('includes R8 rule findings only as rule output references', () => {
    const builder = new AiEvidencePackBuilder(
      new AiContextRanker(),
      new AiContextWindowManager(),
    );

    const pack = builder.build({
      tenantId,
      matterId,
      userQuestion: 'show contract rule context',
      retrieval: readyRetrieval([chunk({})]),
      ruleFindings: [
        {
          findingId: sourceHash,
          matterId,
          documentId: '11111111-1111-4111-8111-111111111201',
          versionId,
          clauseId: '11111111-1111-4111-8111-111111111501',
          ruleId: '11111111-1111-4111-8111-111111111502',
          ruleKey: 'nda.section.required',
          ruleVersion: 1,
          severity: 'critical',
          status: 'pass',
          findingCode: 'required_clause.section.pass',
          findingHash: sourceHash,
          evidenceRefs: ['clause:11111111-1111-4111-8111-111111111501'],
        },
      ],
    });

    expect(pack.ruleFindings).toHaveLength(1);
    expect(pack.ruleFindings[0]?.evidenceRefs).toEqual([
      'clause:11111111-1111-4111-8111-111111111501',
    ]);
    expect(JSON.stringify(pack.ruleFindings)).not.toMatch(/body|snippet|raw|content|text/u);
  });
});
