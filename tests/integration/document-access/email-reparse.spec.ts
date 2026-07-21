import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { EmailReparseService } from '../../../apps/api/src/modules/email/email-reparse.service';
import { EmailService } from '../../../apps/api/src/modules/email/email.service';
import { StorageService } from '../../../apps/api/src/modules/storage/storage.service';
import { createOwnerClient, setTenant, tenantAlphaId, withClient } from '../helpers/db';

const actorUserId = '11111111-1111-4111-8111-111111111101';

interface EmailEvidenceRow {
  subject: string | null;
  parser_version: string;
  parse_status: string;
  failure_reason_code: string | null;
  message_id_hash: string;
  raw_file_object_id: string;
  storage_uri: string;
  link_count: string;
}

function fetchUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function readEmailEvidence(emailId: string): Promise<EmailEvidenceRow> {
  return withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<EmailEvidenceRow>(
      `
        SELECT e.subject, e.parser_version, e.message_id_hash, e.raw_file_object_id,
          e.parse_status, e.failure_reason_code, f.storage_uri,
          (
            SELECT count(*)::text
            FROM email_document_links l
            WHERE l.tenant_id = e.tenant_id
              AND l.email_id = e.email_id
          ) AS link_count
        FROM email_messages e
        JOIN file_objects f
          ON f.tenant_id = e.tenant_id
         AND f.file_object_id = e.raw_file_object_id
        WHERE e.tenant_id = $1
          AND e.email_id = $2
        LIMIT 1
      `,
      [tenantAlphaId, emailId],
    );
    const row = result.rows[0];
    expect(row).toBeDefined();
    return row;
  });
}

async function markLegacyBrokenSubject(emailId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        UPDATE email_messages
        SET subject = $3,
          parser_version = 'email-api-legacy-v1'
        WHERE tenant_id = $1
          AND email_id = $2
      `,
      [tenantAlphaId, emailId, '=?EUC-KR?B?sMvF5CC/5MO7?='],
    );
  });
}

async function markLegacyPendingUnsupportedMsg(emailId: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        UPDATE email_messages
        SET parser = 'msg',
          parse_status = 'pending_unsupported',
          failure_reason_code = 'UNSUPPORTED_MSG',
          subject = NULL,
          parser_version = 'email-api-legacy-v1'
        WHERE tenant_id = $1
          AND email_id = $2
      `,
      [tenantAlphaId, emailId],
    );
  });
}

