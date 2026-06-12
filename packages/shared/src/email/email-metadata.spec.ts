import { describe, expect, it } from 'vitest';
import { normalizeEmailMetadata } from './email-metadata';

describe('normalizeEmailMetadata', () => {
  it('extracts bounded headers, participants, references, and dates without body text', () => {
    const metadata = normalizeEmailMetadata(
      [
        'From: "Alpha Sender" <sender@amic.test>',
        'To: Beta User <beta@outside.test>, bare@amic.test',
        'Cc: Gamma <gamma@outside.test>',
        'Message-ID: <case-001@example.test>',
        'References: <thread-001@example.test> <thread-002@example.test>',
        'Date: Fri, 12 Jun 2026 10:15:30 +0900',
        'Received: by mx.example.test; Fri, 12 Jun 2026 10:15:35 +0900',
        'Subject: ' + 'A'.repeat(600),
        '',
        'body must not be returned',
      ].join('\r\n'),
      { tenantDomains: ['amic.test'] },
    );

    expect(metadata.subject).toHaveLength(500);
    expect(metadata.normalizedMessageId).toBe('case-001@example.test');
    expect(metadata.normalizedReferenceIds).toEqual([
      'thread-001@example.test',
      'thread-002@example.test',
    ]);
    expect(metadata.sentAt).toBe('2026-06-12T01:15:30.000Z');
    expect(metadata.receivedAt).toBe('2026-06-12T01:15:35.000Z');
    expect(metadata.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'from',
          normalizedAddress: 'sender@amic.test',
          domainRef: 'amic.test',
          displayName: 'Alpha Sender',
          isOutside: false,
        }),
        expect.objectContaining({
          role: 'to',
          normalizedAddress: 'beta@outside.test',
          domainRef: 'outside.test',
          displayName: 'Beta User',
          isOutside: true,
        }),
      ]),
    );
    expect(metadata.hasOutsideParticipants).toBe(true);
    expect(JSON.stringify(metadata)).not.toContain('body must not be returned');
  });

  it('fails closed to null dates and a parser warning for malformed date headers', () => {
    const metadata = normalizeEmailMetadata(
      [
        'From: sender@amic.test',
        'Message-ID: <case-002@example.test>',
        'Date: not a real date',
        '',
        'body',
      ].join('\r\n'),
      { tenantDomains: ['amic.test'] },
    );

    expect(metadata.sentAt).toBeNull();
    expect(metadata.receivedAt).toBeNull();
    expect(metadata.warningCode).toBe('MALFORMED_DATE');
  });
});
