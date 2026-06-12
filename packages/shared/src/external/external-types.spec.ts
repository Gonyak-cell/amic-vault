import { describe, expect, it } from 'vitest';
import {
  acceptExternalNdaRequestSchema,
  createExternalLinkRequestSchema,
  createExternalUserRequestSchema,
  createExternalWorkspaceRequestSchema,
  externalAccessManifestSchema,
} from './external-types';

const uuid = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);

describe('external core DTOs', () => {
  it('accepts bounded external workspace, user, link, NDA, and manifest refs', () => {
    expect(
      createExternalWorkspaceRequestSchema.parse({
        matterId: uuid,
        workspaceCode: 'EXT-R11',
        displayRef: 'Alpha clean room',
        expiresAt: '2026-07-01T00:00:00.000Z',
      }).workspaceCode,
    ).toBe('EXT-R11');
    expect(
      createExternalUserRequestSchema.parse({
        workspaceId: uuid,
        emailHash: hash,
        displayRef: 'recipient one',
      }).emailHash,
    ).toBe(hash);
    expect(
      createExternalLinkRequestSchema.parse({
        workspaceId: uuid,
        externalUserId: uuid,
        documentId: uuid,
        expiresAt: '2026-07-01T00:00:00.000Z',
      }).ndaVersion,
    ).toBe('NDA-R11-V1');
    expect(acceptExternalNdaRequestSchema.parse({ accepted: true }).accepted).toBe(true);
    expect(
      externalAccessManifestSchema.parse({
        status: 'ready',
        workspaceId: uuid,
        externalUserId: uuid,
        documentId: uuid,
        versionId: null,
        expiresAt: '2026-07-01T00:00:00.000Z',
        watermarkApplied: true,
        watermarkRef: `watermark:${uuid}:${uuid}`,
      }).watermarkApplied,
    ).toBe(true);
  });

  it('rejects raw recipient addresses and secret-like refs', () => {
    expect(() =>
      createExternalUserRequestSchema.parse({
        workspaceId: uuid,
        emailHash: hash,
        displayRef: 'person@example.com',
      }),
    ).toThrow();
    expect(() =>
      createExternalWorkspaceRequestSchema.parse({
        matterId: uuid,
        workspaceCode: 'EXT-R11',
        displayRef: 'token room',
        expiresAt: '2026-07-01T00:00:00.000Z',
      }),
    ).toThrow();
  });
});
