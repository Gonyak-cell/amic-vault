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

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

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
    body: JSON.stringify({
      name: `Email Suggestion Client ${randomUUID()}`,
      metadata: { domain: 'sender.example' },
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(baseUrl: string, cookie: string, clientId: string) {
  const matterCode = `EMAIL-SUG-${randomUUID()}`;
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode,
      matterName: `Email Suggestion ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
      intakeTemplateCode: 'default_open',
      metadata: { domain: 'sender.example' },
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return { matterCode, matterId: (JSON.parse(body) as { matterId: string }).matterId };
}

function threadEmailUploadForm(input: { messageId: string; subject?: string }): FormData {
  const eml = [
    'From: Sender <sender@sender.example>',
    'To: Internal <internal@amic.test>',
    `Message-ID: <${input.messageId}>`,
    'Date: Fri, 12 Jun 2026 10:15:30 +0900',
    `Subject: ${input.subject ?? 'Thread filing'}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'thread seed body must stay out of audit metadata',
  ].join('\r\n');
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

async function threadIdForEmail(emailId: string): Promise<string> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{ thread_id: string | null }>(
      `
        SELECT thread_id
        FROM email_messages
        WHERE tenant_id = $1
          AND email_id = $2
        LIMIT 1
      `,
      [tenantAlphaId, emailId],
    );
    const threadId = result.rows[0]?.thread_id;
    expect(threadId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    if (!threadId) throw new Error('missing seeded email thread id');
    return threadId;
  });
}

