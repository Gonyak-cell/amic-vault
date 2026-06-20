import { describe, expect, it } from 'vitest';
import {
  createUploadPreflightRequestSchema,
  uploadPreflightResponseSchema,
} from './upload-preflight.dto';

describe('upload preflight DTO schemas', () => {
  it('accepts an empty request body for route-scoped Matter preflight', () => {
    expect(createUploadPreflightRequestSchema.parse({})).toEqual({});
    expect(() => createUploadPreflightRequestSchema.parse({ matterId: 'raw-ref' })).toThrow();
  });

  it('validates reference-only upload preflight receipts', () => {
    expect(
      uploadPreflightResponseSchema.parse({
        matterReference: '11111111-1111-4111-8111-111111111111',
        preflightRef: 'upf_2026_ref',
        expiresAt: '2026-06-20T00:05:00.000Z',
        sourceMode: 'matter_app_api',
        sourceUpdatedAt: null,
        sourceRevision: 'source-rev-1',
        permissionDecisionRef: 'matter-upload:decision-ref',
        uploadEligible: true,
        blockedReason: null,
      }),
    ).toMatchObject({
      sourceMode: 'matter_app_api',
      uploadEligible: true,
    });
  });
});
