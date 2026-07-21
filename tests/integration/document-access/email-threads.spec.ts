import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import { createAppClient, setTenant, tenantAlphaId, withClient } from '../helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

function emailMessageIdHash(value: string): string {
  return createHash('sha256').update('email-message-id').update('\0').update(value).digest('hex');
}

async function login(
  baseUrl: string,
  input: { tenantId: string; email: string; password: string },
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Email Thread Client ${randomUUID()}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(baseUrl: string, cookie: string, clientId: string) {
  const matterCode = `EMAIL-THREAD-${randomUUID()}`;
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode,
      matterName: `Email Thread ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
      intakeTemplateCode: 'default_open',
      metadata: { domain: 'sender.example' },
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return { matterId: (JSON.parse(body) as { matterId: string }).matterId };
}

function threadEmailUploadForm(input: {
  messageId: string;
  references?: readonly string[];
  subject?: string;
}): FormData {
  const eml = [
    'From: Sender <sender@sender.example>',
    'To: Internal <internal@amic.test>',
    `Message-ID: <${input.messageId}>`,
    input.references?.length ? `References: ${input.references.map((ref) => `<${ref}>`).join(' ')}` : null,
    'Date: Fri, 12 Jun 2026 10:15:30 +0900',
    `Subject: ${input.subject ?? 'Thread filing'}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'thread body must stay out of audit metadata',
  ]
    .filter((line): line is string => line !== null)
    .join('\r\n');
  const form = new FormData();
  form.append('file', new Blob([Buffer.from(eml)], { type: 'message/rfc822' }), 'thread.eml');
  return form;
}

async function seedTenantEmailDomain(): Promise<void> {
  await withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    await client.query(
      `
        INSERT INTO tenant_email_domains (tenant_id, domain_ref)
        VALUES ($1, 'amic.test')
        ON CONFLICT (tenant_id, domain_ref) DO NOTHING
      `,
      [tenantAlphaId],
    );
  });
}

async function emailThreadRows(emailIds: readonly string[]): Promise<
  Array<{
    email_id: string;
    thread_id: string | null;
    message_id_hash: string;
    references_json: readonly string[];
  }>
> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      email_id: string;
      thread_id: string | null;
      message_id_hash: string;
      references_json: readonly string[];
    }>(
      `
        SELECT email_id, thread_id, message_id_hash, references_json
        FROM email_messages
        WHERE tenant_id = $1
          AND email_id = ANY($2::uuid[])
        ORDER BY created_at ASC, email_id ASC
      `,
      [tenantAlphaId, emailIds],
    );
    return result.rows;
  });
}

describe('email thread filing integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;
  let clientId: string;
  let previousIngestionWorkerUrl: string | undefined;

  beforeAll(async () => {
    previousIngestionWorkerUrl = process.env.INGESTION_WORKER_URL;
    process.env.INGESTION_WORKER_URL = 'http://127.0.0.1:9';
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    memberCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
    await seedTenantEmailDomain();
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
    if (previousIngestionWorkerUrl === undefined) {
      delete process.env.INGESTION_WORKER_URL;
    } else {
      process.env.INGESTION_WORKER_URL = previousIngestionWorkerUrl;
    }
  });

  it('groups shuffled uploaded replies and files the stored thread as one unit', async () => {
    const { matterId } = await createMatter(baseUrl, ownerCookie, clientId);
    const rootMessageId = `${randomUUID()}@thread.example.test`;
    const replyOneMessageId = `${randomUUID()}@thread.example.test`;
    const replyTwoMessageId = `${randomUUID()}@thread.example.test`;

    const replyTwo = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: threadEmailUploadForm({
        messageId: replyTwoMessageId,
        references: [rootMessageId, replyOneMessageId],
        subject: 'Thread second reply',
      }),
    });
    const replyTwoBody = (await replyTwo.json()) as { email: { emailId: string } };
    expect(replyTwo.status, JSON.stringify(replyTwoBody)).toBe(201);

    const replyOne = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: threadEmailUploadForm({
        messageId: replyOneMessageId,
        references: [rootMessageId],
        subject: 'Thread first reply',
      }),
    });
    const replyOneBody = (await replyOne.json()) as { email: { emailId: string } };
    expect(replyOne.status, JSON.stringify(replyOneBody)).toBe(201);

    const root = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: threadEmailUploadForm({
        messageId: rootMessageId,
        subject: 'Thread root',
      }),
    });
    const rootBody = (await root.json()) as { email: { emailId: string } };
    expect(root.status, JSON.stringify(rootBody)).toBe(201);

    const rows = await emailThreadRows([
      rootBody.email.emailId,
      replyOneBody.email.emailId,
      replyTwoBody.email.emailId,
    ]);
    expect(rows).toHaveLength(3);
    expect([...new Set(rows.map((row) => row.thread_id))]).toHaveLength(1);
    expect(rows.every((row) => row.thread_id !== null)).toBe(true);
    expect(rows.find((row) => row.email_id === rootBody.email.emailId)).toMatchObject({
      message_id_hash: emailMessageIdHash(rootMessageId),
    });
    expect(rows.find((row) => row.email_id === replyOneBody.email.emailId)).toMatchObject({
      message_id_hash: emailMessageIdHash(replyOneMessageId),
      references_json: [emailMessageIdHash(rootMessageId)],
    });
    expect(rows.find((row) => row.email_id === replyTwoBody.email.emailId)).toMatchObject({
      message_id_hash: emailMessageIdHash(replyTwoMessageId),
      references_json: [emailMessageIdHash(rootMessageId), emailMessageIdHash(replyOneMessageId)],
    });

    const threadId = rows[0]?.thread_id;
    expect(threadId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    if (!threadId) throw new Error('missing email thread id');

    const timeline = await fetch(`${baseUrl}/v1/matters/${matterId}/email-timeline`, {
      headers: { cookie: ownerCookie },
    });
    const timelineBody = (await timeline.json()) as {
      items: Array<{ emailId: string; thread: { threadId: string | null } }>;
      threads: Array<{ threadId: string | null; filedEmailCount: number; items: Array<{ emailId: string }> }>;
    };
    expect(timeline.status, JSON.stringify(timelineBody)).toBe(200);
    expect(timelineBody.items).toHaveLength(3);
    expect(timelineBody.threads).toHaveLength(1);
    expect(timelineBody.threads[0]).toMatchObject({
      threadId,
      filedEmailCount: 3,
    });
    expect(timelineBody.threads[0]?.items.map((item) => item.emailId).sort()).toEqual(
      [rootBody.email.emailId, replyOneBody.email.emailId, replyTwoBody.email.emailId].sort(),
    );

    const deniedBulk = await fetch(`${baseUrl}/v1/email-threads/${threadId}/file`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterId }),
    });
    expect(deniedBulk.status, await deniedBulk.text()).toBe(403);

    const bulk = await fetch(`${baseUrl}/v1/email-threads/${threadId}/file`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterId }),
    });
    const bulkBody = (await bulk.json()) as {
      threads: Array<{ threadId: string | null; filedEmailCount: number }>;
    };
    expect(bulk.status, JSON.stringify(bulkBody)).toBe(201);
    expect(bulkBody.threads).toEqual([
      expect.objectContaining({
        threadId,
        filedEmailCount: 3,
      }),
    ]);
  });
});