async function insertUnfiledEmailInThread(input: {
  threadId: string;
  rootMessageId: string;
  replyMessageId: string;
  subject: string;
}): Promise<string> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const emailId = randomUUID();
    const fileObjectId = randomUUID();
    const raw = Buffer.from(`Message-ID: <${input.replyMessageId}>\r\nSubject: ${input.subject}`);
    await client.query(
      `
        INSERT INTO file_objects (
          file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
          mime_type, size_bytes, sha256, encryption_key_id, source_system, created_by
        )
        VALUES ($1, $2, $3, 'autofile-reply.eml', 'autofile-reply.eml',
          'message/rfc822', $4, $5, NULL, 'email_ingest', $6)
      `,
      [
        fileObjectId,
        tenantAlphaId,
        `s3://amic-vault-dev/tenants/${tenantAlphaId}/emails/${emailId}/raw/${fileObjectId}`,
        raw.length,
        sha256Hex(raw),
        alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO email_messages (
          email_id, tenant_id, raw_file_object_id, message_id_hash, parser,
          parse_status, failure_reason_code, subject, sent_at, references_json,
          has_outside_participants, raw_sha256, raw_size_bytes, created_by, thread_id
        )
        VALUES ($1, $2, $3, $4, 'eml', 'parsed', NULL, $5, now(), $6::jsonb,
          true, $7, $8, $9, $10)
      `,
      [
        emailId,
        tenantAlphaId,
        fileObjectId,
        emailMessageIdHash(input.replyMessageId),
        input.subject,
        JSON.stringify([emailMessageIdHash(input.rootMessageId)]),
        sha256Hex(raw),
        raw.length,
        alphaOwnerUserId,
        input.threadId,
      ],
    );
    await client.query(
      `
        INSERT INTO email_participants (
          tenant_id, email_id, role, address_hash, domain_ref, display_name,
          is_outside, participant_class
        )
        VALUES
          ($1, $2, 'from', $3, 'sender.example', 'Sender', true, 'client'),
          ($1, $2, 'to', $4, 'amic.test', 'Internal', false, 'internal')
      `,
      [
        tenantAlphaId,
        emailId,
        sha256Hex(`sender:${emailId}`),
        sha256Hex(`internal:${emailId}`),
      ],
    );
    return emailId;
  });
}

async function suggestionEvidence(emailId: string, matterId: string): Promise<{
  filingCount: string;
  acceptedFeedbackCount: string;
  undoneFeedbackCount: string;
  notificationCount: string;
  autofileAuditCount: string;
  acceptedFeedbackAuditCount: string;
  revertedAuditCount: string;
  undoneFeedbackAuditCount: string;
  unsafeAuditMetadataCount: string;
}> {
  return withClient(createAppClient(), async (client) => {
    await setTenant(client, tenantAlphaId);
    const result = await client.query<{
      filing_count: string;
      accepted_feedback_count: string;
      undone_feedback_count: string;
      notification_count: string;
      autofile_audit_count: string;
      accepted_feedback_audit_count: string;
      reverted_audit_count: string;
      undone_feedback_audit_count: string;
      unsafe_audit_metadata_count: string;
    }>(
      `
        SELECT
          (
            SELECT count(*)::text
            FROM email_matter_filings
            WHERE tenant_id = $1 AND email_id = $2 AND matter_id = $3
          ) AS filing_count,
          (
            SELECT count(*)::text
            FROM email_suggestion_feedback
            WHERE tenant_id = $1 AND email_id = $2 AND suggested_matter_id = $3
              AND selected_matter_id = $3 AND action = 'accepted'
              AND confidence_band = 'auto_file'
          ) AS accepted_feedback_count,
          (
            SELECT count(*)::text
            FROM email_suggestion_feedback
            WHERE tenant_id = $1 AND email_id = $2 AND suggested_matter_id = $3
              AND selected_matter_id IS NULL AND action = 'undone'
          ) AS undone_feedback_count,
          (
            SELECT count(*)::text
            FROM notifications
            WHERE tenant_id = $1 AND kind = 'email_autofile_completed'
              AND target_type = 'email' AND target_id = $2 AND matter_id = $3
          ) AS notification_count,
          (
            SELECT count(*)::text
            FROM audit_events
            WHERE tenant_id = $1 AND action = 'EMAIL_SUGGESTION_AUTOFILED'
              AND target_id = $2 AND matter_id = $3
              AND metadata_json->>'confidence_band' = 'auto_file'
          ) AS autofile_audit_count,
          (
            SELECT count(*)::text
            FROM audit_events
            WHERE tenant_id = $1 AND action = 'EMAIL_SUGGESTION_FEEDBACK_RECORDED'
              AND target_id = $2 AND matter_id = $3
              AND metadata_json->>'feedback_action' = 'accepted'
          ) AS accepted_feedback_audit_count,
          (
            SELECT count(*)::text
            FROM audit_events
            WHERE tenant_id = $1 AND action = 'EMAIL_FILING_REVERTED'
              AND target_id = $2 AND matter_id = $3
          ) AS reverted_audit_count,
          (
            SELECT count(*)::text
            FROM audit_events
            WHERE tenant_id = $1 AND action = 'EMAIL_SUGGESTION_FEEDBACK_RECORDED'
              AND target_id = $2 AND matter_id = $3
              AND metadata_json->>'feedback_action' = 'undone'
          ) AS undone_feedback_audit_count,
          (
            SELECT count(*)::text
            FROM audit_events
            WHERE tenant_id = $1 AND target_id = $2
              AND metadata_json::text LIKE '%autofile seeded root%'
          ) AS unsafe_audit_metadata_count
      `,
      [tenantAlphaId, emailId, matterId],
    );
    const row = result.rows[0];
    return {
      filingCount: row?.filing_count ?? '0',
      acceptedFeedbackCount: row?.accepted_feedback_count ?? '0',
      undoneFeedbackCount: row?.undone_feedback_count ?? '0',
      notificationCount: row?.notification_count ?? '0',
      autofileAuditCount: row?.autofile_audit_count ?? '0',
      acceptedFeedbackAuditCount: row?.accepted_feedback_audit_count ?? '0',
      revertedAuditCount: row?.reverted_audit_count ?? '0',
      undoneFeedbackAuditCount: row?.undone_feedback_audit_count ?? '0',
      unsafeAuditMetadataCount: row?.unsafe_audit_metadata_count ?? '0',
    };
  });
}

describe('email suggestion integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
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

  it('auto-files a high-confidence thread suggestion and records undo evidence', async () => {
    const { matterCode, matterId } = await createMatter(baseUrl, ownerCookie, clientId);
    const rootMessageId = `${randomUUID()}@suggestion.example.test`;
    const root = await fetch(`${baseUrl}/v1/matters/${matterId}/emails`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: threadEmailUploadForm({
        messageId: rootMessageId,
        subject: `autofile seeded root ${matterCode}`,
      }),
    });
    const rootBody = (await root.json()) as { email: { emailId: string } };
    expect(root.status, JSON.stringify(rootBody)).toBe(201);
    const threadId = await threadIdForEmail(rootBody.email.emailId);
    const replyMessageId = `${randomUUID()}@suggestion.example.test`;
    const replyEmailId = await insertUnfiledEmailInThread({
      threadId,
      rootMessageId,
      replyMessageId,
      subject: `autofile follow-up ${matterCode}`,
    });

    const suggestions = await fetch(`${baseUrl}/v1/emails/${replyEmailId}/matter-suggestions`, {
      headers: { cookie: ownerCookie },
    });
    const suggestionBody = (await suggestions.json()) as {
      items: Array<{
        matterId: string;
        reasonCodes: string[];
        confidence: number;
        confidenceBand: string;
      }>;
    };
    expect(suggestions.status, JSON.stringify(suggestionBody)).toBe(200);
    expect(suggestionBody.items[0]).toMatchObject({
      matterId,
      reasonCodes: expect.arrayContaining(['thread']),
      confidenceBand: 'auto_file',
    });
    expect(suggestionBody.items[0]?.confidence ?? 0).toBeGreaterThanOrEqual(95);
    await expect(suggestionEvidence(replyEmailId, matterId)).resolves.toMatchObject({
      filingCount: '1',
      acceptedFeedbackCount: '1',
      notificationCount: '1',
      autofileAuditCount: '1',
      acceptedFeedbackAuditCount: '1',
      unsafeAuditMetadataCount: '0',
    });

    const undo = await fetch(`${baseUrl}/v1/emails/${replyEmailId}/autofile/undo`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterId }),
    });
    const undoBody = (await undo.json()) as {
      items: Array<{ emailId: string }>;
    };
    expect(undo.status, JSON.stringify(undoBody)).toBe(201);
    expect(undoBody.items.map((item) => item.emailId)).not.toContain(replyEmailId);
    await expect(suggestionEvidence(replyEmailId, matterId)).resolves.toMatchObject({
      filingCount: '0',
      acceptedFeedbackCount: '1',
      undoneFeedbackCount: '1',
      notificationCount: '1',
      autofileAuditCount: '1',
      acceptedFeedbackAuditCount: '1',
      revertedAuditCount: '1',
      undoneFeedbackAuditCount: '1',
      unsafeAuditMetadataCount: '0',
    });
  });
});
