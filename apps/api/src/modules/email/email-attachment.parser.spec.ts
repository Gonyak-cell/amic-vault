import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { extractEmlAttachments } from './email-attachment.parser';

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('extractEmlAttachments', () => {
  it('extracts bounded attachment metadata and decodes bytes without raw body fields', () => {
    const pdf = Buffer.from('%PDF-1.7\nAMIC attachment\n%%EOF\n');
    const raw = [
      'Message-ID: <case-attachment@example.test>',
      'Content-Type: multipart/mixed; boundary="amic-boundary"',
      '',
      '--amic-boundary',
      'Content-Type: text/plain',
      '',
      'body text is not an attachment',
      '--amic-boundary',
      'Content-Type: application/pdf; name="../unsafe contract?.pdf"',
      'Content-Disposition: attachment; filename="../unsafe contract?.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      pdf.toString('base64'),
      '--amic-boundary--',
      '',
    ].join('\r\n');

    const attachments = extractEmlAttachments(raw);

    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      attachmentIndex: 0,
      originalFilename: 'unsafe contract_.pdf',
      normalizedFilename: 'unsafe contract_.pdf',
      contentType: 'application/pdf',
      mediaHint: 'application/pdf',
      sizeBytes: pdf.length,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(attachments[0]?.body.equals(pdf)).toBe(true);
    expect(JSON.stringify(attachments[0])).not.toContain('body text is not an attachment');
  });

  it('walks nested multipart related parts and excludes inline cid images', () => {
    const pdf = Buffer.from('%PDF-1.7\nnested attachment\n%%EOF\n');
    const inlineImage = Buffer.from('inline image bytes');
    const raw = [
      'Message-ID: <nested@example.test>',
      'Content-Type: multipart/mixed; boundary="outer"',
      '',
      '--outer',
      'Content-Type: multipart/related; boundary="related"',
      '',
      '--related',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<img src="cid:inline-1">',
      '--related',
      'Content-Type: image/png; name="inline.png"',
      'Content-Disposition: inline; filename="inline.png"',
      'Content-ID: <inline-1>',
      'Content-Transfer-Encoding: base64',
      '',
      inlineImage.toString('base64'),
      '--related',
      'Content-Type: application/pdf; name="nested.pdf"',
      'Content-Disposition: attachment; filename="nested.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      pdf.toString('base64'),
      '--related--',
      '--outer--',
      '',
    ].join('\r\n');

    const attachments = extractEmlAttachments(raw);

    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      attachmentIndex: 0,
      normalizedFilename: 'nested.pdf',
      contentType: 'application/pdf',
      sizeBytes: pdf.length,
      sha256: sha256Hex(pdf),
    });
    expect(attachments[0]?.body.equals(pdf)).toBe(true);
  });

  it('decodes quoted-printable attachment bytes without charset conversion', () => {
    const raw = [
      'Message-ID: <qp-attachment@example.test>',
      'Content-Type: multipart/mixed; boundary="outer"',
      '',
      '--outer',
      'Content-Type: text/plain; charset=euc-kr; name="notes.txt"',
      'Content-Disposition: attachment; filename="notes.txt"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '=C7=D1=B1=DB',
      '--outer--',
      '',
    ].join('\r\n');

    const attachments = extractEmlAttachments(raw);

    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      charset: 'euc-kr',
      normalizedFilename: 'notes.txt',
      sha256: sha256Hex(Buffer.from([0xc7, 0xd1, 0xb1, 0xdb])),
    });
    expect([...attachments[0]?.body ?? []]).toEqual([0xc7, 0xd1, 0xb1, 0xdb]);
  });

  it('separates embedded message/rfc822 parts as eml attachments', () => {
    const embedded = [
      'Message-ID: <forwarded@example.test>',
      'Subject: Forwarded matter evidence',
      '',
      'Forwarded body',
    ].join('\r\n');
    const raw = [
      'Message-ID: <outer-forward@example.test>',
      'Content-Type: multipart/mixed; boundary="outer"',
      '',
      '--outer',
      'Content-Type: text/plain',
      '',
      'forward wrapper',
      '--outer',
      'Content-Type: message/rfc822',
      'Content-Disposition: attachment',
      '',
      embedded,
      '--outer--',
      '',
    ].join('\r\n');

    const attachments = extractEmlAttachments(raw);

    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      normalizedFilename: 'embedded-message-0.eml',
      contentType: 'message/rfc822',
    });
    expect(attachments[0]?.body.toString('utf8')).toContain('Forwarded matter evidence');
  });

  it('walks a three-level multipart tree in document order', () => {
    const first = Buffer.from('first attachment');
    const second = Buffer.from('second attachment');
    const raw = [
      'Message-ID: <deep@example.test>',
      'Content-Type: multipart/mixed; boundary="outer"',
      '',
      '--outer',
      'Content-Type: multipart/related; boundary="middle"',
      '',
      '--middle',
      'Content-Type: multipart/alternative; boundary="inner"',
      '',
      '--inner',
      'Content-Type: text/plain',
      '',
      'body',
      '--inner--',
      '--middle',
      'Content-Type: application/pdf; name="first.pdf"',
      'Content-Disposition: attachment; filename="first.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      first.toString('base64'),
      '--middle--',
      '--outer',
      'Content-Type: text/plain; name="second.txt"',
      'Content-Disposition: attachment; filename="second.txt"',
      '',
      second.toString('latin1'),
      '--outer--',
      '',
    ].join('\r\n');

    const attachments = extractEmlAttachments(raw);

    expect(attachments.map((attachment) => attachment.normalizedFilename)).toEqual([
      'first.pdf',
      'second.txt',
    ]);
    expect(attachments[0]?.body.equals(first)).toBe(true);
    expect(attachments[1]?.body.equals(second)).toBe(true);
  });
});
