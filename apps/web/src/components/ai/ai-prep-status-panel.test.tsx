import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AiPrepDocumentStatusDto } from '@amic-vault/shared';
import { AiPrepStatusPanel } from './ai-prep-status-panel';

describe('AiPrepStatusPanel', () => {
  it('renders authorized prep output with citation refs and no raw hidden fields', () => {
    const html = renderToStaticMarkup(<AiPrepStatusPanel status={status()} />);

    expect(html).toContain('파일 정리 준비');
    expect(html).toContain('파일 개요');
    expect(html).toContain('Grounded answer.');
    expect(html).toContain('권한 확인된 근거로 생성됨');
    expect(html).not.toContain('chunk:11111111-1111-4111-8111-111111111118');
    expect(html).toContain('파일 개요 유용함 표시');
    expect(html).toContain('근거 부족 표시');
    expect(html).not.toMatch(
      /legal analysis|summary|external model|prompt|raw source|model response|hidden unauthorized/i,
    );
  });

  it('does not display stale payloads as prepared cards', () => {
    const html = renderToStaticMarkup(
      <AiPrepStatusPanel
        status={{
          ...status(),
          readinessStatus: 'stale',
          artifacts: [
            {
              ...artifact(),
              isStale: true,
              staleReason: 'permission_changed',
            },
          ],
        }}
      />,
    );

    expect(html).toContain('다시 정리해야 합니다.');
    expect(html).not.toContain('Grounded answer.');
  });

  it('does not display rejected payloads as prepared cards', () => {
    const html = renderToStaticMarkup(
      <AiPrepStatusPanel
        status={{
          ...status(),
          readinessStatus: 'rejected',
          artifacts: [
            {
              ...artifact(),
              status: 'rejected',
              generatedAt: null,
            },
          ],
        }}
      />,
    );

    expect(html).toContain('폐기된 정리 결과는 표시하지 않습니다.');
    expect(html).toContain('폐기 결과 표시');
    expect(html).not.toContain('Grounded answer.');
  });
});

function artifact(): AiPrepDocumentStatusDto['artifacts'][number] {
  return status().artifacts[0]!;
}

function status(): AiPrepDocumentStatusDto {
  const chunkId = '11111111-1111-4111-8111-111111111118';
  return {
    documentId: '11111111-1111-4111-8111-111111111114',
    versionId: '11111111-1111-4111-8111-111111111115',
    readinessStatus: 'ready',
    artifacts: [
      {
        artifactId: '11111111-1111-4111-8111-111111111116',
        artifactKind: 'document_profile',
        status: 'completed',
        isStale: false,
        staleReason: null,
        sourceChunkCount: 1,
        generatedAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
        payload: {
          answer: 'authorized prep',
          sections: [
            {
              section_id: 'brief',
              heading: 'Brief',
              text: 'Grounded answer.',
              source_refs: [`chunk:${chunkId}`],
            },
          ],
          claims: [
            {
              claim_id: 'claim-1',
              kind: 'summary',
              text: 'Grounded answer.',
              source_refs: [`chunk:${chunkId}`],
              is_legal_conclusion: false,
            },
          ],
          source_refs: [`chunk:${chunkId}`],
        },
      },
    ],
  };
}
