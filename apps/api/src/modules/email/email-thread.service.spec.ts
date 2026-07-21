import { describe, expect, it } from 'vitest';
import { EmailThreadService, type EmailThreadEnvelope } from './email-thread.service';

const hashes = {
  a: 'a'.repeat(64),
  b: 'b'.repeat(64),
  c: 'c'.repeat(64),
  d: 'd'.repeat(64),
  e: 'e'.repeat(64),
  f: 'f'.repeat(64),
  conversation: '1'.repeat(64),
};

function assign(envelopes: readonly EmailThreadEnvelope[]) {
  return new EmailThreadService().assignThreads(envelopes);
}

describe('EmailThreadService', () => {
  it('assigns a three-message reply chain to one thread', () => {
    const result = assign([
      { emailId: 'email-a', messageIdHash: hashes.a },
      { emailId: 'email-b', messageIdHash: hashes.b, referenceHashes: [hashes.a] },
      { emailId: 'email-c', messageIdHash: hashes.c, referenceHashes: [hashes.a, hashes.b] },
    ]);

    expect(new Set(result.map((item) => item.threadKey)).size).toBe(1);
    expect(result[0]).toMatchObject({
      rootMessageHash: hashes.a,
      memberEmailIds: ['email-a', 'email-b', 'email-c'],
      relatedEmailCount: 2,
    });
  });

  it('merges two existing threads when a bridge message references both roots', () => {
    const result = assign([
      { emailId: 'email-a', messageIdHash: hashes.a },
      { emailId: 'email-d', messageIdHash: hashes.d },
      { emailId: 'email-f', messageIdHash: hashes.f, referenceHashes: [hashes.a, hashes.d] },
    ]);

    expect(new Set(result.map((item) => item.threadKey)).size).toBe(1);
    expect(result[0]?.memberEmailIds).toEqual(['email-a', 'email-d', 'email-f']);
  });

  it('keeps unrelated messages without references in separate threads', () => {
    const result = assign([
      { emailId: 'email-a', messageIdHash: hashes.a },
      { emailId: 'email-d', messageIdHash: hashes.d },
    ]);

    expect(new Set(result.map((item) => item.threadKey)).size).toBe(2);
    expect(result.map((item) => item.relatedEmailCount)).toEqual([0, 0]);
  });

  it('merges Outlook-origin messages with conversationIdHash only', () => {
    const result = assign([
      { emailId: 'email-a', messageIdHash: hashes.a, conversationIdHash: hashes.conversation },
      { emailId: 'email-e', messageIdHash: hashes.e, conversationIdHash: hashes.conversation },
    ]);

    expect(new Set(result.map((item) => item.threadKey)).size).toBe(1);
    expect(result[0]).toMatchObject({
      conversationIdHash: hashes.conversation,
      memberEmailIds: ['email-a', 'email-e'],
      relatedEmailCount: 1,
    });
  });
});
