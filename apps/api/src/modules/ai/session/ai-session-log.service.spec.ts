import { describe, expect, it } from 'vitest';
import { aiSessionChunkLogSchema, aiSessionCreateSchema } from '@amic-vault/shared';
import { normalizeAiSessionPayloadRisk } from './ai-session-log.service';

const id = '11111111-1111-4111-8111-111111111111';
const hash = '0'.repeat(64);

describe('AiSessionLogService contracts', () => {
  it('does not accept prompt or response raw text at service boundary', () => {
    expect(() =>
      aiSessionCreateSchema.parse({
        matterId: id,
        modelRoute: 'local_gemma',
        promptHash: hash,
        promptLength: 20,
        prompt: 'raw prompt',
      }),
    ).toThrow();
  });

  it('requires excluded retrieved chunks to use reason codes instead of snippets', () => {
    expect(
      aiSessionChunkLogSchema.parse({
        documentId: id,
        versionId: id,
        chunkId: id,
        included: false,
        reasonCode: 'ethical_wall_blocked',
        quoteHash: hash,
        sourceTextHash: '1'.repeat(64),
      }),
    ).toMatchObject({ reasonCode: 'ethical_wall_blocked' });

    expect(() =>
      aiSessionChunkLogSchema.parse({
        documentId: id,
        versionId: id,
        chunkId: id,
        included: false,
        reasonCode: 'included',
        quoteHash: hash,
        sourceTextHash: '1'.repeat(64),
        snippet: 'forbidden text',
      }),
    ).toThrow();
  });

  it('maps DLP finding count onto payload risk state', () => {
    expect(normalizeAiSessionPayloadRisk({ dlpFindingCount: 2 })).toEqual({
      dlpFindingCount: 2,
      riskFlag: true,
    });
    expect(normalizeAiSessionPayloadRisk({ dlpFindingCount: 0 })).toEqual({
      dlpFindingCount: 0,
      riskFlag: false,
    });
    expect(
      normalizeAiSessionPayloadRisk({ dlpFindingCount: 0, riskFlag: true }),
    ).toEqual({
      dlpFindingCount: 0,
      riskFlag: true,
    });
  });
});
