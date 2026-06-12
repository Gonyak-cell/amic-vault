import { describe, expect, it } from 'vitest';
import { extractEmlAttachments } from './email-attachment.parser';

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
});
