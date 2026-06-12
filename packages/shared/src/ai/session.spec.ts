import { describe, expect, it } from 'vitest';
import {
  aiSessionChunkLogSchema,
  aiSessionCreateSchema,
  aiSessionDetailSchema,
  aiSessionResponseLogSchema,
} from './session';

const id = '11111111-1111-4111-8111-111111111111';
const hash = '0'.repeat(64);

describe('AI session schemas', () => {
  it('accepts hashes and bounded metrics without raw prompt or response text', () => {
    expect(
      aiSessionCreateSchema.parse({
        matterId: id,
        modelRoute: 'local_gemma',
        promptHash: hash,
        promptLength: 128,
      }),
    ).toMatchObject({ promptHash: hash });

    expect(
      aiSessionResponseLogSchema.parse({
        responseHash: '1'.repeat(64),
        responseLength: 256,
        responseTokenCount: 64,
        latencyMs: 120,
      }),
    ).toMatchObject({ responseHash: '1'.repeat(64) });

    expect(() =>
      aiSessionCreateSchema.parse({
        matterId: id,
        modelRoute: 'local_gemma',
        promptHash: hash,
        promptLength: 128,
        promptText: 'raw prompt must not be accepted',
      }),
    ).toThrow();
    expect(() =>
      aiSessionResponseLogSchema.parse({
        responseHash: '1'.repeat(64),
        responseLength: 256,
        responseText: 'raw response must not be accepted',
      }),
    ).toThrow();
  });

  it('logs retrieved chunks as ids, hashes, and reason codes only', () => {
    const parsed = aiSessionChunkLogSchema.parse({
      documentId: id,
      versionId: id,
      chunkId: id,
      included: false,
      reasonCode: 'permission_denied',
      rankIndex: null,
      score: null,
      quoteHash: hash,
      sourceTextHash: '2'.repeat(64),
    });

    expect(parsed.reasonCode).toBe('permission_denied');
    expect(JSON.stringify(parsed)).not.toContain('chunk text');
    expect(() =>
      aiSessionChunkLogSchema.parse({
        ...parsed,
        included: true,
        reasonCode: 'permission_denied',
      }),
    ).toThrow();
  });

  it('details expose hashes and visible chunk refs without raw body fields', () => {
    const detail = aiSessionDetailSchema.parse({
      sessionId: id,
      matterId: id,
      ownerUserId: id,
      authSessionId: null,
      modelRoute: 'local_gemma',
      status: 'responded',
      promptHash: hash,
      promptLength: 10,
      responseHash: '1'.repeat(64),
      responseLength: 20,
      responseTokenCount: 8,
      latencyMs: 30,
      escalationRequired: false,
      blockedReason: null,
      chunks: [],
      hiddenSourceCount: 0,
      createdAt: '2026-06-12T00:00:00.000Z',
      updatedAt: '2026-06-12T00:00:00.000Z',
    });

    expect(detail.promptHash).toBe(hash);
    expect(JSON.stringify(detail)).not.toContain('raw body');
  });
});
