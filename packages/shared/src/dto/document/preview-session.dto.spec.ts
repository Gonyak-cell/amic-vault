import { describe, expect, it } from 'vitest';
import { previewAccessSessionSchema } from './preview-session.dto';

describe('previewAccessSessionSchema', () => {
  const valid = {
    previewSessionId: '11111111-1111-4111-8111-111111111111',
    expiresAt: '2026-07-22T00:05:00.000Z',
    token: '1234567890123456789012345678901234567890123',
  };

  it('accepts only a bounded opaque session response', () => {
    expect(previewAccessSessionSchema.parse(valid)).toEqual(valid);
  });

  it('rejects raw document context and malformed tokens', () => {
    expect(() => previewAccessSessionSchema.parse({ ...valid, documentId: valid.previewSessionId })).toThrow();
    expect(() => previewAccessSessionSchema.parse({ ...valid, token: 'raw token' })).toThrow();
  });
});
