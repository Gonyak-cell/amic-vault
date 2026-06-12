import { describe, expect, it } from 'vitest';
import { EmlParseError, parseEmlEnvelope, parseEmlHeaders } from './eml-parser';

describe('parseEmlEnvelope', () => {
  it('normalizes Message-ID deterministically without returning body text', () => {
    const parsed = parseEmlEnvelope(
      [
        'From: Sender <sender@example.test>',
        'Message-ID: <Case.123@Example.TEST>',
        'Subject: Privileged Fixture',
        '',
        'This body must not be surfaced by the envelope parser.',
      ].join('\r\n'),
    );

    expect(parsed).toEqual({ normalizedMessageId: 'case.123@example.test' });
    expect(JSON.stringify(parsed)).not.toContain('This body must not be surfaced');
  });

  it('handles folded Message-ID headers', () => {
    const parsed = parseEmlEnvelope('Message-ID:\r\n\t<folded.id@example.test>\r\n\r\nbody');

    expect(parsed.normalizedMessageId).toBe('folded.id@example.test');
  });

  it('fails closed when Message-ID is absent', () => {
    expect(() => parseEmlEnvelope('Subject: Missing\r\n\r\nbody')).toThrow(EmlParseError);
  });

  it('parses unfolded headers without body text', () => {
    const headers = parseEmlHeaders('Subject: Alpha\r\n\tBeta\r\n\r\nbody text');

    expect(headers).toEqual([{ name: 'subject', value: 'Alpha Beta' }]);
    expect(JSON.stringify(headers)).not.toContain('body text');
  });
});
