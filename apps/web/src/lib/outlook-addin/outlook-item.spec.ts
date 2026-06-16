import { createHash } from 'node:crypto';
import {
  buildCreateFilingRequest,
  buildMatterSuggestionQuery,
  buildOutlookItemSnapshot,
  formatBytes,
} from './outlook-item';
import {
  createOutlookEmailFilingRequestSchema,
  matterSuggestionQuerySchema,
} from '@amic-vault/shared';
import { describe, expect, it } from 'vitest';

const hashString = async (value: string) => createHash('sha256').update(value).digest('hex');

describe('Outlook item hashing helpers', () => {
  it('converts Office item data into hash-only filing metadata', async () => {
    const rawAttachment = {
      id: 'attachment-raw-id',
      name: 'board-minutes.pdf',
      size: 24576,
      contentType: 'application/pdf',
      isInline: false,
    };
    const snapshot = await buildOutlookItemSnapshot(
      {
        userProfile: { emailAddress: 'lawyer@amic.test' },
        item: {
          itemId: 'outlook-raw-id',
          internetMessageId: '<raw-message-id@amic.test>',
          conversationId: 'conversation-raw-id',
          subject: 'Privileged acquisition draft',
          dateTimeCreated: '2026-06-16T01:02:03.000Z',
          from: { emailAddress: 'counterparty@example.com' },
          to: [{ emailAddress: 'lawyer@amic.test' }],
          attachments: [rawAttachment],
        },
      },
      hashString,
    );

    const serialized = JSON.stringify(snapshot);
    expect(snapshot.message.mailboxFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.subjectHash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.attachmentRefs).toHaveLength(1);
    expect(snapshot.message.hasExternalParticipants).toBe(true);
    expect(serialized).not.toContain('Privileged acquisition draft');
    expect(serialized).not.toContain('lawyer@amic.test');
    expect(serialized).not.toContain('counterparty@example.com');
    expect(serialized).not.toContain('board-minutes.pdf');
    expect(serialized).not.toContain('outlook-raw-id');
    expect(serialized).not.toContain('raw-message-id');

    expect(() => matterSuggestionQuerySchema.parse(buildMatterSuggestionQuery(snapshot))).not.toThrow();
    expect(() =>
      createOutlookEmailFilingRequestSchema.parse(
        buildCreateFilingRequest(snapshot, '11111111-1111-4111-8111-111111111111'),
      ),
    ).not.toThrow();
  });

  it('fails closed when required mailbox or item identifiers are unavailable', async () => {
    await expect(
      buildOutlookItemSnapshot(
        {
          userProfile: { emailAddress: 'lawyer@amic.test' },
          item: { subject: 'No usable id' },
        },
        hashString,
      ),
    ).rejects.toThrow('OUTLOOK_ITEM_UNAVAILABLE');
  });

  it('formats attachment byte counts compactly', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
