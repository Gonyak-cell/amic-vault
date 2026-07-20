import { describe, expect, it } from 'vitest';
import { buildMatterTimelinePayload } from './matter-timeline.builder';

const chunkA = 'chunk:11111111-1111-4111-8111-111111111111';
const chunkB = 'chunk:11111111-1111-4111-8111-111111111112';
const chunkC = 'chunk:11111111-1111-4111-8111-111111111113';

describe('MatterTimelineBuilder', () => {
  it('sorts dated facts, merges duplicate events, and preserves citations', () => {
    const built = buildMatterTimelinePayload([
      dateFactsArtifact({
        artifactId: '11111111-1111-4111-8111-111111111201',
        documentId: '11111111-1111-4111-8111-111111111301',
        versionId: '11111111-1111-4111-8111-111111111401',
        text: '2026-03-10 계약서 초안 수령',
        sourceRefs: [chunkA],
      }),
      dateFactsArtifact({
        artifactId: '11111111-1111-4111-8111-111111111202',
        documentId: '11111111-1111-4111-8111-111111111302',
        versionId: '11111111-1111-4111-8111-111111111402',
        text: '2026-01-05 LOI 체결',
        sourceRefs: [chunkB],
      }),
      dateFactsArtifact({
        artifactId: '11111111-1111-4111-8111-111111111203',
        documentId: '11111111-1111-4111-8111-111111111303',
        versionId: '11111111-1111-4111-8111-111111111403',
        text: '2026-03-10 계약서 초안 수령',
        sourceRefs: [chunkC],
      }),
    ]);

    expect(built?.items.map((item) => item.date)).toEqual(['2026-01-05', '2026-03-10']);
    expect(built?.items[1]?.citationRefs).toEqual([chunkA, chunkC]);
    expect(built?.payload.claims).toHaveLength(2);
    expect(built?.payload.claims[0]).toMatchObject({
      kind: 'timeline',
      source_refs: [chunkB],
    });
    expect(JSON.stringify(built)).not.toMatch(/raw|prompt|response|source text/u);
  });
});

function dateFactsArtifact(input: {
  artifactId: string;
  documentId: string;
  versionId: string;
  text: string;
  sourceRefs: string[];
}) {
  return {
    artifactId: input.artifactId,
    documentId: input.documentId,
    versionId: input.versionId,
    payload: {
      answer: input.text,
      sections: [
        {
          section_id: 'date',
          heading: '날짜',
          text: input.text,
          source_refs: input.sourceRefs,
        },
      ],
      claims: [
        {
          claim_id: `claim-${input.artifactId.slice(-4)}`,
          kind: 'timeline',
          text: input.text,
          source_refs: input.sourceRefs,
          is_legal_conclusion: false,
        },
      ],
      source_refs: input.sourceRefs,
    },
  };
}
