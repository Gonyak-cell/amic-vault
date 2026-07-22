import { describe, expect, it } from 'vitest';
import {
  createPreviewSessionRequestSchema,
  createPreviewSessionResponseSchema,
} from './preview-session.dto';

describe('preview session DTO schemas', () => {
  const previewSessionToken = 'dGhpcy1pcy1hLXRlc3QtcHJldmlldy1zZXNzaW9uLXRva2VuXzEyMw';

  it('accepts an empty issue request only', () => {
    expect(createPreviewSessionRequestSchema.parse({})).toEqual({});
    expect(() => createPreviewSessionRequestSchema.parse({ range: 'bytes=0-1' })).toThrow();
  });

  it('returns a bounded opaque token once with an ISO expiry', () => {
    expect(
      createPreviewSessionResponseSchema.parse({
        previewSessionToken,
        expiresAt: '2026-07-22T00:05:00.000Z',
      }),
    ).toEqual({
      previewSessionToken,
      expiresAt: '2026-07-22T00:05:00.000Z',
    });
  });

  it('rejects query/range fields and non-opaque token values', () => {
    expect(() =>
      createPreviewSessionResponseSchema.parse({
        previewSessionToken: 'not-a-valid-token',
        expiresAt: '2026-07-22T00:05:00.000Z',
      }),
    ).toThrow();
    expect(() =>
      createPreviewSessionResponseSchema.parse({
        previewSessionToken,
        expiresAt: '2026-07-22T00:05:00.000Z',
        previewUrl: '/v1/documents/id/preview?token=forbidden',
      }),
    ).toThrow();
  });
});
