import { describe, expect, it } from 'vitest';
import {
  decodeEmlRawContent,
  decodeRfc2047Words,
  EmlParseError,
  extractEmlTextBody,
  parseEmlEnvelope,
  parseEmlHeaders,
} from './eml-parser';

function asciiBytes(value: string): number[] {
  return [...value].map((char) => char.charCodeAt(0));
}

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

  it('decodes RFC2047 encoded words for Korean subject headers', () => {
    expect(decodeRfc2047Words('=?UTF-8?B?6rKA7YagIOyalOyyrQ==?=')).toBe('검토 요청');
    expect(decodeRfc2047Words('=?EUC-KR?B?sMvF5CC/5MO7?=')).toBe('검토 요청');
    expect(decodeRfc2047Words('=?UTF-8?Q?=EA=B2=80=ED=86=A0_=EC=9A=94=EC=B2=AD?=')).toBe(
      '검토 요청',
    );
    expect(decodeRfc2047Words('=?UTF-8?B?6rKA7Yag?= =?UTF-8?B?IOyalOyyrQ==?=')).toBe('검토 요청');
    expect(decodeRfc2047Words('=?X-UNKNOWN?B?6rKA7Yag?=')).toBe('검토');
  });

  it('applies encoded-word decoding while parsing headers', () => {
    const headers = parseEmlHeaders(
      ['Subject: =?UTF-8?B?6rKA7Yag?=', '\t=?UTF-8?B?IOyalOyyrQ==?=', '', 'body text'].join('\r\n'),
    );

    expect(headers).toEqual([{ name: 'subject', value: '검토 요청' }]);
  });

  it('decodes raw EML text bodies by transfer encoding and charset', () => {
    const quotedPrintable = decodeEmlRawContent(
      Uint8Array.from(
        asciiBytes(
          [
            'Message-ID: <qp@example.test>',
            'Content-Type: text/plain; charset="utf-8"',
            'Content-Transfer-Encoding: quoted-printable',
            '',
            '=EA=B2=80=ED=86=A0=20=EC=9A=94=EC=B2=AD',
          ].join('\r\n'),
        ),
      ),
    );
    expect(quotedPrintable).toContain('검토 요청');

    const eucKr = decodeEmlRawContent(
      Uint8Array.from([
        ...asciiBytes(
          [
            'Message-ID: <euc-kr@example.test>',
            'Content-Type: text/plain; charset=euc-kr',
            '',
            '',
          ].join('\r\n'),
        ),
        0xc7,
        0xd1,
        0xb1,
        0xdb,
      ]),
    );
    expect(eucKr).toContain('한글');
  });

  it('extracts searchable text from multipart EML bodies without attachment text', () => {
    const raw = [
      'Message-ID: <body-search@example.test>',
      'Subject: Body search',
      'Content-Type: multipart/mixed; boundary="outer"',
      '',
      '--outer',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '=EA=B2=80=ED=86=A0 =EB=B3=B8=EB=AC=B8 =ED=86=A0=ED=81=B0',
      '--outer',
      'Content-Type: application/pdf; name="attachment.pdf"',
      'Content-Disposition: attachment; filename="attachment.pdf"',
      '',
      'attachment text must stay out of body search',
      '--outer--',
      '',
    ].join('\r\n');

    expect(extractEmlTextBody(raw)).toBe('검토 본문 토큰');
    expect(extractEmlTextBody(raw)).not.toContain('attachment text');
  });
});
