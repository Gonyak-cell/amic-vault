import { describe, expect, it } from 'vitest';
import {
  acceptExternalNdaRequestSchema,
  createExternalAnswerRequestSchema,
  createExternalLinkRequestSchema,
  createExternalQuestionRequestSchema,
  createExternalUserRequestSchema,
  createExternalWorkspaceRequestSchema,
  externalAccessManifestSchema,
  externalDownloadTicketSchema,
  externalQaListResponseSchema,
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
        dlpWarningAccepted: true,
        dlpOverrideReasonCode: 'CLIENT_APPROVED',
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
    expect(
      externalDownloadTicketSchema.parse({
        status: 'ready',
        workspaceId: uuid,
        externalUserId: uuid,
        documentId: uuid,
        versionId: null,
        expiresAt: '2026-07-01T00:00:00.000Z',
        watermarkApplied: true,
        watermarkRef: `watermark:${uuid}:${uuid}`,
        downloadRef: `download:${uuid}:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
      }).downloadRef,
    ).toContain('download:');
    const question = createExternalQuestionRequestSchema.parse({ messageText: 'Please clarify item 3.' });
    const answer = createExternalAnswerRequestSchema.parse({ messageText: 'Item 3 is bounded.' });
    expect(question.messageText).toBe('Please clarify item 3.');
    expect(answer.messageText).toBe('Item 3 is bounded.');
    expect(
      externalQaListResponseSchema.parse({
        messages: [
          {
            messageId: uuid,
            workspaceId: uuid,
            linkId: uuid,
            externalUserId: uuid,
            parentMessageId: null,
            direction: 'external_question',
            messageText: question.messageText,
            messageHash: hash,
            createdAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      }).messages,
    ).toHaveLength(1);
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
    expect(() =>
      createExternalQuestionRequestSchema.parse({
        messageText: 'Please include the token in this thread.',
      }),
    ).toThrow();
    expect(() =>
      createExternalLinkRequestSchema.parse({
        workspaceId: uuid,
        externalUserId: uuid,
        documentId: uuid,
        expiresAt: '2026-07-01T00:00:00.000Z',
        dlpOverrideReasonCode: 'CLIENT_APPROVED',
      }),
    ).toThrow();
  });
});
