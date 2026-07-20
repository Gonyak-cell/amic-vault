import { describe, expect, it } from 'vitest';
import { buildMinutesQcReport } from './minutes-qc.builder';
import type { MatterTimelineDateFactArtifact } from './matter-timeline.builder';

const meetingChunkId = '11111111-1111-4111-8111-111111111201';
const timelineChunkId = '11111111-1111-4111-8111-111111111202';
const targetDocumentId = '11111111-1111-4111-8111-111111111203';
const targetVersionId = '11111111-1111-4111-8111-111111111204';
const timelineDocumentId = '11111111-1111-4111-8111-111111111205';
const timelineVersionId = '11111111-1111-4111-8111-111111111206';

function dateFactsPayload(input: { date: string; detail: string; sourceRef: string }) {
  return {
    answer: '날짜 사실',
    sections: [
      {
        section_id: 'dates',
        heading: '날짜',
        text: `${input.date} ${input.detail}`,
        source_refs: [input.sourceRef],
      },
    ],
    claims: [
      {
        claim_id: 'date-1',
        kind: 'timeline',
        text: `${input.date} ${input.detail}`,
        source_refs: [input.sourceRef],
        is_legal_conclusion: false,
      },
    ],
    source_refs: [input.sourceRef],
  };
}

function timelineArtifact(input: {
  date: string;
  detail: string;
  sourceRef: string;
}): MatterTimelineDateFactArtifact {
  return {
    artifactId: '11111111-1111-4111-8111-111111111207',
    documentId: timelineDocumentId,
    versionId: timelineVersionId,
    payload: {
      answer: 'Matter timeline contains 1 cited dated fact.',
      sections: [
        {
          section_id: 'timeline-1',
          heading: input.detail,
          text: `${input.date} ${input.detail}`,
          source_refs: [input.sourceRef],
        },
      ],
      claims: [
        {
          claim_id: 'timeline-1',
          kind: 'timeline',
          text: `${input.date} ${input.detail}`,
          source_refs: [input.sourceRef],
          is_legal_conclusion: false,
        },
      ],
      source_refs: [input.sourceRef],
    },
  };
}

describe('buildMinutesQcReport', () => {
  it('reports a meeting-minutes date mismatch with both citation sides', () => {
    const report = buildMinutesQcReport({
      target: {
        documentId: targetDocumentId,
        versionId: targetVersionId,
        payload: dateFactsPayload({
          date: '2026-06-16',
          detail: '계약 체결',
          sourceRef: `chunk:${meetingChunkId}`,
        }),
      },
      timelineArtifacts: [
        timelineArtifact({
          date: '2026-06-15',
          detail: '계약 체결',
          sourceRef: `chunk:${timelineChunkId}`,
        }),
      ],
    });

    expect(report?.inconsistencies).toHaveLength(1);
    expect(report?.inconsistencies[0]).toEqual(
      expect.objectContaining({
        kind: 'date_mismatch',
        meetingDate: '2026-06-16',
        timelineDate: '2026-06-15',
        meetingCitationRefs: [`chunk:${meetingChunkId}`],
        timelineCitationRefs: [`chunk:${timelineChunkId}`],
      }),
    );
    expect(report?.payload.claims[0]?.source_refs).toEqual([
      `chunk:${meetingChunkId}`,
      `chunk:${timelineChunkId}`,
    ]);
  });

  it('returns an empty inconsistency report when meeting dates match the timeline', () => {
    const report = buildMinutesQcReport({
      target: {
        documentId: targetDocumentId,
        versionId: targetVersionId,
        payload: dateFactsPayload({
          date: '2026-06-15',
          detail: '계약 체결',
          sourceRef: `chunk:${meetingChunkId}`,
        }),
      },
      timelineArtifacts: [
        timelineArtifact({
          date: '2026-06-15',
          detail: '계약 체결',
          sourceRef: `chunk:${timelineChunkId}`,
        }),
      ],
    });

    expect(report?.inconsistencies).toEqual([]);
    expect(report?.payload.answer).toContain('날짜 불일치를 찾지 못했습니다');
  });
});
