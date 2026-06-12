import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AiSessionDetailDto } from '@amic-vault/shared';
import { AiSessionDetail } from './ai-session-detail';

const hash = '0'.repeat(64);

describe('AiSessionDetail', () => {
  it('renders hashes and source refs without raw prompt or response body', () => {
    const html = renderToStaticMarkup(
      <AiSessionDetail
        session={
          {
            sessionId: '11111111-1111-4111-8111-111111111111',
            matterId: '11111111-1111-4111-8111-111111111112',
            ownerUserId: '11111111-1111-4111-8111-111111111113',
            authSessionId: null,
            modelRoute: 'local_gemma',
            status: 'responded',
            promptHash: hash,
            promptLength: 12,
            responseHash: '1'.repeat(64),
            responseLength: 24,
            responseTokenCount: 6,
            latencyMs: 10,
            escalationRequired: false,
            blockedReason: null,
            hiddenSourceCount: 1,
            createdAt: '2026-06-12T00:00:00.000Z',
            updatedAt: '2026-06-12T00:00:00.000Z',
            chunks: [
              {
                documentId: '11111111-1111-4111-8111-111111111114',
                versionId: '11111111-1111-4111-8111-111111111115',
                chunkId: '11111111-1111-4111-8111-111111111116',
                included: true,
                reasonCode: 'included',
                rankIndex: 0,
                score: 1,
                quoteHash: hash,
                sourceTextHash: '2'.repeat(64),
              },
            ],
          } satisfies AiSessionDetailDto
        }
      />,
    );

    expect(html).toContain(hash);
    expect(html).toContain('hidden: 1');
    expect(html).not.toContain('raw prompt');
    expect(html).not.toContain('raw response');
  });
});
