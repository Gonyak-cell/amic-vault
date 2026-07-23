import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { EmailWorkerParserClient, parseEmailWorkerResponse } from './email-worker-parser.client';

const tenantId = '11111111-1111-4111-8111-111111111111';

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EmailWorkerParserClient', () => {
  it('posts raw email to the ingestion worker with tenant isolation headers', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          parser: 'eml',
          parser_version: 'email-worker-v1',
          parse_status: 'parsed',
          normalized_message_id: 'worker@example.test',
          subject: '검토 요청',
          sent_at: null,
          received_at: null,
          metadata_warning_code: null,
          references: ['thread@example.test'],
          participants: [
            {
              role: 'from',
              normalized_address: 'sender@example.test',
              domain_ref: 'example.test',
              display_name: 'Sender',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new EmailWorkerParserClient().parseRawEmail({
      tenantId,
      filename: 'message.eml',
      mimeType: 'message/rfc822',
      body: Buffer.from('Message-ID: <worker@example.test>\r\n\r\nbody'),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/email/parse',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-amic-tenant-id': tenantId,
          'x-amic-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/),
          'x-amic-ingestion-nonce': expect.stringMatching(/^[0-9a-f-]{36}$/),
          'x-amic-ingestion-expires-at': expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
          ),
          'x-amic-dev-loopback-identity': 'true',
        }),
        body: expect.any(FormData),
      }),
    );
    expect(result).toMatchObject({
      parser: 'eml',
      parserVersion: 'email-worker-v1',
      parseStatus: 'parsed',
      normalizedMessageId: 'worker@example.test',
      subject: '검토 요청',
    });
  });

  it('fails closed when a parsed worker response omits normalized message id', () => {
    expect(
      parseEmailWorkerResponse({
        parser: 'eml',
        parser_version: 'email-worker-v1',
        parse_status: 'parsed',
        subject: 'missing id',
      }),
    ).toMatchObject({
      parseStatus: 'failed',
      failureReasonCode: 'MISSING_MESSAGE_ID',
      normalizedMessageId: null,
    });
  });

  it('normalizes verified MSG attachment payloads from the worker response', () => {
    const attachmentBody = Buffer.from('%PDF-1.7\nworker attachment\n%%EOF\n');
    const result = parseEmailWorkerResponse({
      parser: 'msg',
      parser_version: 'email-worker-v1',
      parse_status: 'parsed',
      normalized_message_id: 'msg-worker@example.test',
      subject: 'MSG worker',
      attachments: [
        {
          attachment_index: 0,
          normalized_filename: '../unsafe?.pdf',
          media_type: 'application/pdf',
          size_bytes: attachmentBody.length,
          sha256: sha256Hex(attachmentBody),
          body_base64: attachmentBody.toString('base64'),
        },
        {
          attachment_index: 1,
          normalized_filename: 'tampered.pdf',
          media_type: 'application/pdf',
          size_bytes: attachmentBody.length,
          sha256: '0'.repeat(64),
          body_base64: attachmentBody.toString('base64'),
        },
      ],
    });

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]).toMatchObject({
      attachmentIndex: 0,
      normalizedFilename: 'unsafe_.pdf',
      mediaType: 'application/pdf',
      sizeBytes: attachmentBody.length,
      sha256: sha256Hex(attachmentBody),
    });
    expect(result.attachments[0]?.body.equals(attachmentBody)).toBe(true);
  });
});