describe('email reparse integration', () => {
  let app: INestApplicationContext;
  let emailService: EmailService;
  let reparseService: EmailReparseService;
  let storageService: StorageService;
  let previousQueueEnabled: string | undefined;
  const storageUris: string[] = [];

  beforeAll(async () => {
    previousQueueEnabled = process.env.EMAIL_REPARSE_QUEUE_WORKER_ENABLED;
    process.env.EMAIL_REPARSE_QUEUE_WORKER_ENABLED = 'false';
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    emailService = app.get(EmailService, { strict: false });
    reparseService = app.get(EmailReparseService, { strict: false });
    storageService = app.get(StorageService, { strict: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    for (const storageUri of storageUris) {
      await storageService.deleteByStorageUri(tenantAlphaId, storageUri).catch(() => undefined);
    }
    await app.close();
    if (previousQueueEnabled === undefined) {
      delete process.env.EMAIL_REPARSE_QUEUE_WORKER_ENABLED;
    } else {
      process.env.EMAIL_REPARSE_QUEUE_WORKER_ENABLED = previousQueueEnabled;
    }
  });

  it('reparses a legacy broken subject row while preserving hash and link cardinality', async () => {
    const normalizedMessageId = `${randomUUID()}@example.test`;
    const realFetch = globalThis.fetch;
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        if (!fetchUrl(input).endsWith('/email/parse')) return realFetch(input, init);
        return new Response(
          JSON.stringify({
            parser: 'eml',
            parser_version: 'email-worker-v1',
            parse_status: 'parsed',
            normalized_message_id: normalizedMessageId,
            subject: '검토 요청',
            sent_at: null,
            received_at: null,
            metadata_warning_code: null,
            references: [],
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
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const imported = await emailService.importRawEmail({
      tenantId: tenantAlphaId,
      actorUserId,
      originalFilename: 'legacy-korean.eml',
      body: Buffer.from(
        [
          'From: Sender <sender@example.test>',
          'To: Internal <internal@amic.test>',
          `Message-ID: <${normalizedMessageId}>`,
          'Subject: =?EUC-KR?B?sMvF5CC/5MO7?=',
          '',
          'raw body must not appear in audit metadata',
        ].join('\r\n'),
        'latin1',
      ),
    });
    const before = await readEmailEvidence(imported.emailId);
    storageUris.push(before.storage_uri);
    await markLegacyBrokenSubject(imported.emailId);
    const legacy = await readEmailEvidence(imported.emailId);
    expect(legacy.subject).toBe('=?EUC-KR?B?sMvF5CC/5MO7?=');

    await expect(
      reparseService.reparseEmail({
        tenantId: tenantAlphaId,
        actorUserId,
        emailId: imported.emailId,
      }),
    ).resolves.toMatchObject({
      status: 'reparsed',
      parserVersionBefore: 'email-api-legacy-v1',
      parserVersionAfter: 'email-worker-v1',
    });

    const after = await readEmailEvidence(imported.emailId);
    expect(after.subject).toBe('검토 요청');
    expect(after.parser_version).toBe('email-worker-v1');
    expect(after.message_id_hash).toBe(before.message_id_hash);
    expect(after.raw_file_object_id).toBe(before.raw_file_object_id);
    expect(after.link_count).toBe(before.link_count);
    const workerParseCalls = fetchMock.mock.calls.filter(([input]) =>
      fetchUrl(input).endsWith('/email/parse'),
    );
    expect(workerParseCalls).toHaveLength(2);
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const audit = await client.query<{ count: string; unsafe: string }>(
        `
          SELECT count(*)::text AS count,
            count(*) FILTER (
              WHERE metadata_json::text LIKE $3
                OR metadata_json::text LIKE '%raw body must not appear%'
            )::text AS unsafe
          FROM audit_events
          WHERE tenant_id = $1
            AND action = 'EMAIL_METADATA_UPDATED'
            AND target_id = $2
            AND metadata_json->>'before_ref' = 'parser_version:email-api-legacy-v1'
            AND metadata_json->>'after_ref' = 'parser_version:email-worker-v1'
        `,
        [tenantAlphaId, imported.emailId, `%${normalizedMessageId}%`],
      );
      expect(audit.rows[0]).toMatchObject({ count: '1', unsafe: '0' });
    });
  });

  it('reparses a pending unsupported MSG row into parsed worker metadata', async () => {
    const normalizedMessageId = `${randomUUID()}@example.test`;
    let parseCallCount = 0;
    const realFetch = globalThis.fetch;
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        if (!fetchUrl(input).endsWith('/email/parse')) return realFetch(input, init);
        parseCallCount += 1;
        if (parseCallCount === 1) {
          return new Response(
            JSON.stringify({
              parser: 'msg',
              parser_version: 'email-worker-v1',
              parse_status: 'pending_unsupported',
              failure_reason_code: 'UNSUPPORTED_MSG',
              normalized_message_id: null,
              subject: null,
              sent_at: null,
              received_at: null,
              metadata_warning_code: null,
              references: [],
              participants: [],
              attachments: [],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            parser: 'msg',
            parser_version: 'email-worker-v1',
            parse_status: 'parsed',
            normalized_message_id: normalizedMessageId,
            subject: 'MSG 재파싱 완료',
            sent_at: '2026-06-12T10:15:30+09:00',
            received_at: null,
            metadata_warning_code: null,
            references: ['thread-msg-reparse@example.test'],
            participants: [
              {
                role: 'from',
                normalized_address: 'sender@example.test',
                domain_ref: 'example.test',
                display_name: 'Sender',
              },
              {
                role: 'to',
                normalized_address: 'internal@amic.test',
                domain_ref: 'amic.test',
                display_name: 'Internal',
              },
            ],
            attachments: [],
            failure_reason_code: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const imported = await emailService.importRawEmail({
      tenantId: tenantAlphaId,
      actorUserId,
      originalFilename: 'legacy-outlook.msg',
      mimeType: 'application/vnd.ms-outlook',
      body: Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.from(randomUUID())]),
    });
    const before = await readEmailEvidence(imported.emailId);
    storageUris.push(before.storage_uri);
    await markLegacyPendingUnsupportedMsg(imported.emailId);
    const legacy = await readEmailEvidence(imported.emailId);
    expect(legacy).toMatchObject({
      subject: null,
      parser_version: 'email-api-legacy-v1',
      parse_status: 'pending_unsupported',
      failure_reason_code: 'UNSUPPORTED_MSG',
    });

    await expect(
      reparseService.reparseEmail({
        tenantId: tenantAlphaId,
        actorUserId,
        emailId: imported.emailId,
      }),
    ).resolves.toMatchObject({
      status: 'reparsed',
      parserVersionBefore: 'email-api-legacy-v1',
      parserVersionAfter: 'email-worker-v1',
    });

    const after = await readEmailEvidence(imported.emailId);
    expect(after).toMatchObject({
      subject: 'MSG 재파싱 완료',
      parser_version: 'email-worker-v1',
      parse_status: 'parsed',
      failure_reason_code: null,
      message_id_hash: before.message_id_hash,
      raw_file_object_id: before.raw_file_object_id,
      link_count: before.link_count,
    });
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const participants = await client.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM email_participants
          WHERE tenant_id = $1
            AND email_id = $2
        `,
        [tenantAlphaId, imported.emailId],
      );
      expect(participants.rows[0]?.count).toBe('2');
    });
    expect(fetchMock.mock.calls.filter(([input]) => fetchUrl(input).endsWith('/email/parse'))).toHaveLength(
      2,
    );
  });
});
